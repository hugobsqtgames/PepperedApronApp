import { requireOptionalNativeModule } from 'expo';

/**
 * Listens to a downloaded video on the iPhone: the audio track is converted to 16 kHz mono and
 * transcribed by Apple Speech's on-device recognition. Nothing is sent anywhere. Returns the
 * transcript split at pauses.
 *
 * Errors (`code`): ERR_UNSUPPORTED (module missing), ERR_PERMISSION (refused), ERR_LANGUAGE (no
 * on-device model for this language), ERR_NO_AUDIO (silent video), ERR_TRANSCRIBE (other).
 */
interface VideoSpeechNative {
  transcribe(videoUri: string, language: string): Promise<string[]>;
}

const native = requireOptionalNativeModule<VideoSpeechNative>('VideoSpeech');

export const videoSpeechAvailable = native !== null;

export function transcribeVideo(videoUri: string, language: string): Promise<string[]> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.transcribe(videoUri, language);
}
