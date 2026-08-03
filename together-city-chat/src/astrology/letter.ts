import { firstNameOf, violations, type VoiceViolation } from './voice';

/**
 * The letter contract.
 *
 * The Astrology Zone's daily and monthly guidance are letters now — one
 * continuous piece of prose from someone who has known you a while, and nothing
 * else. No sections, no headings, no chips, no lucky numbers, no reflection box.
 * The whole surface is the letter.
 *
 * That is a much harder thing to hold than a set of labelled panels, because
 * every constraint that used to be structural is now a property of the PROSE.
 * A section called "Career & Work" cannot accidentally become a bullet list; a
 * flowing letter can. A chip reading "🪐 Saturn Dasha" was labelled data and was
 * allowed to name the machinery; a sentence in the letter never is. So the rules
 * live here, as functions, and the service refuses to send anything that breaks
 * one.
 *
 * WHY REFUSAL RATHER THAN REPAIR. The old daily had a deterministic composition
 * as its floor: if the model was off or drifted, the citizen still got prose,
 * assembled from a fixed skeleton. That was right for five short labelled
 * sections. It is wrong here. The brief for this letter says it must never
 * repeat a phrase, never reuse a sentence structure, never sound templated —
 * and a template cannot honour that, by definition. A letter assembled from
 * parts and presented as a letter written this morning for one person is
 * exactly the species of comfortable untruth this codebase has spent a
 * fortnight removing. So when the letter cannot be written properly, the page
 * says so, and nothing is cached.
 */

/** How long a letter of each kind should run. Prose, so these are ranges. */
export const DAILY_WORDS = { min: 230, max: 430 } as const;
export const MONTHLY_WORDS = { min: 820, max: 1500 } as const;

export const SIGN_OFF = '— Together City';

export interface Letter {
  /** "Dear Somen," — always the first line, always its own paragraph. */
  salutation: string;
  /** The letter itself. Paragraphs separated by a blank line, nothing else. */
  body: string;
  /** Always SIGN_OFF. Stored rather than assumed so a client renders what it was sent. */
  signOff: string;
  words: number;
}

/**
 * Vocabulary the letter may never contain.
 *
 * `violations()` in voice.ts is the hub-wide baseline and stays as it is: it
 * bans naming the method, and it bans the assistant becoming the subject. It
 * deliberately tolerates a planet name that is not attached to a placement
 * ("Saturn" alone passes there) because the gem panel is labelled data and is
 * ALLOWED to say which lord a stone belongs to.
 *
 * A letter has no labelled data in it. Every word is prose, so the bar is the
 * strict one: these terms may not appear at all, in any grammar, anywhere.
 *
 * Two judgement calls worth recording. `energy` stays legal — it is ordinary
 * English for how someone feels, and the brief bans "energy shift", not the
 * word. `sun` and `moon` are banned outright even though "the morning sun" is
 * innocent prose; the cost is one lost image, and the alternative is a
 * word-by-word exception list that the next drift walks straight through.
 */
const LETTER_BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /\bastrolog\w*\b/i, why: 'names the practice' },
  { re: /\bhoroscope\w*\b/i, why: 'names the practice' },
  { re: /\bzodiac\w*\b/i, why: 'names the practice' },
  { re: /\bvedic\b/i, why: 'names the tradition' },
  { re: /\b(?:rashi|lagna|nakshatra|dasha|mahadasha|antardasha|yoga|yogas|kundli|kundali|jyotish\w*)\b/i, why: 'names the system' },
  { re: /\b(?:ascendant|midheaven|natal|ephemeris|sidereal|tropical chart)\b/i, why: 'technical terminology' },
  { re: /\b(?:sun|moon|mercury|venus|mars|jupiter|saturn|rahu|ketu|pluto|neptune|uranus)\b/i, why: 'names a planet' },
  { re: /\bplanet\w*\b/i, why: 'names the machinery' },
  { re: /\bretrograde\b/i, why: 'technical terminology' },
  { re: /\b(?:waxing|waning|gibbous|crescent|lunar|lunation)\b/i, why: 'names the moon phase' },
  { re: /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) house\b/i, why: 'names a house' },
  { re: /\bnumerolog\w*\b/i, why: 'names the system' },
  { re: /\blife path\b/i, why: 'names the system' },
  { re: /\bpersonal (?:year|month|day) (?:number|\d)\b/i, why: 'names the system' },
  { re: /\bface (?:reading|analysis)\b/i, why: 'names the method' },
  { re: /\b(?:destiny|karma|karmic|fate|foretold|prophec\w*)\b/i, why: 'mystical framing' },
  { re: /\bprediction\w*\b/i, why: 'frames guidance as prediction' },
  { re: /\b(?:vibration\w*|energy shift|cosmic|celestial|the universe (?:is|has|wants|will))\b/i, why: 'mystical framing' },
  { re: /\b(?:aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i, why: 'names a sign' },
  // These three are in voice.ts's baseline too, but only in their giveaway
  // grammar ("your chart shows", "the stars indicate"). A letter has no reason
  // to contain the bare nouns at all, and the bare nouns are what a writer
  // reaches for when it has been told not to write the sentence.
  { re: /\bcharts?\b/i, why: 'names the chart' },
  { re: /\bstars?\b/i, why: 'names the stars' },
  { re: /\b(?:tarot|the cards)\b/i, why: 'names the deck' },
  { re: /\byour reading\b/i, why: 'calls the letter a reading' },
];

/**
 * Closings the brief rules out by name, plus their obvious neighbours.
 *
 * The instruction was to finish the thought rather than sign off at it. "Good
 * luck" is not a warm ending; it is the sentence you write when you have run
 * out of things to say and want the reader to know the letter is over.
 */
const BANNED_CLOSERS: Array<{ re: RegExp; why: string }> = [
  { re: /\bgood luck\b/i, why: 'a stock closing' },
  { re: /\bhave a (?:wonderful|great|lovely|good|beautiful) (?:day|month|week)\b/i, why: 'a stock closing' },
  { re: /\bstay positive\b/i, why: 'a stock closing' },
  { re: /\b(?:best wishes|warm regards|kind regards|sincerely yours|yours truly)\b/i, why: 'a form-letter closing' },
  { re: /\bwishing you (?:all the best|well|luck)\b/i, why: 'a stock closing' },
  { re: /\bsending you (?:love|light|positive)\b/i, why: 'mystical framing' },
];

/** Shapes a letter must not have: it is prose, and prose has no furniture. */
const STRUCTURE: Array<{ test: (body: string) => boolean; why: string }> = [
  { test: (b) => /^\s*#{1,6}\s/m.test(b), why: 'a markdown heading' },
  { test: (b) => /^\s*(?:[-*•–]|\d+[.)])\s+/m.test(b), why: 'a bullet or numbered list' },
  { test: (b) => /\*\*|__|`/.test(b), why: 'markdown emphasis' },
  // A short line ending in a colon is a label with the styling taken off.
  // "Career:" and "Health & Energy:" are exactly what this page stopped being.
  //
  // The leading `[^\p{L}\p{N}]*` is not decoration. The first draft anchored on
  // a capital letter, and the page it was written to refuse opens every one of
  // its labels with an emoji — "💼 Career & Work:" walked straight through, and
  // was only caught by the rule below that knows those five headings by name.
  // A label does not stop being a label because something is sitting in front
  // of it.
  { test: (b) => b.split('\n').some((l) => /^[^\p{L}\p{N}]*\p{Lu}[^.!?]{0,42}:\s*$/u.test(l)), why: 'a section label' },
  { test: (b) => /\b(?:career|relationships?|health|finance|money|personal growth)\s*(?:&|and)?\s*(?:work|energy)?\s*:/i.test(b), why: 'one of the old section headings' },
  { test: (b) => /^\s*(?:P\.?S\.?|Note|Reminder|Summary|Takeaway)\b\s*[:—-]/im.test(b), why: 'an appended note rather than a finished thought' },
  { test: (b) => /\bDear\s/i.test(b), why: 'a second salutation inside the body' },
  { test: (b) => /\n{3,}/.test(b), why: 'a gap wide enough to read as a section break' },
];

export interface LetterProblem { what: string; why: string }

/**
 * The vocabulary check on its own, for text that is not a whole letter.
 *
 * The brief handed to the writer has to pass this too. It is the only thing the
 * writer sees, so anything in it can be echoed back verbatim — a brief that
 * says "their Saturn period" is a leak with one extra step in it, and the
 * writer would be right to think it was allowed.
 */
export function bannedVocabulary(text: string): LetterProblem[] {
  const out: LetterProblem[] = [];
  for (const { re, why } of LETTER_BANNED) {
    const m = re.exec(text ?? '');
    if (m) out.push({ what: m[0], why });
  }
  return out;
}

/**
 * Everything wrong with a candidate letter. Empty means it can be sent.
 *
 * `previous` is the bodies of the letters this person has most recently been
 * sent. A letter that reuses their shapes is a templated letter wearing a
 * different day's facts, which is the failure this whole design exists to
 * avoid — so it is checked here rather than hoped for in the prompt.
 */
export function letterProblems(
  candidate: string, kind: 'daily' | 'monthly', firstName: string, previous: string[] = [],
): LetterProblem[] {
  const out: LetterProblem[] = [];
  const text = (candidate ?? '').trim();
  const expected = salutationFor(firstName);

  if (!text) return [{ what: 'empty', why: 'there is no letter' }];
  if (!text.startsWith(expected)) {
    out.push({ what: text.slice(0, 40), why: `does not open with "${expected}"` });
  }
  const body = text.startsWith(expected) ? text.slice(expected.length).trim() : text;

  const range = kind === 'daily' ? DAILY_WORDS : MONTHLY_WORDS;
  const words = wordsIn(body);
  if (words < range.min) out.push({ what: `${words} words`, why: `shorter than ${range.min}` });
  if (words > range.max) out.push({ what: `${words} words`, why: `longer than ${range.max}` });

  for (const { re, why } of LETTER_BANNED) {
    const m = re.exec(body);
    if (m) out.push({ what: m[0], why });
  }
  for (const { re, why } of BANNED_CLOSERS) {
    const m = re.exec(body);
    if (m) out.push({ what: m[0], why });
  }
  for (const { test, why } of STRUCTURE) {
    if (test(body)) out.push({ what: why, why: 'a letter has no furniture in it' });
  }
  // The hub-wide rules still apply — naming the method, and the assistant
  // becoming the subject. This is a superset check, not a replacement.
  for (const v of violations(body) as VoiceViolation[]) {
    out.push({ what: v.phrase, why: v.why });
  }
  for (const prior of previous) {
    const overlap = shingleOverlap(body, prior);
    if (overlap >= REPEAT_LIMIT) {
      out.push({ what: `${Math.round(overlap * 100)}% shared phrasing`, why: 'reuses a previous letter' });
      break;
    }
  }
  return out;
}

/**
 * How much of a letter may echo one they have already read.
 *
 * Some overlap is unavoidable and desirable — the same person, the same voice,
 * ordinary English. Five-word runs are the unit because that is roughly where
 * coincidence stops and reuse starts: two letters can both contain "one small
 * step rather than", and if a fifth of one letter's five-word runs already
 * appeared in another, it is the same letter with different nouns.
 */
export const REPEAT_LIMIT = 0.2;

/** Fraction of `a`'s five-word runs that also occur in `b`. 0 when either is short. */
export function shingleOverlap(a: string, b: string, n = 5): number {
  const grams = (s: string) => {
    const w = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
    return out;
  };
  const A = grams(a), B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / A.size;
}

export const wordsIn = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

/**
 * How the letter opens.
 *
 * Someone with no usable name gets "Dear friend," rather than "Dear ," — the
 * same choice greetingFor() makes for the same reason, kept here because the
 * salutation is now load-bearing: it is checked, not decorative.
 */
export function salutationFor(firstName?: string | null): string {
  const first = firstNameOf(firstName);
  return first ? `Dear ${first},` : 'Dear friend,';
}

/** Split a validated candidate into the shape the client renders. */
export function toLetter(candidate: string, firstName?: string | null): Letter {
  const salutation = salutationFor(firstName);
  const text = candidate.trim();
  const body = (text.startsWith(salutation) ? text.slice(salutation.length) : text)
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n');
  return { salutation, body, signOff: SIGN_OFF, words: wordsIn(body) };
}

/**
 * The rules the letter is written to.
 *
 * Written as prohibitions rather than description because a model handed a
 * warm brief and a soft style note produces a warm, softly-structured page
 * with headings in it. Everything here is checked afterwards by
 * letterProblems(), so none of it is a suggestion — but a model that is told
 * the rule usually keeps it, and a rejected letter costs the citizen their
 * letter for the day.
 */
export function letterRules(kind: 'daily' | 'monthly', firstName?: string | null): string {
  const range = kind === 'daily' ? DAILY_WORDS : MONTHLY_WORDS;
  const salutation = salutationFor(firstName);
  return [
    'You are writing one letter to one person. Think of an older brother who has quietly watched',
    'this person\'s life for years — calm, observant, emotionally intelligent, never impressed with',
    'himself. He does not tell them what will happen. He notices what they are likely to run into,',
    'and says the useful thing about it.',
    '',
    'FORM — every one of these is checked, and a letter that breaks one is discarded unsent:',
    `1. The first line is exactly: ${salutation}`,
    '2. After that, continuous prose. No headings. No labels. No bullet points. No numbered lists.',
    '   No bold, no italics, no markdown of any kind. Paragraph breaks only, and only when a',
    '   paragraph has genuinely grown too long to read comfortably.',
    '3. Never signal a change of subject. Career, relationships, health, money and growth may all be',
    '   in here, but they must arrive as one person\'s train of thought, not as topics being covered.',
    '   If a sentence could be preceded by a heading, rewrite it.',
    `4. Between ${range.min} and ${range.max} words, not counting the opening line.`,
    '5. End by finishing the thought, gently. Never "good luck", never "have a wonderful day",',
    '   never "stay positive", never a sign-off phrase of any kind — the letter is signed for you.',
    '',
    'LANGUAGE — never use, hint at, or work around any of these:',
    'astrology, horoscope, zodiac, signs, charts, planets and any planet name, the sun, the moon or',
    'its phases, houses, periods, retrogrades, numerology, life path or personal numbers, face',
    'reading, destiny, karma, fate, prediction, vibrations, energy shifts, the cosmos, the universe',
    'as an actor. The person must never be able to tell what produced this letter. Translate every',
    'observation into how a day actually feels: not "communication may be difficult today" but',
    '"if something feels slightly misunderstood today, don\'t rush to explain yourself — a little',
    'patience will probably lead to a much better conversation later".',
    '',
    'VOICE:',
    '- Never preach. Never lecture. Never flatter. Never promise an outcome. Never manufacture fear.',
    '- Never make yourself the subject. No "I think", no "I\'m here for you", no "as an AI".',
    '- Hedge honestly — "tends to", "you may find", "probably" — because none of this is certain.',
    '- Do not open with the weather of the day or a summary of what the letter will cover.',
    '  Start where a person starts: in the middle of something.',
    '- Use their name at most once more after the opening, and only where it genuinely lands.',
    '',
    'The reader should finish thinking "this is surprisingly close to where I actually am" — and',
    'should never once think about how it was written.',
  ].join('\n');
}

/**
 * What the model is allowed to know.
 *
 * It receives the INTERPRETATION and never the inputs. This is the same rule the
 * old daily settled on, and the reason is unchanged: the vocabulary that must
 * never reach the citizen is exactly the vocabulary of the inputs, and handing
 * it over as "facts to stay faithful to" is an invitation to repeat it. The
 * brief below is already ordinary English about a person, so nothing is lost.
 */
export function letterPrompt(
  observations: string[], firstName: string, previous: string[], extra?: string,
): string {
  const avoid = previous.length
    ? '\n\nYou have written to this person before. Here are the last letters, in full. Do not reuse ' +
      'their openings, their rhythms, their images or their sentence shapes — a reader who keeps ' +
      'every letter must not be able to see the pattern:\n\n' +
      previous.map((p, i) => `--- letter ${i + 1} ---\n${p}`).join('\n\n')
    : '';
  return [
    firstName ? `Their name is ${firstName}.` : 'You do not know their name; address them as "friend".',
    '',
    'What is true about them and about the period ahead. Every one of these must be reflected',
    'somewhere in the letter, in your own words, without ever being listed:',
    ...observations.map((o) => `- ${o}`),
    extra ? `\n${extra}` : '',
    avoid,
  ].filter(Boolean).join('\n');
}
