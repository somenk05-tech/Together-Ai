/**
 * ── WHAT MIRA KNOWS ABOUT YOU ─────────────────────────────────────────────
 *
 * Her memory was a rolling transcript: `recall()` returns the last 30 turns and
 * nothing else. That is enough to make one conversation continuous and not
 * enough to make her a person who knows you — she cannot carry a preference
 * across a day, cannot notice a contradiction, and re-meets the citizen every
 * time the window slides.
 *
 * A fact is a SUBJECT and what she knows about it, in the citizen's own words,
 * with the turn it came from kept so that "why do you know that?" has an
 * answer. One row per subject per citizen, updated rather than duplicated.
 *
 * ── THE RULE THAT MATTERS MORE THAN THE FEATURE ───────────────────────────
 *
 * This file writes durable, inferred records about a person from things they
 * said in passing. That is a different act from storing what they typed into a
 * form, and it earns a different standard.
 *
 *  1. WHOLE CATEGORIES ARE NEVER STORED, however clearly they were said.
 *     Health and medication, mental health, sexual orientation or activity,
 *     religion, caste, political affiliation, immigration status, criminal
 *     history, account and card numbers, government IDs, and where they are
 *     standing right now. The city holds some of these in hubs the citizen
 *     filled in deliberately; that is theirs. An inference drawn from a
 *     sentence is not, and there is no version of this that is worth the risk.
 *
 *  2. A DISTRESSED TURN IS NEVER MINED. Somebody at their lowest is not
 *     material. The caller checks `levity`'s verdict before it ever gets here.
 *
 *  3. THE CONFIDANT IS OUT OF SCOPE ENTIRELY. `confide()` never touches
 *     `MiraTurn` and it never touches this either — that scoping is on the
 *     protect list and it is what the room is for.
 *
 *  4. EVERY FACT IS ERASABLE, and `forget` reaches them the same way it
 *     reaches turns. A record the citizen cannot see or delete is not memory,
 *     it is a file on them.
 */

/** How sure she is. Rendered to the citizen, not just stored. */
export type Confidence = 'known' | 'likely' | 'possible';
const CONFIDENCES: Confidence[] = ['known', 'likely', 'possible'];

export interface Fact {
  /** A short noun phrase — "coffee", "her sister Priya", "the Dubai trip". */
  subject: string;
  /** What she knows about it, in their terms. */
  value: string;
  confidence: Confidence;
}

/**
 * The categories that never become a stored fact.
 *
 * Matched against subject AND value, because "sleep" is fine and "sleep
 * medication" is not, and the give-away can be in either half. Deliberately
 * broad: a false negative here is a permanent record of something private, and
 * a false positive is one fact she does not keep.
 */
const BLOCKED: Array<{ re: RegExp; why: string }> = [
  // `mg\b` alone matched "MG Road" and refused a location sentence as a health
  // one. Safe direction, wrong reason — and a rule that fires for the wrong
  // reason is a rule nobody can reason about later. A dose has a number.
  { re: /\b(?:diagnos\w*|prescrib\w*|medicat\w*|dosage|\d+\s*mg\b|symptom|illness|disease|cancer|diabet\w*|asthma|thyroid|hiv|blood pressure|cholesterol|surgery|hospital(?:ised|ized)?|clinic|doctor said|test results?|lab results?)\b/i, why: 'health' },
  { re: /\b(?:therapy|therapist|counsell?or|psychiatr\w*|antidepress\w*|anxiety|depress\w*|panic attacks?|bipolar|adhd|autis\w*|ocd|ptsd|self.?harm|suicid\w*|addict\w*|recovery|sober|rehab)\b/i, why: 'mental health' },
  { re: /\b(?:gay|lesbian|bisexual|queer|trans(?:gender)?|non.?binary|pronouns?|sexual(?:ity| orientation)|sex life|dating men|dating women)\b/i, why: 'sexual orientation or activity' },
  { re: /\b(?:hindu|muslim|christian|sikh|jain|buddhist|jew(?:ish)?|atheist|caste|brahmin|dalit|temple|church|mosque|gurudwara|namaz|prayer)\b/i, why: 'religion or caste' },
  { re: /\b(?:bjp|congress|aap|vote[ds]?|voting|political|politics|party|election)\b/i, why: 'political affiliation' },
  { re: /\b(?:visa|green card|citizenship|immigrant|immigration|passport number|deport\w*|asylum)\b/i, why: 'immigration status' },
  { re: /\b(?:arrest\w*|convict\w*|prison|jail|police case|fir\b|lawsuit|court case|charged with)\b/i, why: 'criminal history' },
  { re: /\b(?:aadhaar|aadhar|\bpan\b card|passport no|account number|card number|cvv|upi id|ifsc|otp)\b/i, why: 'identifiers' },
  { re: /\b(?:i am at|currently at|right now at|my address is|lat(?:itude)?\s*[:\-]|long(?:itude)?\s*[:\-])\b/i, why: 'real-time location' },
];

/** Why this fact was refused, or null if it may be kept. */
export function blockedBecause(f: Fact): string | null {
  const hay = `${f.subject} ${f.value}`;
  for (const { re, why } of BLOCKED) if (re.test(hay)) return why;
  return null;
}

/** Nothing empty, nothing enormous, nothing that is really a paragraph. */
const SANE = (s: string, max: number): boolean => {
  const t = s.trim();
  return t.length >= 2 && t.length <= max && t.split(/\s+/).length <= 14;
};

/**
 * Take whatever the model returned and keep only what is safe and shaped.
 *
 * Written as a filter over unknown rather than a cast, because this is model
 * output and a cast is a promise nobody checked. A malformed extraction costs
 * a fact; a trusted one costs a database of nonsense.
 */
export function keepable(raw: unknown): Fact[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: Fact[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const subject = typeof o.subject === 'string' ? o.subject.trim() : '';
    const value = typeof o.value === 'string' ? o.value.trim() : '';
    const confidence = CONFIDENCES.includes(o.confidence as Confidence)
      ? (o.confidence as Confidence)
      : 'possible';
    if (!SANE(subject, 60) || !SANE(value, 200)) continue;
    const f: Fact = { subject, value, confidence };
    if (blockedBecause(f)) continue;
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    // A single turn does not reveal six durable things about somebody. More
    // than this is the model padding, and padding is what fills a profile with
    // guesses that then read as knowledge.
    if (out.length >= 3) break;
  }
  return out;
}

export const EXTRACT_SYSTEM = [
  'You read one exchange between a citizen and Mira and return only DURABLE facts about the citizen.',
  'Durable means it will still be true next month: preferences, people in their life, routines, goals, plans, what they do.',
  'NOT durable, never return: how they feel right now, what they are doing today, anything Mira said, anything you inferred rather than heard, small talk.',
  'NEVER return anything about: health, medication, diagnoses, therapy or mental health, sexual orientation or activity, religion or caste, politics, immigration, criminal matters, account or ID numbers, or where they physically are.',
  'Return JSON only: {"facts":[{"subject":"...","value":"...","confidence":"known|likely|possible"}]}.',
  'subject is a short noun phrase. value is what you know about it, in their words. confidence is "known" only if they said it outright.',
  'Return {"facts":[]} rather than guessing. An empty answer is a good answer.',
].join(' ');

/**
 * The block that goes into the persona.
 *
 * SHE IS TOLD HOW SURE SHE IS, and told to say so. A profile rendered as flat
 * assertions is how an assistant ends up stating a guess back to somebody as
 * though they had said it — which is the same failure as the greeting that
 * claimed to have read a calendar it never fetched.
 */
export function knownBlock(facts: Fact[]): string | null {
  if (!facts.length) return null;
  const said = facts
    .slice(0, 24)
    .map((f) => `${f.subject}: ${f.value}${f.confidence === 'known' ? '' : ` (${f.confidence})`}`)
    .join('; ');
  return (
    `What you know about them, from things they have told you: ${said}. `
    + 'Use it the way a friend uses what they remember — to skip a question you already know the answer to, never as a recital. '
    + 'Anything marked likely or possible is YOUR inference and not something they stated: treat it as a guess, check it before relying on it, and never assert it back to them as fact.'
  );
}
