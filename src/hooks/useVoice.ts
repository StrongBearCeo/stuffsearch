/** useVoice: wraps the speech lib into a React-friendly hook. */
import { useState, useCallback, useRef } from 'react';
import {
  startListening,
  stopListening,
  requestSpeechPermissions,
  isSpeechAvailable,
  type StartOptions,
} from '../lib/speech';
import type { SupportedLanguage } from '../lib/supabase';

export function useVoice(language: SupportedLanguage) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cbRef = useRef<{ onResult?: (t: string) => void }>({});

  const start = useCallback(
    async (onResult?: (text: string) => void) => {
      setError(null);
      setTranscript('');
      setPartial('');
      if (!isSpeechAvailable()) {
        setError('Voice input is not available on this device.');
        return;
      }
      const granted = await requestSpeechPermissions();
      if (!granted) {
        setError('Microphone permission denied.');
        return;
      }
      cbRef.current.onResult = onResult;
      const opts: StartOptions = {
        language,
        onPartial: (t) => setPartial(t),
        onResult: (t) => {
          setTranscript(t);
          setListening(false);
          cbRef.current.onResult?.(t);
        },
        onError: (e) => {
          setError(e);
          setListening(false);
        },
      };
      setListening(true);
      startListening(opts);
    },
    [language],
  );

  const stop = useCallback(() => {
    stopListening();
    setListening(false);
  }, []);

  return { listening, partial, transcript, error, start, stop };
}
