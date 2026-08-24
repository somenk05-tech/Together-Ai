import { violations as cityViolations, type VoiceViolation } from '../shared/voice';

/**
 * How Mira speaks.
 *
 * `shared/voice.ts` is the city's voice and it bans the assistant as a subject:
 * "I can't", "let me", "I'm here". That rule is right where it was written —
 * a blood report or a booking confirmation has no speaker, and an app that
 * narrates itself in those places is intruding on a document.
 *
 * Mira is the one surface where there IS a speaker. "I can't do that from
 * here" is not the app intruding; it is the answer. So this module keeps every
 * other family from the city rules verbatim and relaxes exactly one.
 *
 * ── What is relaxed ────────────────────────────────────────────────────────
 * The assistant-as-subject family, and only it. Mira may say "I", may say she
 * can't do something, may ask for a second.
 *
 * ── What is NOT relaxed, and never will be ─────────────────────────────────
 * Every honesty rule survives untouched, because none of them were about the
 * speaker. Comfort the app is not entitled to give, clinical reassurance,
 * third-person references to the reader, stock filler — all still fatal. Mira
 * being a character does not license her to tell somebody there is nothing to
 * worry about.
 *
 * ── What is added ──────────────────────────────────────────────────────────
 * Service-desk enthusiasm, which the city rules never needed because a report
 * cannot be perky. A conversational surface can, and it is the single clearest
 * tell of a machine performing helpfulness.
 */

interface Rule { re: RegExp; why: string }

/**
 * City rules that describe the speaker rather than the honesty of the claim.
 * Matched by `why` because the rule objects are not exported — and by string
 * rather than by index, so re-ordering shared/voice.ts cannot silently change
 * what Mira is allowed to say.
 */
const RELAXED_REASONS = new Set([
  'speaks as an assistant',
  'makes the assistant the subject',
  "offers the assistant's perspective",
  'makes the assistant the recommender',
  'narrates the assistant',
]);

const MIRA_BANNED: Rule[] = [
  // ── Service-desk enthusiasm ───────────────────────────────────────────
  // The tell of every assistant ever shipped. A model told to be "warm" and
  // "helpful" produces these unprompted, and they read as a machine performing
  // helpfulness rather than a person being helpful.
  { re: /\b(?:absolutely|certainly|of course|sure thing)\s*[!,]/i, why: 'service-desk enthusiasm' },
  { re: /\bgreat question\b/i, why: 'flatters instead of answering' },
  { re: /\bhappy to help\b/i, why: 'service-desk enthusiasm' },
  { re: /\bis there anything else\b/i, why: 'call-centre sign-off' },
  { re: /\bhow (?:can|may) I (?:help|assist)\b/i, why: 'call-centre greeting' },
  { re: /\bhere are (?:three|some|a few) (?:recommendations|suggestions|options)\b/i, why: 'announces a list instead of giving one' },
  { re: /\bbased on your (?:query|request|question)\b/i, why: 'restates the request back' },
  { re: /\bI(?:'ll| will) (?:go ahead and|now proceed to)\b/i, why: 'narrates its own machinery' },

  // ── Narrating the machinery ───────────────────────────────────────────
  // She never says which hub she used, which model ran, or that she searched
  // anything. The citizen said a sentence and a thing happened.
  { re: /\b(?:searching|checking|looking) (?:the |our )?(?:database|system|records)\b/i, why: 'narrates its own machinery' },
  { re: /\bin the (?:\w+ )?hub\b/i, why: 'names the app’s own furniture' },

  // ── Apology loops ─────────────────────────────────────────────────────
  // Owning a mistake is three moves in one breath: acknowledge, name the
  // error, state the fix. Anything longer is performance.
  { re: /\bI (?:sincerely |deeply |truly )?apologi[sz]e\b/i, why: 'performs regret instead of fixing' },
  { re: /\bsorry (?:about|for) (?:that|the) (?:confusion|inconvenience|mix.?up)\b/i, why: 'performs regret instead of fixing' },
];

/**
 * Every rule this text breaks, for Mira.
 *
 * City rules minus the speaker family, plus hers. Empty means it is safe to
 * say out loud.
 */
export function violations(text: string): VoiceViolation[] {
  const inherited = cityViolations(text).filter((v) => !RELAXED_REASONS.has(v.why));
  const own: VoiceViolation[] = [];
  for (const { re, why } of MIRA_BANNED) {
    const m = re.exec(text ?? '');
    if (m) own.push({ phrase: m[0], why });
  }
  return [...inherited, ...own];
}

export const inVoice = (text: string): boolean => violations(text).length === 0;

/**
 * Accept Mira's prose only if it stays in voice, else the deterministic line.
 *
 * Same trade the astrology hub and the city rules already make, and for the
 * same reason: the fallback is written to the same rules, so a rejected
 * rewrite costs warmth and never correctness. Mira sounding flatter for one
 * turn is a much smaller problem than Mira sounding like a call centre.
 *
 * No minimum length here, unlike `shared/acceptOrFallback`. Her shortest
 * correct answers are two characters long — "Oh." and "Yeah." are in the
 * spec — and a length floor would reject exactly the lines that sound most
 * like a person.
 */
/**
 * SHE SPEAKS, SHE DOES NOT TYPESET. The model drafts in markdown out of habit
 * — the owner's screenshot had her saying "Your chart calls for **emerald**",
 * asterisks and all, in a chat bubble that renders plain text. Emphasis
 * markers, backticks and heading hashes are stripped; the words stay.
 */
const plain = (t: string): string => t
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|[.,!?]|$)/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^#{1,4}\s+/gm, '');

export function acceptOrFallback(candidate: string | undefined, fallback: string): string {
  const text = plain((candidate ?? '').trim()).trim();
  if (!text) return fallback;
  return inVoice(text) ? text : fallback;
}
