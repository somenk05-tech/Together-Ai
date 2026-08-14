import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Her voice, both directions, on the platform's own engines.
 *
 * ── WHY THE PLATFORM AND NOT A VENDOR ─────────────────────────────────────
 *
 * `Mira-Voice-Cost.md` did this arithmetic: ElevenLabs at ten thousand monthly
 * citizens is about $24,500 a month, which is eleven times the entire backend.
 * The Web Speech API is on-device, free at every volume, needs no key, works
 * offline, and ships today. It is not her designed voice — that is a recording
 * session and a fine-tune, and it is phase 3 — but a synthesiser she has now
 * beats a beautiful one she does not.
 *
 * Both halves degrade to nothing rather than to something broken: where the
 * API is absent the caller does not render the control at all. A microphone
 * that does nothing is worse than no microphone.
 *
 * ── Why the types below are written out by hand ──────────────────────────
 *
 * The Web Speech recognition API is not in lib.dom, so the obvious version of
 * this file reaches for `any` — and the first cut did, in nine places. The lint
 * ceiling caught all eighteen resulting errors, correctly: `any` here would mean
 * `e.results[i][0].transcript` is unchecked all the way down, and a shape change
 * in a browser would surface as undefined at runtime rather than as a red build.
 */

interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number }
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
  abort(): void;
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

/** A forgotten microphone is not a voice note. Two minutes and it stops itself. */
const MAX_SECONDS = 120;

export interface VoiceNote {
  supported: boolean;
  recording: boolean;
  /** Everything heard so far, committed and not. Shown while recording. */
  text: string;
  seconds: number;
  start: () => void;
  /** Ends the note and hands the transcript back. */
  stop: () => void;
  /** Ends it and throws it away. */
  cancel: () => void;
}

/**
 * A VOICE NOTE, NOT AN OPEN MICROPHONE.
 *
 * The first version listened until the recogniser decided a sentence had ended,
 * then SENT it — no review, no edit, no undo. Two things were wrong with that
 * and the owner named the second one: you cannot pause to think, because a
 * half-second of silence commits whatever you have said so far.
 *
 * So: press to start, speak for as long as you like, press to stop. The
 * transcript lands in the composer as a DRAFT. You read it, fix the word it
 * misheard, and send it yourself.
 *
 * That last step is not politeness, it is the honest fix for the thing speech
 * recognition is actually bad at: names, amounts and places. "Send ₹500 to
 * Priya" misheard is a very different sentence from "send ₹5000 to Piya", and
 * the day she can act rather than read, an unreviewed transcript is how the
 * wrong thing happens. Building the review step now means it is already there.
 */
export function useVoiceNote(onDone: (text: string) => void): VoiceNote {
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);

  const rec = useRef<SpeechRecognitionInstance | null>(null);
  /** Finals accumulate here rather than in state — `onresult` fires many times
   *  a second and a stale closure would drop the middle of a sentence. */
  const committed = useRef('');
  const keep = useRef(true);
  const cb = useRef(onDone);
  cb.current = onDone;

  const Ctor = recogniser();
  const supported = Boolean(Ctor);

  useEffect(() => () => { try { rec.current?.abort(); } catch { /* already gone */ } }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const finish = useCallback((keepIt: boolean) => {
    keep.current = keepIt;
    try { rec.current?.stop(); } catch { /* already stopped */ }
  }, []);

  // Stops itself rather than running until the tab closes.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) finish(true);
  }, [recording, seconds, finish]);

  const start = useCallback(() => {
    if (!Ctor || recording) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-IN';
    // CONTINUOUS is the whole difference. Without it the recogniser ends the
    // session at the first pause, which is what made the old one feel like it
    // was interrupting.
    r.continuous = true;
    r.interimResults = true;
    committed.current = '';
    keep.current = true;

    r.onresult = (e: SpeechRecognitionEvent) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) committed.current += `${result[0].transcript} `;
        else partial += result[0].transcript;
      }
      setText((committed.current + partial).replace(/\s+/g, ' ').trimStart());
    };
    r.onend = () => {
      setRecording(false);
      setSeconds(0);
      const heard = committed.current.replace(/\s+/g, ' ').trim();
      setText('');
      committed.current = '';
      if (keep.current && heard) cb.current(heard);
    };
    r.onerror = () => { keep.current = false; setRecording(false); setSeconds(0); setText(''); };

    rec.current = r;
    try { r.start(); setRecording(true); setSeconds(0); setText(''); }
    catch { setRecording(false); }
  }, [Ctor, recording]);

  return {
    supported,
    recording,
    text,
    seconds,
    start,
    stop: () => finish(true),
    cancel: () => finish(false),
  };
}

/* ══ AND OUT ══════════════════════════════════════════════════════════════ */

const SPEAK_KEY = 'mira.speaks';

/**
 * Which of the installed voices sounds most like the one in the Voice Bible.
 *
 * The bible asks for late twenties or early thirties, medium-low, slightly
 * husky, a subtle Indian or global identity without the stereotype. No platform
 * voice is that. This picks the least-wrong one available and is honest about
 * being a placeholder.
 *
 * `SpeechSynthesisVoice` carries no gender field — deliberately, and reasonably.
 * So the name list is the only signal there is, and it is a NAME LIST rather
 * than a heuristic because a heuristic on names is the kind of thing that
 * quietly encodes an assumption. These are the specific voices shipped by the
 * platforms this app runs on, checked one at a time.
 */
const PREFERRED = [
  'Veena',            // en-IN, iOS/macOS
  'Google UK English Female',
  'Serena', 'Fiona', 'Moira', 'Tessa', 'Karen', 'Samantha',
  'Microsoft Heera',  // en-IN, Windows
  'Microsoft Neerja',
];
/** After the names, the accents, nearest first. */
const LANGS = ['en-IN', 'en-GB', 'en-AU', 'en-US', 'en'];

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  for (const name of PREFERRED) {
    const hit = voices.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  for (const lang of LANGS) {
    const hit = voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (hit) return hit;
  }
  return voices[0];
}

export interface Speech {
  supported: boolean;
  /** Off until asked. See below. */
  on: boolean;
  speaking: boolean;
  toggle: () => void;
  speak: (text: string) => void;
  hush: () => void;
}

/**
 * She speaks only when asked, and remembers the answer.
 *
 * OFF BY DEFAULT, and that is not timidity. A chat surface that starts talking
 * out loud on a phone in a room with other people in it is a betrayal in one
 * second flat, and no amount of good voice design buys that back. The toggle is
 * on the composer, next to the microphone, and the choice is remembered per
 * device.
 */
export function useSpeech(): Speech {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [on, setOn] = useState(() => {
    try { return window.localStorage.getItem(SPEAK_KEY) === '1'; } catch { return false; }
  });
  const [speaking, setSpeaking] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  // Chrome populates the list asynchronously and returns [] on the first call,
  // so asking once at mount silently gets the default voice for ever.
  useEffect(() => {
    if (!supported) return;
    const load = () => { voice.current = pickVoice(window.speechSynthesis.getVoices()) ?? null; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [supported]);

  // A tab closed mid-sentence leaves the synthesiser talking in some browsers.
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      try { window.localStorage.setItem(SPEAK_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      if (!next && supported) window.speechSynthesis.cancel();
      return next;
    });
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !on || !text.trim()) return;
    // One line at a time. Queueing means an interrupted turn keeps talking over
    // the next one, which is how a voice becomes something to switch off.
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice.current) u.voice = voice.current;
    // Slightly under the default on both: the bible asks for medium-low and
    // unhurried, and every platform default is a shade bright and a shade fast.
    u.rate = 0.98;
    u.pitch = 0.92;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [supported, on]);

  const hush = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, on, speaking, toggle, speak, hush };
}
