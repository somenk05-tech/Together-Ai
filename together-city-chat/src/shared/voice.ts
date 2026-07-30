import { informalName, salutation } from './salutation';

/**
 * How Together City speaks — everywhere, not just in the Astrology Zone.
 *
 * The astrology hub has had an enforced voice since `astrology/voice.ts`, and it
 * worked: the rules live in code, the AI's output is checked against them, and
 * anything that drifts is discarded in favour of deterministic text. What it did
 * not do is apply anywhere else, so a citizen reading their blood results or a
 * booking confirmation met a different, colder app.
 *
 * This is the city-wide version. Astrology keeps its own module because it bans
 * a whole vocabulary nothing else needs (planets, signs, Dasha periods); these
 * are the rules that hold in every hub.
 *
 * ── The voice ──────────────────────────────────────────────────────────────
 *
 * PERSONAL. Second person, addressed to one citizen, opening with their name.
 * Never "users", never "the patient", never "one might".
 *
 * EMOTIONAL. It acknowledges how something might land before explaining it. A
 * low haemoglobin result is a fact and also a small fright; a message that
 * handles only the fact has handled half of it.
 *
 * HONEST. Warmth is not reassurance. "This is nothing to worry about" is a
 * clinical claim wearing a friendly coat, and it is banned outright. The
 * emotional register may soften how something is said and never what is said —
 * which is the same rule as the rest of this codebase: no screen invents data,
 * and no sentence invents comfort.
 *
 * NOT ABOUT ITSELF. The assistant is never the subject. "I'm here to help",
 * "as an AI", "I'd recommend" — all gone. The conversation is about the citizen
 * and nobody else.
 */

interface Rule { re: RegExp; why: string }

const BANNED: Rule[] = [
  // ── The assistant as subject ──────────────────────────────────────────
  { re: /\bas an? (?:AI|language model|assistant|chatbot)\b/i, why: 'speaks as an assistant' },
  { re: /\bI(?:'m| am) (?:just )?(?:an?|here|sorry|unable|afraid|happy to)\b/i, why: 'makes the assistant the subject' },
  { re: /\bI (?:can't|cannot|can not|don't|do not|won't|will not)\b/i, why: 'makes the assistant the subject' },
  { re: /\b(?:my|in my) (?:opinion|experience|view|understanding|assessment)\b/i, why: "offers the assistant's perspective" },
  { re: /\b(?:I'd|I would) (?:recommend|suggest|advise)\b/i, why: 'makes the assistant the recommender' },
  { re: /\blet me\b/i, why: 'narrates the assistant' },

  // ── Talking about people instead of to one ────────────────────────────
  // "user" and "patient" only. "the client" and "the customer" were in this
  // list until the scan ran over the codebase and found "Be the voice of the
  // customer" in a job-posting blurb — where the customer is the employer's,
  // not the reader. A guard that fires on correct writing gets switched off.
  // Not followed by a capital. "the User Content Licence" is a document title
  // in the terms of service, correctly written; "the user should" is not. This
  // is the second time this rule has been narrowed by contact with real copy,
  // which is the right direction — a guard that fires on good writing is one
  // somebody turns off.
  // No `i` flag, deliberately: with it, [A-Z] in the lookahead also matches
  // lowercase, so the exception swallowed every case and the rule stopped
  // firing at all. My own tests caught that, which is the argument for having
  // written them for a regex.
  { re: /\b[Tt]he (?:[Uu]ser|[Pp]atient|[Ii]ndividual)\b(?!\s+[A-Z])/, why: 'refers to the reader in the third person' },
  { re: /\busers (?:should|can|may|must|will)\b/i, why: 'addresses a category, not a person' },
  { re: /\bone (?:should|might|may|could) (?:consider|note|find)\b/i, why: 'impersonal construction' },

  // ── Comfort the app is not entitled to give ───────────────────────────
  // The emotional register may change how something is said, never what.
  { re: /\b(?:nothing|no reason) to (?:worry|be concerned|be alarmed)\b/i, why: 'a clinical reassurance the app cannot make' },
  { re: /\b(?:don't|do not) worry\b/i, why: 'dismisses a feeling instead of acknowledging it' },
  { re: /\byou(?:'re| are) (?:completely |totally |perfectly )?(?:fine|healthy|okay)\b/i, why: 'a clinical claim about the reader' },
  { re: /\bthis is (?:completely |perfectly |totally )?normal\b/i, why: 'reassurance stated as fact' },

  // ── Filler that reads as machine ──────────────────────────────────────
  { re: /\bit(?:'s| is) important to (?:note|remember|understand)\b/i, why: 'stock filler' },
  { re: /\bplease note that\b/i, why: 'stock filler' },
  { re: /\bin conclusion\b/i, why: 'essay scaffolding' },
  { re: /\bbased on the (?:data|information) (?:provided|available)\b/i, why: 'names its own inputs' },
];

export interface VoiceViolation { phrase: string; why: string }

/** Every rule this text breaks. Empty means it is safe to show. */
export function violations(text: string): VoiceViolation[] {
  const out: VoiceViolation[] = [];
  for (const { re, why } of BANNED) {
    const m = re.exec(text ?? '');
    if (m) out.push({ phrase: m[0], why });
  }
  return out;
}

export const inVoice = (text: string): boolean => violations(text).length === 0;

/**
 * Accept AI prose only if it is substantial AND stays in voice.
 *
 * Same trade the astrology hub makes: the fallback is deterministic text
 * written to the same rules, so a rejected rewrite costs warmth and never
 * correctness. A flatter sentence is a much smaller problem than one telling a
 * citizen there is nothing to worry about.
 */
export function acceptOrFallback(candidate: string | undefined, fallback: string, minLength = 40): string {
  const text = (candidate ?? '').trim();
  if (text.length < minLength) return fallback;
  return inVoice(text) ? text : fallback;
}

/**
 * Prepended to every AI system prompt in the city.
 *
 * Hard constraints rather than a style note, because a model asked to be "warm"
 * will produce "I'm here to help you on your wellness journey!" — which is warm
 * about itself. The rules name the failure modes instead of describing the goal.
 */
export function cityVoice(name?: string | null): string {
  const first = informalName(name);
  return [
    `You are writing directly to ${first}, one person, in the second person.`,
    `Open by addressing them: "${salutation(name)}".`,
    'Be personal and emotionally present: acknowledge how something might land before explaining it.',
    'Warmth never changes the facts. Never say there is nothing to worry about, never call a result normal or fine, never reassure beyond what the numbers support. Softening how something is said is allowed; softening what is said is not.',
    'Never refer to yourself. No "as an AI", no "I recommend", no "let me". You are not a character in this.',
    `Never write "the user", "the patient" or "users" — it is ${first}, and you are talking to them.`,
    'No stock filler: "it is important to note", "please note that", "in conclusion".',
    'Short sentences. Plain words. Say the difficult thing plainly and then say what can be done about it.',
  ].join(' ');
}

/** The rules as a list, for docs and for the spec to assert against. */
export const CITY_VOICE_RULES = [
  'second person, addressed to one named citizen',
  'emotionally present before explanatory',
  'warmth never alters the facts',
  'the assistant is never the subject',
  'no third-person references to the reader',
  'no stock filler',
] as const;
