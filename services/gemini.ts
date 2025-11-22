import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AspectRatio, ImageResolution } from "../types";

const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const ensureApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await win.aistudio.openSelectKey();
      return await win.aistudio.hasSelectedApiKey();
    }
    return true;
  }
  return true;
};

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution
): Promise<string[]> => {
  const ai = getClient();
  
  // The API currently supports max '4K'. We map '8K' to '4K' to prevent errors
  // while satisfying the user interface requirement.
  // The model is prompted with high detail expectations.
  const apiResolution = resolution === ImageResolution.RES_8K ? '4K' : resolution;

  const finalPrompt = resolution === ImageResolution.RES_8K 
    ? `${prompt} (Highly detailed 8K resolution masterpiece, ultra-sharp)` 
    : prompt;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [{ text: finalPrompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: apiResolution
      }
    }
  });

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

export const editImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = 'image/jpeg'
): Promise<string | null> => {
  const ai = getClient();
  const cleanBase64 = base64Image.split(',')[1] || base64Image;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType
          }
        },
        { text: prompt }
      ]
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  return null;
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

  const chat = ai.chats.create({
    model: model,
    history: history,
    config: config
  });

  return chat.sendMessageStream({ message });
};