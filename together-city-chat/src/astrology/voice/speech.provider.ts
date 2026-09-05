/**
 * THE LINE BETWEEN TOGETHER CITY AND A SPEECH VENDOR.
 *
 * The same seam `commerce/provider.ts` draws around money, drawn around voice,
 * and for the same reason: not portability for its own sake, but so that every
 * screen, the state machine, the quota, the transcript and the budget are
 * written against these two interfaces and have never seen a vendor. Signing
 * ElevenLabs or Cartesia or Deepgram is implementing an interface and changing
 * one line in the module.
 *
 * It also keeps an honest answer available. Nothing in `package.json` speaks to
 * a speech vendor today, and `Mira-Voice-Cost.md` did the arithmetic on why:
 * voice is the single most expensive thing this product can add. So the binding
 * below is `NoSpeechProvider`, which refuses clearly, and the hub says "not open
 * yet" rather than offering a call button that dials nothing.
 *
 * ── WHAT THIS INTERFACE DELIBERATELY CANNOT DO ──────────────────────────────
 *
 * There is no `cloneVoice`, no `voiceSampleUrl`, no way to hand it a recording
 * of a person and get that person's voice back. Tara is a stock voice from a
 * catalogue, chosen and configured by id. Every vendor worth using prohibits
 * cloning a real person without their consent — ElevenLabs' use policy names
 * it, Cartesia's acceptable-use policy names it — and the shape of this file is
 * how that stays true after everyone has forgotten the policy. A future need to
 * record a real astrologer and licence her voice is a signed release and a new
 * interface, deliberately, not a field somebody adds on a Friday.
 *
 * COSTS ARE PART OF THE CONTRACT. Both methods report what they billed, in the
 * vendor's own unit, because a per-call ceiling that cannot see the meter is
 * not a ceiling. The service records it against the call.
 */

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { SpokenLanguage } from './voice-session';

/** Told to the citizen, and the only thing they are told, when no vendor is bound. */
export const VOICE_UNAVAILABLE =
  'Spoken consultations are not open yet. Your written consultation is available now.';

export interface TranscribeRequest {
  /** One utterance of the citizen's speech. */
  audio: Buffer;
  /** Container the bytes are in, as the vendor names it (e.g. 'audio/webm'). */
  mimeType: string;
  /** What she should listen for. `null` asks the vendor to detect it. */
  language: SpokenLanguage | null;
}

export interface TranscribeResult {
  text: string;
  /** What the vendor decided was spoken, when it was asked to detect. */
  language: SpokenLanguage | null;
  /** Seconds of audio billed, as the vendor counted them. */
  billedSeconds: number;
}

export interface SpeakRequest {
  text: string;
  language: SpokenLanguage;
  /** The catalogue voice, by the vendor's id. Never a sample of a real person. */
  voiceId: string;
}

export interface SpeakResult {
  audio: Buffer;
  mimeType: string;
  /** Characters billed, as the vendor counted them. */
  billedCharacters: number;
}

export interface SpeechProvider {
  readonly name: string;
  /** False when the provider cannot actually reach a vendor. The hub reads this. */
  readonly ready: boolean;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
  speak(req: SpeakRequest): Promise<SpeakResult>;
}

/**
 * The provider that is not one.
 *
 * It does not pretend, and that is the whole design. A sandbox speech provider
 * would have to synthesise something, and something is a robot voice shipped to
 * a citizen who paid ₹99 for a human one — so this refuses instead. `ready` is
 * false, the hub never offers the button, and if a route is reached anyway the
 * citizen is told the truth in one sentence rather than handed silence.
 */
export class NoSpeechProvider implements SpeechProvider {
  readonly name = 'none';
  readonly ready = false;
  private readonly logger = new Logger(NoSpeechProvider.name);
  private warned = false;

  private refuse(): never {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        'No speech vendor is configured (SPEECH_PROVIDER unset) — spoken consultations are closed. '
        + 'Written consultations are unaffected.',
      );
    }
    throw new ServiceUnavailableException(VOICE_UNAVAILABLE);
  }

  /* `async`, so the refusal arrives as a rejected promise rather than a
     synchronous throw. A method typed `Promise<T>` that throws before it
     returns one skips past every `.catch()` a caller wrote — the failure
     mode is an unhandled exception in a socket handler, which takes the
     process rather than the call. */
  async transcribe(): Promise<TranscribeResult> { return this.refuse(); }
  async speak(): Promise<SpeakResult> { return this.refuse(); }
}

/**
 * What one call cost us, in rupees, from what the vendors said they billed.
 *
 * Rates are read from the environment rather than compiled in, because a price
 * list in a source file is a price list that is wrong by the time anybody looks
 * at it. The defaults are the published rates on 4 Sep 2026 — Deepgram Nova-3
 * streaming at $0.0048/min, ElevenLabs Flash at $0.05 per 1,000 characters —
 * and they are a starting point for the meter, not a quote.
 */
export function callCostInr(
  billedSeconds: number,
  billedCharacters: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const num = (k: string, d: number) => {
    const n = Number(env[k]);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const usdPerSttMinute = num('SPEECH_STT_USD_PER_MIN', 0.0048);
  const usdPerTtsKChar = num('SPEECH_TTS_USD_PER_KCHAR', 0.05);
  const inrPerUsd = num('USD_INR', 94.43);
  const usd = (billedSeconds / 60) * usdPerSttMinute + (billedCharacters / 1000) * usdPerTtsKChar;
  return Math.round(usd * inrPerUsd * 100) / 100;
}
