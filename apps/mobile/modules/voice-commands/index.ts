import { requireOptionalNativeModule } from 'expo';

/**
 * Cook mode voice commands: continuous speech recognition on the iPhone (Apple Speech, on-device
 * only, nothing is sent). `onSpeech` receives what was just said; the app decides whether it is a
 * command (core `voiceCommand`). Listening only happens between start() and stop().
 *
 * Errors (`code`): ERR_UNSUPPORTED (module missing), ERR_PERMISSION (microphone or speech
 * recognition refused), ERR_LANGUAGE (no on-device model for this language), ERR_AUDIO.
 */
interface VoiceCommandsNative {
  start(language: string): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'onSpeech',
    cb: (e: { text: string; final: boolean; phrase: number }) => void,
  ): { remove(): void };
}

const native = requireOptionalNativeModule<VoiceCommandsNative>('VoiceCommands');

export const voiceCommandsAvailable = native !== null;

export function startListening(language: string): Promise<void> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.start(language);
}

export function stopListening(): Promise<void> {
  return native ? native.stop() : Promise.resolve();
}

/** What is being said, as it is recognised; `phrase` changes with each new phrase. */
export function onSpeech(cb: (text: string, phrase: number) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onSpeech', (e) => cb(e.text, e.phrase));
  return () => sub.remove();
}
