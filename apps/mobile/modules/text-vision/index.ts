import { requireOptionalNativeModule } from 'expo';

/**
 * Text recognition on the iPhone (Apple Vision, "accurate" level): printed and handwritten
 * text, in the languages asked, with the position of each line (0–1 from the top left).
 * Nothing is sent anywhere. Not available in Expo Go or in builds made before this module.
 */
export interface VisionLine {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextVisionNative {
  recognize(uri: string, languages: string[]): Promise<VisionLine[]>;
}

const native = requireOptionalNativeModule<TextVisionNative>('TextVision');

export const textVisionAvailable = native !== null;

export function recognizeText(uri: string, languages: string[]): Promise<VisionLine[]> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.recognize(uri, languages);
}
