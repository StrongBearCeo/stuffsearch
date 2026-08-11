/**
 * Voice STT abstraction over @jamsch/expo-speech-recognition.
 * Pluggable: a cloud (Whisper) backend can be added later behind the same API.
 *
 * NOTE: SpeechRecognition is platform-gated (native module). On web / when the
 * native module is unavailable, the helpers no-op and report unavailable so
 * callers degrade gracefully.
 */
import { Platform } from 'react-native';
import type { SupportedLanguage } from './supabase';

// Lazy-loaded so web/test environments don't crash at import time.
type SRModule = typeof import('@jamsch/expo-speech-recognition');
let mod: SRModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('@jamsch/expo-speech-recognition');
} catch {
  mod = null;
}

export function isSpeechAvailable(): boolean {
  return mod != null && Platform.OS !== 'web';
}

/** Map our supported language enum to a BCP-47 locale tag. */
export function localeFor(lang: SupportedLanguage): string {
  return lang === 'vi' ? 'vi-VN' : 'en-US';
}

export interface StartOptions {
  language: SupportedLanguage;
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onError?: (err: string) => void;
}

/**
 * Start a single recognition session. The result callback fires on final
 * results; partial results call onPartial. Call stopListening() to abort.
 */
export function startListening(opts: StartOptions): void {
  if (!mod || !isSpeechAvailable()) {
    opts.onError?.('Speech recognition is not available on this device.');
    return;
  }
  const { ExpoSpeechRecognitionModule, addSpeechRecognitionListener } = mod;
  try {
    ExpoSpeechRecognitionModule.start({
      lang: localeFor(opts.language),
      interimResults: true,
      continuous: false,
    });
  } catch (e) {
    opts.onError?.(e instanceof Error ? e.message : 'start failed');
    return;
  }
  // `result` fires for both partial (isFinal=false) and final (isFinal=true).
  addSpeechRecognitionListener('result', (e) => {
    const text = e.results?.[0]?.transcript ?? '';
    if (e.isFinal) opts.onResult(text);
    else opts.onPartial?.(text);
  });
  addSpeechRecognitionListener('error', (e) => {
    opts.onError?.(e?.message ?? 'speech error');
  });
}

export function stopListening(): void {
  if (!mod || !isSpeechAvailable()) return;
  try {
    mod.ExpoSpeechRecognitionModule.stop();
  } catch {
    /* ignore */
  }
}

/** Request permissions (iOS/Android). Resolves to granted boolean. */
export async function requestSpeechPermissions(): Promise<boolean> {
  if (!mod || !isSpeechAvailable()) return false;
  try {
    const res = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted ?? true;
  } catch {
    return false;
  }
}
