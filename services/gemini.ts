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
    throw new Error("Quota Exceeded (Limit Hit). Switching AI models might help.");
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
  retries: number = 5,
  delay: number = 4000
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
        return true;
      }
      return true;
    } catch (e) {
      console.error("Error in API Key selection flow:", e);
      return false;
    }
  }
  return true;
};

// --- IMAGEN FALLBACK ---
const generateWithImagen = async (prompt: string, aspectRatio: AspectRatio): Promise<string[]> => {
  const ai = getClient();
  
  // Map to Imagen supported ratios
  let ar = '1:1';
  switch(aspectRatio) {
    case AspectRatio.SQUARE: ar = '1:1'; break;
    case AspectRatio.PORTRAIT_2_3: ar = '3:4'; break; 
    case AspectRatio.LANDSCAPE_3_2: ar = '4:3'; break;
    case AspectRatio.PORTRAIT_3_4: ar = '3:4'; break;
    case AspectRatio.LANDSCAPE_4_3: ar = '4:3'; break;
    case AspectRatio.PORTRAIT_9_16: ar = '9:16'; break;
    case AspectRatio.LANDSCAPE_16_9: ar = '16:9'; break;
    case AspectRatio.CINEMATIC_21_9: ar = '16:9'; break;
    default: ar = '1:1';
  }

  console.log("Attempting generation with Imagen 3 fallback...");
  const response = await ai.models.generateImages({
    model: 'imagen-3.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: ar,
      outputMimeType: 'image/jpeg'
    }
  });

  // @ts-ignore - SDK types might vary slightly, mapping manually
  const generatedImages = (response as any).generatedImages || [];
  
  return generatedImages.map((img: any) => 
    `data:image/jpeg;base64,${img.image.imageBytes}`
  );
};

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  useProModel: boolean = true
): Promise<{images: string[], usedFallback: boolean}> => {
  const ai = getClient();
  const modelName = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const imageConfig: any = { aspectRatio: aspectRatio };
  if (useProModel) {
    const apiResolution = resolution === ImageResolution.RES_8K ? '4K' : resolution;
    imageConfig.imageSize = apiResolution;
  }

  const finalPrompt = resolution === ImageResolution.RES_8K && useProModel
    ? `${prompt} (Highly detailed 8K resolution masterpiece, ultra-sharp)` 
    : prompt;

  try {
    // 1. Try Gemini
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: finalPrompt }] },
      config: { imageConfig: imageConfig }
    }));

    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    
    if (images.length > 0) return { images, usedFallback: false };
    throw new Error("Gemini returned no images");

  } catch (geminiError: any) {
    // 2. Fallback to Imagen 3 if Quota/Permission issue
    const errStr = geminiError.toString().toLowerCase();
    if (errStr.includes('429') || errStr.includes('403') || errStr.includes('quota') || errStr.includes('permission')) {
      try {
        const imagenImages = await generateWithImagen(prompt, aspectRatio);
        if (imagenImages.length > 0) {
          return { images: imagenImages, usedFallback: true };
        }
      } catch (imagenError) {
        console.error("Imagen fallback also failed", imagenError);
        // Throw original error to explain why the primary failed
        handleGeminiError(geminiError);
      }
    }
    
    handleGeminiError(geminiError);
    return { images: [], usedFallback: false };
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
    ? `Adjust aspect ratio to ${aspectRatio}. Fill new areas naturally (outpainting).` 
    : `Maintain aspect ratio.`;
  
  const masterPrompt = `[MODE: Gemini 2.5 Flash Image] Instructions: ${userPrompt}. 1. Remove/Edit object. 2. Match lighting. 3. ${arInstruction}. 4. High quality output.`;

  try {
    // Image editing doesn't have a clean Imagen fallback in this SDK version
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: cleanBase64, mimeType: mimeType } },
          { text: masterPrompt }
        ]
      },
      config: aspectRatio ? { imageConfig: { aspectRatio: aspectRatio } } : {}
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
    return null;
  }
};

export const sendChatMessage = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  mode: 'fast' | 'thinking'
): Promise<{ stream: AsyncGenerator<GenerateContentResponse, void, unknown>, usedFallback: boolean }> => {
  const ai = getClient();
  
  const attemptChat = async (model: string, config: any) => {
    const chat = ai.chats.create({ model, history, config });
    return chat.sendMessageStream({ message });
  };

  try {
    // Primary attempt
    const model = mode === 'thinking' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash-lite';
    const config = mode === 'thinking' ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
    
    const stream = await attemptChat(model, config);
    return { stream, usedFallback: false };

  } catch (error: any) {
    // Fallback attempt for Thinking mode -> Fast mode
    if (mode === 'thinking') {
        console.warn("Thinking mode failed, falling back to Flash Lite...");
        try {
            const fallbackStream = await attemptChat('gemini-2.5-flash-lite', {});
            return { stream: fallbackStream, usedFallback: true };
        } catch (fallbackError) {
            throw error; // Throw original
        }
    }
    throw error;
  }
};
