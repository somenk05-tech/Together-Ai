/**
 * One spoken consultation, as a state machine and nothing else.
 *
 * No sockets, no audio, no database, no clock of its own — every transition is
 * a pure function of the state and an event, and the time is handed in. That is
 * what makes the two rules below testable rather than hopeful: a rule enforced
 * inside a WebSocket handler is a rule nobody can prove.
 *
 * ── SHE SAYS WHAT SHE IS, FIRST, ALWAYS ─────────────────────────────────────
 *
 * The brief was "sounds exactly like a real woman". She will — that is the
 * whole point of paying for a real voice instead of the browser's synthesiser.
 * But a synthetic voice indistinguishable from a person is exactly the thing
 * India now regulates: the IT (Intermediary Guidelines and Digital Media Ethics
 * Code) Amendment Rules 2026 (G.S.R. 120(E), in force February 2026) define
 * "synthetically generated information" to include audio that "appears to be
 * real, authentic or true" and is "likely to be perceived as indistinguishable
 * from a natural person", and require it to carry "a prominently prefixed audio
 * disclosure, that can be used to immediately identify that such information is
 * synthetically generated". ElevenLabs' own use policy says the same thing in
 * its own words: organisations "must clearly and prominently disclose to their
 * users they are interacting with AI rather than a human".
 *
 * So the first utterance of every call is the disclosure, it is spoken in the
 * caller's own language, and there is no state from which the call reaches the
 * citizen's question without having passed through it. `begin()` returns the
 * disclosure or it returns nothing; there is no third door. A flag that turns
 * it off would be the whole defect, so there is no flag.
 *
 * It costs about two seconds and it is not an apology. "I am Tara, Together
 * City's AI astrologer" is a better opening than a human impersonation the
 * caller works out for themselves thirty seconds later.
 *
 * ── THE METER STARTS WHEN THE CITIZEN DOES ──────────────────────────────────
 *
 * ₹99 a minute, and the minute begins at the citizen's first word — not when
 * the call connects and not while Tara is saying what she is. Being told you
 * are talking to a machine is not a service anybody buys, and charging for the
 * disclosure would make the one sentence the law requires into a sentence the
 * caller resents. `meterFrom` is null until the first thing they say lands.
 *
 * ── THE END ARRIVES ANNOUNCED ───────────────────────────────────────────────
 *
 * What bounds the call is the wallet: `fundedMinutes`, fixed when the call
 * opened, is what the balance could pay for. A call cut off mid-sentence reads
 * as a fault however correct the arithmetic, so the session raises a warning
 * CALL_WARN_AT_SECONDS out and closes with a spoken line. Past the end the
 * state is `ended` and no further turn is accepted.
 */

import { CALL_WARN_AT_SECONDS, MAX_CALL_MINUTES } from './voice-quota';

/** The languages she speaks. `auto` lets the recogniser decide from the first turn. */
export const VOICE_LANGUAGES = ['auto', 'en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

/** A language actually spoken — what `auto` resolves to once she has heard a turn. */
export type SpokenLanguage = Exclude<VoiceLanguage, 'auto'>;

export const DEFAULT_LANGUAGE: SpokenLanguage = 'en-IN';

export function isVoiceLanguage(v: unknown): v is VoiceLanguage {
  return typeof v === 'string' && (VOICE_LANGUAGES as readonly string[]).includes(v);
}

/**
 * The disclosure, in each language she speaks.
 *
 * WRITTEN OUT, NOT TRANSLATED AT RUNTIME. A machine translation of the one
 * sentence that has to be legally exact is not a saving. Each is a complete
 * sentence a native speaker can read aloud, names her, names Together City and
 * names what she is, in that order, because the caller's first second is where
 * "who is this" is answered.
 */
export const DISCLOSURE: Record<SpokenLanguage, string> = {
  'en-IN': 'Namaste. This is Tara, Together City’s AI astrologer — an artificial voice, not a person. Shall we begin?',
  'hi-IN': 'नमस्ते। मैं तारा हूँ, टुगेदर सिटी की ए आई ज्योतिषी। मैं एक कृत्रिम आवाज़ हूँ, कोई व्यक्ति नहीं। शुरू करें?',
  'ta-IN': 'வணக்கம். நான் தாரா, டுகெதர் சிட்டியின் AI ஜோதிடர். நான் ஒரு செயற்கை குரல், மனிதர் அல்ல. தொடங்கலாமா?',
  'te-IN': 'నమస్కారం. నేను తార, టుగెదర్ సిటీ యొక్క AI జ్యోతిష్కురాలు. నేను ఒక కృత్రిమ స్వరం, వ్యక్తిని కాదు. మొదలుపెట్టవచ్చా?',
  'bn-IN': 'নমস্কার। আমি তারা, টুগেদার সিটির এআই জ্যোতিষী। আমি একটি কৃত্রিম কণ্ঠস্বর, কোনো ব্যক্তি নই। শুরু করব?',
  'mr-IN': 'नमस्कार। मी तारा, टुगेदर सिटीची एआय ज्योतिषी। मी एक कृत्रिम आवाज आहे, व्यक्ती नाही। सुरुवात करूया?',
};

/**
 * How the call closes when the ceiling arrives. Spoken, not a dial tone —
 * the citizen paid ₹99 and is owed a sentence rather than silence.
 */
export const CLOSING: Record<SpokenLanguage, string> = {
  'en-IN': 'That is all the time we have today. Your reading is saved in My Questions. Take care.',
  'hi-IN': 'आज के लिए इतना ही समय था। आपकी पूरी बात My Questions में सहेजी गई है। ध्यान रखिए।',
  'ta-IN': 'இன்றைக்கு நமக்கு இவ்வளவு நேரம் தான். உங்கள் வாசகம் My Questions-இல் சேமிக்கப்பட்டது. கவனமாக இருங்கள்.',
  'te-IN': 'ఈ రోజుకు ఇంతే సమయం ఉంది. మీ రీడింగ్ My Questionsలో సేవ్ అయింది. జాగ్రత్త.',
  'bn-IN': 'আজকের মতো এইটুকুই সময়। আপনার পাঠটি My Questions-এ রাখা আছে। ভালো থাকবেন।',
  'mr-IN': 'आजसाठी एवढाच वेळ आहे. तुमचे वाचन My Questions मध्ये सेव्ह केले आहे. काळजी घ्या.',
};

export type VoicePhase = 'opening' | 'listening' | 'thinking' | 'speaking' | 'ended';

export type EndReason = 'hung-up' | 'out-of-balance' | 'ceiling' | 'failed';

export interface VoiceSession {
  phase: VoicePhase;
  /** Wall-clock start, handed in. The session never reads a clock itself. */
  startedAtMs: number;
  /**
   * When the meter started — the citizen's first word. Null until then, which
   * is what keeps the disclosure and the greeting free.
   */
  meterFrom: number | null;
  /**
   * Whole minutes the wallet could fund when this call opened, already capped
   * by MAX_CALL_MINUTES. Fixed for the call: a top-up mid-call does not extend
   * it, because a balance that moves under a running meter is the race
   * `wallet-race.spec.ts` exists about.
   */
  fundedMinutes: number;
  /** What she is speaking, once heard. Until then, what the caller asked for. */
  language: SpokenLanguage;
  /** Whether the disclosure has actually been spoken. Nothing proceeds until it has. */
  disclosed: boolean;
  /** Whether the one-minute warning has been raised, so it is raised once. */
  warned: boolean;
  /** Completed exchanges, for the transcript and for the model budget. */
  turns: number;
  endedReason: EndReason | null;
}

/** A fresh session. It is NOT yet a call — nothing may be said until `begin`. */
export function newSession(startedAtMs: number, language: VoiceLanguage, fundedMinutes: number): VoiceSession {
  return {
    phase: 'opening',
    startedAtMs,
    meterFrom: null,
    fundedMinutes: Math.max(0, Math.min(Math.floor(fundedMinutes), MAX_CALL_MINUTES)),
    language: language === 'auto' ? DEFAULT_LANGUAGE : language,
    disclosed: false,
    warned: false,
    turns: 0,
    endedReason: null,
  };
}

/**
 * The first thing said on every call, and the only way out of `opening`.
 *
 * There is no argument that skips it and no branch that returns null: a caller
 * that wants a call gets the disclosure first or gets nothing.
 */
export function begin(s: VoiceSession): { session: VoiceSession; say: string } {
  if (s.phase !== 'opening') throw new Error('begin() is only valid on a session that has not opened');
  return {
    session: { ...s, phase: 'listening', disclosed: true },
    say: DISCLOSURE[s.language],
  };
}

/** Seconds since the call connected — for the transcript, never for the bill. */
export function elapsedSeconds(s: VoiceSession, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - s.startedAtMs) / 1000));
}

/** Seconds ON THE METER. Zero until the citizen has said something. */
export function meteredSeconds(s: VoiceSession, nowMs: number): number {
  if (s.meterFrom == null) return 0;
  return Math.max(0, Math.floor((nowMs - s.meterFrom) / 1000));
}

/** Seconds of talking the balance still funds. Never negative. */
export function secondsLeft(s: VoiceSession, nowMs: number): number {
  return Math.max(0, s.fundedMinutes * 60 - meteredSeconds(s, nowMs));
}

/**
 * Accept one thing the citizen said.
 *
 * Refuses before the disclosure, refuses after the end, and refuses at the
 * ceiling — each with its own reason, because "no" without a reason is what
 * makes a client retry forever.
 */
export function hear(
  s: VoiceSession, nowMs: number, heard: string,
): { session: VoiceSession; ok: true } | { session: VoiceSession; ok: false; why: string } {
  if (!s.disclosed) return { session: s, ok: false, why: 'the disclosure has not been spoken' };
  if (s.phase === 'ended') return { session: s, ok: false, why: 'the call has ended' };
  if (s.fundedMinutes < 1) {
    return { session: end(s, 'out-of-balance'), ok: false, why: 'the balance funds no minutes' };
  }
  if (s.meterFrom != null && secondsLeft(s, nowMs) <= 0) {
    return { session: end(s, 'out-of-balance'), ok: false, why: 'the balance is spent' };
  }
  if (!heard.trim()) return { session: s, ok: false, why: 'nothing was heard' };
  // THE FIRST WORD STARTS THE METER, and only the first: `meterFrom` is set
  // once and never moved, or a slow reply would buy the citizen free seconds
  // and a fast one would charge them twice.
  const meterFrom = s.meterFrom ?? nowMs;
  return { session: { ...s, phase: 'thinking', meterFrom }, ok: true };
}

/**
 * Her reply is ready. Returns what she should say and, when the ceiling is
 * near, the warning that goes in front of it — one sentence, once.
 */
export function answer(
  s: VoiceSession, nowMs: number, reply: string,
): { session: VoiceSession; say: string[] } {
  const left = secondsLeft(s, nowMs);
  const say: string[] = [];
  let next: VoiceSession = { ...s, phase: 'speaking', turns: s.turns + 1 };
  // Only once the meter is running: before the citizen's first word there is
  // nothing counting down, and "a minute left" would be a lie about a call
  // that has not started costing anything.
  if (!s.warned && s.meterFrom != null && left > 0 && left <= CALL_WARN_AT_SECONDS) {
    say.push(warningFor(s.language));
    next = { ...next, warned: true };
  }
  say.push(reply);
  return { session: next, say };
}

/** She has finished speaking; the line is the citizen's again. */
export function spoken(s: VoiceSession): VoiceSession {
  return s.phase === 'ended' ? s : { ...s, phase: 'listening' };
}

/** The end, whoever caused it. Idempotent — a second hang-up is not an error. */
export function end(s: VoiceSession, reason: EndReason): VoiceSession {
  if (s.phase === 'ended') return s;
  return { ...s, phase: 'ended', endedReason: reason };
}

/** The closing sentence, when the ceiling ends the call rather than the citizen. */
export function closingFor(language: SpokenLanguage): string {
  return CLOSING[language];
}

function warningFor(language: SpokenLanguage): string {
  const m: Record<SpokenLanguage, string> = {
    'en-IN': 'We have about a minute left.',
    'hi-IN': 'हमारे पास लगभग एक मिनट बचा है।',
    'ta-IN': 'கிட்டத்தட்ட ஒரு நிமிடம் உள்ளது.',
    'te-IN': 'మనకి సుమారు ఒక నిమిషం మిగిలి ఉంది.',
    'bn-IN': 'আমাদের প্রায় এক মিনিট বাকি আছে।',
    'mr-IN': 'आपल्याकडे सुमारे एक मिनिट आहे.',
  };
  return m[language];
}
