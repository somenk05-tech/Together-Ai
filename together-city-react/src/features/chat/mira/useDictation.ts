import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hands-free input, on the platform's own recogniser.
 *
 * Web Speech API: on-device, free at every volume, no vendor and no contract —
 * the same argument that put text-to-speech on the platform synthesiser first.
 * It also works offline and needs no key.
 *
 * `onFinal` fires once, on the recogniser's final transcript, so the whole
 * interaction is "speak a sentence, stop". No push-and-hold, no send button.
 *
 * Degrades to nothing: `supported` is false where the API is absent (Firefox,
 * older Safari) and the caller does not render the button. A microphone that
 * does nothing is worse than no microphone.
 *
 * ── Why the types below are written out by hand ──────────────────────────
 *
 * The Web Speech API is not in lib.dom, so the obvious version of this file
 * reaches for `any` — and the first cut did, in nine places. The lint ceiling
 * caught all eighteen resulting errors, correctly: `any` here would mean
 * `e.results[i][0].transcript` is unchecked all the way down, and a shape
 * change in a browser would surface as undefined at runtime rather than as a
 * red build. These are the minimum honest declarations for the parts actually
 * touched, and nothing else.
 */

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

function recogniser(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** What she has heard so far, before the recogniser commits to it. */
  interim: string;
  toggle: () => void;
}

export function useDictation(onFinal: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const ref = useRef<SpeechRecognitionInstance | null>(null);

  // Held in a ref so a re-render with a new closure does not rebuild `toggle`
  // and drop a recogniser mid-sentence.
  const cb = useRef(onFinal);
  cb.current = onFinal;

  const Ctor = recogniser();
  const supported = Boolean(Ctor);

  useEffect(() => () => {
    try { ref.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (listening) {
      try { ref.current?.stop(); } catch { /* already stopped */ }
      setListening(false);
      return;
    }

    const rec = new Ctor();
    rec.lang = navigator.language || 'en-IN';
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let finalText = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else partial += result[0].transcript;
      }
      setInterim(partial);
      const done = finalText.trim();
      if (done) { setInterim(''); cb.current(done); }
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    rec.onerror = () => { setListening(false); setInterim(''); };

    ref.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, [Ctor, listening]);

  return { supported, listening, interim, toggle };
}
