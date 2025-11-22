export enum AppMode {
  GENERATE = 'GENERATE',
  EDIT = 'EDIT',
  CHAT = 'CHAT'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_2_3 = '2:3',
  LANDSCAPE_3_2 = '3:2',
  PORTRAIT_3_4 = '3:4',
  LANDSCAPE_4_3 = '4:3',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_16_9 = '16:9',
  CINEMATIC_21_9 = '21:9'
}

export enum ImageResolution {
  RES_2K = '2K',
  RES_4K = '4K',
  RES_8K = '8K'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}