/**
 * The voice every insight in this hub is written in.
 *
 * The product principle is that the machinery stays invisible. The engine still
 * computes a sidereal chart, transits, numerology and a Dasha period — none of
 * that changes — but the citizen reads an observation about themselves, not a
 * report about the sky. "Venus in Leo favours a generous approach" becomes "you
 * tend to show care most naturally through generosity". Same computation, same
 * determinism, different sentence.
 *
 * Structured panels are the exception, and a deliberate one: the chart chips and
 * the lucky elements are presented as their own labelled data, clearly separate
 * from the prose. The rule this file enforces is about the WRITING — a reading
 * must never explain where it came from, and must never speak as an assistant
 * with opinions of its own.
 *
 * This is enforced rather than merely intended. Deterministic prose is checked
 * by the spec; AI-written prose is checked at runtime by violations() and
 * discarded in favour of the deterministic floor when it drifts. Language rules
 * that live only in a prompt are suggestions, and a model asked to write about
 * astrology will reach for "your chart shows" sooner or later.
 */

/** The name to address someone by. Falls back to nothing rather than guessing. */
export function firstNameOf(name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  // Guard against handles and single-letter placeholders being used as names.
  if (first.length < 2 || /[^\p{L}\p{M}'-]/u.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * The opener on every generated report.
 *
 * A report with no usable name still gets a greeting rather than starting cold
 * mid-sentence — "Dear you," reads oddly, so an unnamed citizen gets a warm
 * neutral line instead of an awkward one.
 */
export function greetingFor(name?: string | null): string {
  const first = firstNameOf(name);
  return first ? `Dear ${first},` : 'Dear friend,';
}

/**
 * Phrasing that must never reach a citizen.
 *
 * Two families. The first exposes the method: chart, stars, cards, planets,
 * signs, retrogrades, house numbers, Life Path numbers, Dasha periods. The
 * second makes the assistant the subject — "I can't", "as an AI", "in my
 * experience" — which the principles rule out entirely, because the
 * conversation is about the citizen and nobody else.
 *
 * Deliberately NOT listed: hedges like "may" and "appears", which the rules
 * actively want, and the word "energy", which is ordinary English about how
 * someone feels.
 */
const BANNED: Array<{ re: RegExp; why: string }> = [
  // ── Methodology ──
  { re: /\byour (?:birth )?chart\b/i, why: 'names the chart' },
  { re: /\b(?:the )?stars? (?:indicate|say|suggest|show|align)/i, why: 'attributes the insight to the stars' },
  { re: /\bthe cards? (?:reveal|say|show|indicate|tell)/i, why: 'attributes the insight to the cards' },
  { re: /\baccording to\b/i, why: 'cites a source' },
  { re: /\b(?:the )?(?:system|engine|algorithm|model) (?:predicts|says|shows|suggests)/i, why: 'names the system' },
  { re: /\byour face (?:suggests|shows|indicates)\b/i, why: 'names the method' },
  { re: /\b(?:Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Rahu|Ketu) (?:in|is in|enters|sits in|moves into)\b/i, why: 'names a planet and placement' },
  { re: /\b(?:retrograde|conjunction|sextile|trine|opposition|ascendant|natal|transit(?:s|ing)?|zodiac|horoscope)\b/i, why: 'astrological terminology' },
  { re: /\b(?:Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b/, why: 'names a sign' },
  { re: /\b(?:life path|personal year|personal month|personal day|numerolog\w*|dasha|mahadasha|antardasha)\b/i, why: 'names the numerology or Dasha system' },
  { re: /\b(?:waxing|waning|gibbous|crescent) (?:moon|phase)?\b/i, why: 'names the moon phase' },
  { re: /\b(?:major|minor) arcana\b/i, why: 'names the deck structure' },
  { re: /\bthis card\b/i, why: 'makes the card the subject' },
  // ── Assistant as subject ──
  { re: /\bas an? (?:AI|language model|assistant)\b/i, why: 'speaks as an assistant' },
  { re: /\bI (?:am|'m) (?:always )?(?:here|sorry|unable|afraid)\b/i, why: 'makes the assistant the subject' },
  { re: /\bI (?:can't|cannot|don't|do not|haven't|have never|never)\b/i, why: 'makes the assistant the subject' },
  { re: /\b(?:my|in my) (?:opinion|experience|view|understanding)\b/i, why: 'offers the assistant\'s perspective' },
];

export interface VoiceViolation { phrase: string; why: string }

/** Every rule this text breaks. Empty means it is safe to send. */
export function violations(text: string): VoiceViolation[] {
  const out: VoiceViolation[] = [];
  for (const { re, why } of BANNED) {
    const m = re.exec(text);
    if (m) out.push({ phrase: m[0], why });
  }
  return out;
}

/** Convenience for the runtime guard: does this pass? */
export const inVoice = (text: string): boolean => violations(text).length === 0;

/**
 * Accept AI prose only if it is long enough to be real AND stays in voice.
 *
 * The fallback is always the deterministic composition, which is written to the
 * same rules and verified by the spec — so a rejected rewrite costs warmth, not
 * correctness. That is the right trade: a slightly flatter sentence is a much
 * smaller problem than one that tells the citizen what their chart shows.
 */
export function acceptOrFallback(candidate: string | undefined, fallback: string, minLength = 40): string {
  const text = (candidate ?? '').trim();
  if (text.length < minLength) return fallback;
  return inVoice(text) ? text : fallback;
}

/**
 * Prepended to every AI call in this hub.
 *
 * Written as hard constraints rather than description, because a model given
 * astrological facts and a soft style note will drift back into astrological
 * language within a paragraph.
 */
export const VOICE_RULES = [
  'You write personal insight for ONE person. Warm, emotionally intelligent, practical, honest.',
  '',
  'ABSOLUTE RULES — breaking any one of these makes the response unusable:',
  '1. Never reveal, name or hint at where the insight came from. No charts, stars, cards, planets,',
  '   signs, houses, moon phases, numbers, periods, systems, models or techniques. Not even obliquely.',
  '2. Never use technical, mystical or esoteric vocabulary. Modern, plain, human language only.',
  '3. Never say "your chart shows", "the stars indicate", "the cards reveal", "according to",',
  '   "the system predicts". Write the insight directly instead: "you tend to…", "you may find that…",',
  '   "a recurring pattern appears to be…", "one strength that stands out…", "you often feel most',
  '   fulfilled when…", "this period may encourage you to…".',
  '4. Never make yourself the subject. No "I", no "as an AI", no "my opinion", no "I\'m always here".',
  '   The conversation is about this person and nobody else. If tempted to talk about yourself,',
  '   turn the sentence back to them.',
  '5. Never predict specific events or guarantee outcomes. Use "may", "appears", "could",',
  '   "one possible pattern is". Themes and guidance, never certainties.',
  '6. Use ONLY the interpretation provided. Never invent facts about this person.',
  '',
  'Every passage should answer three things: what this means for them, why it matters to where they',
  'are right now, and what they can practically do with it. Leave them with clarity and a next step.',
].join('\n');

/** Extra constraints for the conversational surface, where the pull toward
 *  first-person answering is strongest. */
export const CHAT_RULES = [
  VOICE_RULES,
  '',
  'This is a reply to a question they asked. Answer it about THEM — their patterns, their tendencies,',
  'their situation — never from your own perspective. When they ask about another person, talk about',
  'the emotional dynamic, the communication styles, where the two of them harmonise and where',
  'misunderstanding tends to start, and what would practically improve it. Do not state assumptions',
  'as certainty.',
].join('\n');
