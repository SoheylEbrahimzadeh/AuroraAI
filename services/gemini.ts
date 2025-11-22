import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AspectRatio, ImageResolution } from "../types";

const getClient = () => {
  // Robust check for API Key availability
  let apiKey = '';
  try {
    apiKey = process.env.API_KEY || '';
  } catch (e) {
    // process is not defined in some environments
  }

  if (!apiKey) {
    console.warn("API Key is missing in process.env.API_KEY");
    // We throw here to ensure the UI catches it
    throw new Error("API Key not found. Please select a key in the toolbar or configure process.env.API_KEY.");
  }

  return new GoogleGenAI({ apiKey });
};

// Centralized error handler for clear user feedback
const handleGeminiError = (error: any) => {
  console.error("Gemini API Error:", error);
  
  const errString = error.toString().toLowerCase();
  const errMessage = error.message?.toLowerCase() || '';
  
  // Check for 403 Permission Denied (Common with Pro models/Billing)
  if (errString.includes('403') || errMessage.includes('permission denied') || errMessage.includes('permission_denied')) {
    throw new Error("Permission Denied (403). Your API key likely lacks access to the 'Pro' model. Please switch to 'Standard' (Flash) mode in Settings.");
  }

  // Check for 429 Quota or generic Quota messages
  if (errString.includes('429') || errMessage.includes('resource exhausted') || errMessage.includes('quota')) {
    throw new Error("Quota Exceeded. You have hit the API rate limit. Please wait a moment and try again.");
  }

  // Check for 400 Bad Request
  if (errString.includes('400') || errMessage.includes('invalid_argument')) {
    throw new Error("Invalid Request. The model may not support this specific resolution or aspect ratio combination.");
  }

  throw error;
};

// Retry Utility: Exponential Backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async <T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 2000
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const errStr = error.toString().toLowerCase();
    const errMsg = error.message?.toLowerCase() || '';
    
    // Retry on 429 (Quota/Rate Limit), 503 (Service Unavailable), or specific Quota text
    const isQuota = errStr.includes('429') || errMsg.includes('resource exhausted') || errMsg.includes('quota');
    const isServerIssue = errStr.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');

    if ((isQuota || isServerIssue) && retries > 0) {
      console.warn(`API Busy/Quota (${errMsg}). Retrying in ${delay}ms... (${retries} attempts left)`);
      await wait(delay);
      return withRetry(operation, retries - 1, delay * 2);
    }
    
    throw error;
  }
};

export const ensureApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio) {
    try {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await win.aistudio.openSelectKey();
        // Return true immediately to handle race conditions where hasSelectedApiKey 
        // might lag behind the UI selection.
        return true;
      }
      return true;
    } catch (e) {
      console.error("Error in API Key selection flow:", e);
      return false;
    }
  }
  // If not in AI Studio, assume environment variable is set
  return true;
};

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  useProModel: boolean = true
): Promise<string[]> => {
  const ai = getClient();
  
  // Select model based on user preference
  const modelName = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  // API Config Logic
  // 'imageSize' is ONLY supported by Gemini 3 Pro. We must omit it for Flash.
  const imageConfig: any = {
    aspectRatio: aspectRatio
  };

  if (useProModel) {
    // Map 8K to 4K as per API limits
    const apiResolution = resolution === ImageResolution.RES_8K ? '4K' : resolution;
    imageConfig.imageSize = apiResolution;
  }

  const finalPrompt = resolution === ImageResolution.RES_8K && useProModel
    ? `${prompt} (Highly detailed 8K resolution masterpiece, ultra-sharp, intricate details)` 
    : prompt;

  try {
    // Wrap generation in retry logic
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: finalPrompt }]
      },
      config: {
        imageConfig: imageConfig
      }
    }));

    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    return images;
  } catch (error: any) {
    handleGeminiError(error);
    return []; // Unreachable
  }
};

export const editImage = async (
  base64Image: string,
  userPrompt: string,
  aspectRatio: AspectRatio | null = null,
  resolution: ImageResolution | null = null,
  mimeType: string = 'image/jpeg'
): Promise<string | null> => {
  const ai = getClient();
  const cleanBase64 = base64Image.split(',')[1] || base64Image;

  const arInstruction = aspectRatio 
    ? `Adjust the output aspect ratio to ${aspectRatio}. If the new ratio is wider or taller than the original, use generative fill to extend the background seamlessly and realistically (outpainting).` 
    : `Maintain the original aspect ratio.`;

  const resInstruction = resolution 
    ? `Ensure the output detail level matches ${resolution} resolution.` 
    : `Output a high-quality image.`;

  // Construct the Master Prompt based on user instruction
  const masterPrompt = `
[MODE: Gemini 2.5 Flash Image]
"Edit the provided image according to the following instructions:

USER INSTRUCTION: ${userPrompt}

1. OBJECT REMOVAL
- Remove the masked/described object or area seamlessly.
- Fill background naturally and match scene lighting and textures.

2. ADDITION (Optional)
- If adding objects, ensure realistic shadows, perspective, and scale.
- Integrate new elements smoothly into the environment.

3. BACKGROUND CONTROL
- Replace / extend / blur background if requested.
- Keep lighting and depth consistent.

4. STYLE
- Preserve clarity, sharpness, and professional look.

5. COLOR & TONE
- Keep natural highlights and tones realistic unless specified otherwise.

6. OUTPUT
- ${resInstruction}
- ${arInstruction}
"`;

  try {
    // Wrap editing in retry logic
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType
            }
          },
          { text: masterPrompt }
        ]
      }
    }));

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    handleGeminiError(error);
    return null; // Unreachable
  }
};

export const sendChatMessage = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  mode: 'fast' | 'thinking'
): Promise<AsyncGenerator<GenerateContentResponse, void, unknown>> => {
  const ai = getClient();
  
  let model = 'gemini-2.5-flash-lite';
  let config: any = {};

  if (mode === 'thinking') {
    model = 'gemini-3-pro-preview';
    config = {
      thinkingConfig: {
        thinkingBudget: 32768
      }
    };
  }

  // Note: Streaming requests are harder to retry transparently mid-stream, 
  // so we do not wrap this in withRetry. Connection issues usually require user intervention.
  const chat = ai.chats.create({
    model: model,
    history: history,
    config: config
  });

  return chat.sendMessageStream({ message });
};