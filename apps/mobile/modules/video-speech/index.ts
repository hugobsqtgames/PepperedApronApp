import { requireOptionalNativeModule } from 'expo';

/**
 * Listens to a downloaded video on the iPhone: the audio track is converted to 16 kHz mono and
 * transcribed by Apple Speech's on-device recognition. Nothing is sent anywhere. Returns the
 * transcript split at pauses.
 *
 * Errors (`code`): ERR_UNSUPPORTED (module missing), ERR_PERMISSION (refused), ERR_LANGUAGE (no
 * on-device model for this language), ERR_NO_AUDIO (silent video), ERR_TRANSCRIBE (other).
 */
export interface VideoFrame {
  uri: string;
  /** Seconds from the start. */
  time: number;
  /** Sharp and well exposed = high (only meaningful to compare frames of one video). */
  score: number;
}

interface VideoSpeechNative {
  transcribe(videoUri: string, language: string): Promise<string[]>;
  frames(videoUri: string, count: number): Promise<VideoFrame[]>;
}

const native = requireOptionalNativeModule<VideoSpeechNative>('VideoSpeech');

export const videoSpeechAvailable = native !== null;

export function transcribeVideo(videoUri: string, language: string): Promise<string[]> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.transcribe(videoUri, language);
}

/** About one picture per second (at most `count`), saved in the caches folder, in time order. */
export function videoFrames(videoUri: string, count: number): Promise<VideoFrame[]> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.frames(videoUri, count);
}
