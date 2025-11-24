import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { AspectRatio, ImageResolution } from "../types";

// --- CACHE SYSTEM ---
const responseCache = new Map<string, string[]>();

const getClient = () => {
  let apiKey = '';
  try {
    apiKey = process.env.API_KEY || '';
  } catch (e) {
    // process is not defined
  }

  if (!apiKey) {
    console.warn("API Key is missing in process.env.API_KEY");
    throw new Error("API Key not found. Please select a key in the toolbar or configure process.env.API_KEY.");
  }

  return new GoogleGenAI({ apiKey });
};

// Retry Utility
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
    
    const isQuota = errStr.includes('429') || errMsg.includes('resource exhausted') || errMsg.includes('quota') || errMsg.includes('too many requests');
    const isServerIssue = errStr.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');

    if ((isQuota || isServerIssue) && retries > 0) {
      console.warn(`API Busy/Quota (${errMsg}). Retrying in ${delay}ms...`);
      await wait(delay);
      return withRetry(operation, retries - 1, delay * 1.5);
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

// --- FALLBACK HELPERS ---

const generateWithImagen = async (prompt: string, aspectRatio: AspectRatio): Promise<string[]> => {
  const ai = getClient();
  let ar = '1:1';
  // Map Aspect Ratio for Imagen
  switch(aspectRatio) {
    case AspectRatio.SQUARE: ar = '1:1'; break;
    case AspectRatio.PORTRAIT_2_3: ar = '3:4'; break; 
    case AspectRatio.LANDSCAPE_3_2: ar = '4:3'; break;
    case AspectRatio.PORTRAIT_3_4: ar = '3:4'; break;
    case AspectRatio.LANDSCAPE_4_3: ar = '4:3'; break;
    case AspectRatio.PORTRAIT_9_16: ar = '9:16'; break;
    case AspectRatio.LANDSCAPE_16_9: ar = '16:9'; break;
    default: ar = '1:1';
  }

  console.log("Fallback: Imagen 3...");
  // Wrap Imagen in withRetry to handle network blips or temporary 429s
  const response = await withRetry(() => ai.models.generateImages({
    model: 'imagen-3.0-generate-001',
    prompt: prompt,
    config: { numberOfImages: 1, aspectRatio: ar, outputMimeType: 'image/jpeg' }
  }));

  const generatedImages = (response as any).generatedImages || [];
  return generatedImages.map((img: any) => `data:image/jpeg;base64,${img.image.imageBytes}`);
};

const generateWithGemini2 = async (prompt: string, aspectRatio: AspectRatio): Promise<string[]> => {
   const ai = getClient();
   console.log("Fallback: Gemini 2.0 Flash Exp...");
   // Gemini 2.0 Flash Exp often has a separate quota bucket
   const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', 
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: aspectRatio } }
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
};

// --- SYNTHETIC EDIT (DESCRIBE + GENERATE) ---
const syntheticEditWithImagen = async (
    base64Images: string[], // Accepts multiple images
    userPrompt: string, 
    aspectRatio: AspectRatio
): Promise<string | null> => {
    const ai = getClient();
    console.log("Attempting Synthetic Edit (Describe + Generate)...");

    try {
        // 1. Describe what the image SHOULD look like
        const descriptionPrompt = `I have attached ${base64Images.length} image(s). I want to process them with this instruction: "${userPrompt}".
        Describe exactly what the resulting merged/edited image should look like in great detail so I can generate it with an AI.
        Include details about composition, lighting, style, and how the images are combined. Focus on the visual result.`;

        // Create parts for description request
        const descriptionParts: any[] = [];
        for (const img of base64Images) {
             const clean = img.split(',')[1] || img;
             let mime = 'image/jpeg';
             if (img.startsWith('data:image/png')) mime = 'image/png';
             else if (img.startsWith('data:image/webp')) mime = 'image/webp';
             descriptionParts.push({ inlineData: { data: clean, mimeType: mime } });
        }
        descriptionParts.push({ text: descriptionPrompt });

        let newPrompt = "";

        // Attempt 1: Describe with Flash 2.5
        try {
            const descResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash', // Use text/vision model
                contents: { parts: descriptionParts }
            }));
            newPrompt = descResponse.text || "";
        } catch (e) {
             console.warn("Synthetic Edit: Flash 2.5 description failed. Trying Gemini 2.0 Exp...");
             // Attempt 2: Describe with Flash 2.0 Exp
             try {
                const descResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-2.0-flash-exp',
                    contents: { parts: descriptionParts }
                }));
                newPrompt = descResponse.text || "";
             } catch (e2) {
                 // Attempt 3: Flash 1.5 (Legacy/High Quota)
                 try {
                     const descResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                        model: 'gemini-1.5-flash',
                        contents: { parts: descriptionParts }
                    }));
                    newPrompt = descResponse.text || "";
                 } catch(e3) {
                     console.error("Synthetic Edit: All description attempts failed.");
                     return null;
                 }
             }
        }

        if (!newPrompt) throw new Error("Could not describe image for synthetic edit");

        console.log("Synthetic Prompt Generated:", newPrompt.substring(0, 50) + "...");

        // 2. Generate with Imagen using the description
        try {
             const images = await generateWithImagen(newPrompt, aspectRatio || AspectRatio.SQUARE);
             if (images.length > 0) return images[0];
        } catch (e) {
             console.warn("Synthetic Edit: Imagen generation failed. Trying Gemini 2.0 Exp...");
        }

        // 3. Fallback Generate with Gemini 2.0 Exp
        try {
             const images = await generateWithGemini2(newPrompt, aspectRatio || AspectRatio.SQUARE);
             if (images.length > 0) return images[0];
        } catch (e) {
             console.warn("Synthetic Edit: Gemini 2.0 Exp generation failed.");
        }

        return null;

    } catch (e) {
        console.warn("Synthetic edit completely failed", e);
        return null;
    }
};


// --- MAIN GENERATION ---

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  useProModel: boolean = true
): Promise<{images: string[], usedFallback: boolean, modelUsed: string}> => {
  
  // Cache Check
  const cacheKey = `${prompt}-${aspectRatio}-${resolution}-${useProModel}`;
  if (responseCache.has(cacheKey)) {
    return { images: responseCache.get(cacheKey)!, usedFallback: false, modelUsed: 'Cache' };
  }

  const ai = getClient();
  const preferredModel = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  // Logic to try models in sequence
  const tryModel = async (modelName: string): Promise<string[]> => {
    const config: any = { imageConfig: { aspectRatio: aspectRatio } };
    // Only Pro supports resolution
    if (modelName.includes('pro')) {
         const apiResolution = resolution === ImageResolution.RES_8K ? '4K' : resolution;
         config.imageConfig.imageSize = apiResolution;
    }

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] },
      config: config
    }));

    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    if (images.length === 0) throw new Error("No image in response");
    return images;
  };

  // --- WATERFALL EXECUTION ---

  // 1. Preferred Model
  try {
    const imgs = await tryModel(preferredModel);
    responseCache.set(cacheKey, imgs);
    return { images: imgs, usedFallback: false, modelUsed: preferredModel };
  } catch (e) {
    console.warn(`Primary model ${preferredModel} failed. trying fallbacks...`);
  }

  // 2. Gemini 2.5 Flash Image (If Pro failed)
  if (useProModel) {
    try {
        const imgs = await tryModel('gemini-2.5-flash-image');
        return { images: imgs, usedFallback: true, modelUsed: 'gemini-2.5-flash-image' };
    } catch (e) { console.warn("Flash fallback failed."); }
  }

  // 3. Imagen 3 (Dedicated Image Model)
  try {
    const imgs = await generateWithImagen(prompt, aspectRatio);
    if (imgs.length > 0) return { images: imgs, usedFallback: true, modelUsed: 'imagen-3.0' };
  } catch (e) { console.warn("Imagen fallback failed."); }

  // 4. Gemini 2.0 Flash Exp (Experimental / New Quota)
  try {
    const imgs = await tryModel('gemini-2.0-flash-exp');
    return { images: imgs, usedFallback: true, modelUsed: 'gemini-2.0-flash-exp' };
  } catch (e) { console.warn("Exp fallback failed."); }

  // 5. Gemini 2.0 Flash Thinking Exp (Another quota bucket)
  try {
     const imgs = await tryModel('gemini-2.0-flash-thinking-exp');
     return { images: imgs, usedFallback: true, modelUsed: 'gemini-2.0-flash-thinking-exp' };
  } catch(e) { console.warn("Thinking Exp fallback failed."); }

    // 6. Gemini 1.5 Flash (Legacy Safety Net)
    try {
        const imgs = await tryModel('gemini-1.5-flash');
        return { images: imgs, usedFallback: true, modelUsed: 'gemini-1.5-flash' };
    } catch (e) { console.warn("Legacy fallback failed."); }

  throw new Error("All AI models are currently busy or out of quota. Please try again in 1 minute.");
};

export const editImage = async (
  base64Images: string[], // Accept Array of images
  userPrompt: string,
  aspectRatio: AspectRatio | null = null,
  resolution: ImageResolution | null = null
): Promise<{ image: string | null, usedSynthetic: boolean }> => {
  const ai = getClient();
  
  const arValue = aspectRatio || "Original";
  const resValue = resolution === ImageResolution.RES_2K ? "2048px" : "1024px";
  
  const masterPrompt = `[MODE: Multimodal Edit]
[TARGET_ASPECT_RATIO: ${arValue}]
[RESOLUTION: ${resValue}]
[INPUT_IMAGES: ${base64Images.length}]
"Perform the following operation on the provided image(s): ${userPrompt}. 
If multiple images are provided, merge or combine them as requested.
Output only the final result image in high quality."`;

  const requestParts: any[] = [];
  
  for (const img of base64Images) {
      const clean = img.split(',')[1] || img;
      let mime = 'image/jpeg';
      if (img.startsWith('data:image/png')) mime = 'image/png';
      else if (img.startsWith('data:image/webp')) mime = 'image/webp';
      
      requestParts.push({ inlineData: { data: clean, mimeType: mime } });
  }
  requestParts.push({ text: masterPrompt });

  const tryEdit = async (model: string) => {
    return withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: model,
        contents: { parts: requestParts },
        config: aspectRatio ? { imageConfig: { aspectRatio: aspectRatio } } : {}
    }));
  };

  // Waterfall for Edit
  const models = ['gemini-2.5-flash-image', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp'];
  
  for (const model of models) {
      try {
          console.log(`Editing with ${model}...`);
          const response = await tryEdit(model);
          
          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                return { image: `data:image/png;base64,${part.inlineData.data}`, usedSynthetic: false };
                }
            }
          }
      } catch (e) {
          console.warn(`${model} edit failed.`, e);
      }
  }

  // Final Fallback: Synthetic Edit (Describe + Generate)
  // This uses standard Flash (Text) quota + Imagen Quota
  try {
      const syntheticImage = await syntheticEditWithImagen(base64Images, userPrompt, aspectRatio || AspectRatio.SQUARE);
      if (syntheticImage) {
          return { image: syntheticImage, usedSynthetic: true };
      }
  } catch (e) {
      console.warn("Synthetic fallback failed.", e);
  }

  throw new Error("Editor returned no image from any available AI.");
};

export const sendChatMessage = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  mode: 'fast' | 'thinking'
): Promise<{ stream: AsyncIterable<GenerateContentResponse>, modelUsed: string }> => {
  const ai = getClient();
  
  const attemptChat = async (model: string, config: any) => {
    const chat = ai.chats.create({ model, history, config });
    return withRetry(async () => {
        const result = await chat.sendMessageStream({ message });
        return result as unknown as AsyncIterable<GenerateContentResponse>;
    });
  };

  // Model Sequence
  const sequence = mode === 'thinking' 
    ? ['gemini-3-pro-preview', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-exp', 'gemini-1.5-flash']
    : ['gemini-2.5-flash-lite', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];

  for (const model of sequence) {
    try {
        const config = model.includes('pro') ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
        const stream = await attemptChat(model, config);
        return { stream, modelUsed: model };
    } catch (e) {
        console.warn(`${model} chat failed. Trying next...`);
    }
  }

  throw new Error("All chat models are currently unavailable due to high traffic.");
};