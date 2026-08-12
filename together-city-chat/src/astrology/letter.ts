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

/**
 * How long a letter of each kind should run. Prose, so these are ranges.
 *
 * THESE WERE FAR LONGER UNTIL TODAY, and the owner was right to cut them.
 * A daily of 230–430 words and a monthly of 820–1500 read, on the page,
 * as an article about you rather than a letter to you — and the second half of
 * a long letter is where a writer with nothing left to say starts restating
 * the first half in new words. Length was doing the work that insight is
 * supposed to do.
 *
 * A tighter range is a harder brief, not an easier one: 110 words cannot carry
 * five topics, so the writer has to decide which single thing is worth saying.
 * That decision is the product.
 */
export const DAILY_WORDS = { min: 80, max: 150 } as const;
/**
 * THE MONTH IS NOT A LONG DAY, and the owner's second look said so. 120–180
 * was the daily's discipline applied to a longer period, and it undersold what
 * a month actually contains: a day has one thing worth saying, a month has a
 * shape — what it is asking, where the judgement is sharpest, what to protect.
 * Three hundred words is room for that and still nowhere near the 820–1500 it
 * replaced. The test that it fits one letter composition is the page, not the
 * count.
 */
export const MONTHLY_WORDS = { min: 240, max: 320 } as const;

/** The letter's own title. Short enough to set as one display line. */
export const TITLE_WORDS = { min: 3, max: 7 } as const;

/**
 * How the letter ends.
 *
 * It was "— Together City", and the owner cut the name: a letter signed by a
 * company is a newsletter, and the one thing this surface is not allowed to
 * feel like is a broadcast. What is left is the closing on its own — the warmth
 * without the letterhead. Nobody needs telling which application they are
 * standing in; the header says it twice already.
 *
 * Still stored on the letter rather than assumed by the client, for the reason
 * it always was: a screen renders what it was sent, so an archived letter keeps
 * the ending it was actually written with.
 */
export const SIGN_OFF = 'With care,';

export interface Letter {
  /**
   * The letter's title — "Move, But Don't Rush". Three to seven words naming
   * what the day is actually asking, written by the same pass that writes the
   * letter and validated as strictly.
   *
   * It is a SEPARATE FIELD rather than the first line of the body, which is
   * the whole reason letterProblems() below did not have to change: the title
   * is not prose, it is a name for the prose, and folding it into the body
   * would have made every structural rule in this file ambiguous about its own
   * first line.
   */
  title: string;
  /** "Dear Somen," — always the first line, always its own paragraph. */
  salutation: string;
  /** The letter itself. Paragraphs separated by a blank line, nothing else. */
  body: string;
  /** Always SIGN_OFF — see there for why it is stored rather than assumed. */
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
 * Titles the letter may not wear.
 *
 * The owner named three by hand — "Daily Horoscope", "Your Horoscope Today",
 * "Today's Astrology" — and the first two words of each are the tell: a title
 * that names the PRODUCT is the one thing a personal letter never does. The
 * banned-vocabulary list already kills "horoscope" and "astrology"; what these
 * add is the neighbouring family a writer reaches for once those are refused,
 * and the second kind of failure, which is a title that says where you already
 * know you are. "Today" is printed above the title as a label. Repeating it as
 * the title is a heading, not a name.
 */
const BANNED_TITLES: Array<{ re: RegExp; why: string }> = [
  { re: /^\s*(?:your\s+|the\s+|a\s+)?(?:daily|monthly|weekly)?\s*(?:horoscope|forecast|outlook|guidance|prediction|reading|report)\b/i,
    why: 'names the product rather than the day' },
  { re: /^\s*(?:today|tomorrow|this\s+month|the\s+month\s+ahead|the\s+day\s+ahead|your\s+day|your\s+month|your\s+week)\b/i,
    why: 'says where you are, which the label above it already says' },
  { re: /^\s*dear\b/i, why: 'the salutation, not a title' },
  { re: /^\s*(?:a\s+)?letter\b/i, why: 'names the form' },
];

/**
 * Everything wrong with a candidate title. Empty means it can be printed.
 *
 * The whole vocabulary ban applies here and then some, because a title is the
 * one line everybody reads and the only line that gets screenshotted. A
 * fifty-word letter that stays clean and a title that says "Saturn's Lesson"
 * has still told the reader exactly what produced it.
 */
export function titleProblems(candidate: string): LetterProblem[] {
  const out: LetterProblem[] = [];
  const title = (candidate ?? '').trim();
  if (!title) return [{ what: 'empty', why: 'there is no title' }];

  const words = wordsIn(title);
  if (words < TITLE_WORDS.min) out.push({ what: `${words} words`, why: `shorter than ${TITLE_WORDS.min}` });
  if (words > TITLE_WORDS.max) out.push({ what: `${words} words`, why: `longer than ${TITLE_WORDS.max}` });
  // Set large, on one line, in a narrow column. This is where it stops fitting.
  if (title.length > 46) out.push({ what: `${title.length} characters`, why: 'too long to set as one display line' });
  if (/\n/.test(title)) out.push({ what: 'a line break', why: 'a title is one line' });
  if (/[.:;]\s*$/.test(title)) out.push({ what: title.slice(-1), why: 'a title does not end in punctuation' });
  if (/:/.test(title)) out.push({ what: ':', why: 'a colon turns a title into a label' });
  if (/^["'\u2018\u2019\u201c\u201d]|["'\u2018\u2019\u201c\u201d]$/.test(title)) {
    out.push({ what: 'quotation marks', why: 'a title is not a quotation' });
  }
  if (/\p{L}/u.test(title) && title === title.toUpperCase()) {
    out.push({ what: title, why: 'set in capitals rather than written' });
  }
  for (const { re, why } of BANNED_TITLES) if (re.test(title)) out.push({ what: title, why });
  out.push(...bannedVocabulary(title));
  for (const v of violations(title) as VoiceViolation[]) out.push({ what: v.phrase, why: v.why });
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
export function toLetter(candidate: string, firstName?: string | null, title = ''): Letter {
  const salutation = salutationFor(firstName);
  const text = candidate.trim();
  const body = (text.startsWith(salutation) ? text.slice(salutation.length) : text)
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n\n');
  return { title: title.trim(), salutation, body, signOff: SIGN_OFF, words: wordsIn(body) };
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
    `0. A TITLE, returned separately from the letter: ${TITLE_WORDS.min} to ${TITLE_WORDS.max} words naming what this`,
    '   period is actually asking of them — "Move, But Don\'t Rush", "Let the Quiet Work",',
    '   "Say the Thing Plainly". It is the title of a personal letter, not the name of a product:',
    '   never "Daily Horoscope", never "Your Reading", never "Today" or "This Month" (both are',
    '   already printed above it), no colon, no full stop, no quotation marks, not in capitals.',
    `1. The first line of the letter is exactly: ${salutation}`,
    '2. After that, continuous prose. No headings. No labels. No bullet points. No numbered lists.',
    '   No bold, no italics, no markdown of any kind. Paragraph breaks only, and only when a',
    '   paragraph has genuinely grown too long to read comfortably.',
    '3. Never signal a change of subject. Career, relationships, health, money and growth may all be',
    '   in here, but they must arrive as one person\'s train of thought, not as topics being covered.',
    '   If a sentence could be preceded by a heading, rewrite it.',
    `4. Between ${range.min} and ${range.max} words, not counting the opening line. This is short on`,
    '   purpose and it is the hardest rule here. You cannot cover several areas of a life in that',
    '   space, so do not try: choose the ONE thing worth saying and say it properly. Every sentence',
    '   must earn its place — if a sentence restates the one before it in different words, or could',
    '   be deleted without the reader losing anything, delete it. Do not solve length by writing',
    '   faster or vaguer; solve it by having less to say and meaning all of it.',
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
/**
 * THE BRIEF ASKED FOR A LETTER THE RULES FORBID, and production said so for a
 * week in a line nobody was reading:
 *
 *   daily letter rejected (attempt 1): 155 words — longer than 150
 *   daily letter rejected (attempt 2): 187 words — longer than 150
 *
 * This function used to open with "Every one of these must be reflected
 * somewhere in the letter" above ELEVEN observations, while rule 4 of
 * letterRules caps a daily at 150 words and tells the writer to choose the ONE
 * thing worth saying. Both instructions cannot be obeyed. The writer chose
 * coverage — the more reasonable reading of a contradictory brief — went over
 * the cap every time, and the letter was discarded unsent. The citizen got
 * "Today's letter isn't ready yet" on a day when it had in fact been written
 * three times.
 *
 * So the brief now says what it actually wants: a few observations to WRITE
 * ABOUT, and the rest as material that may be used only if the letter still
 * fits. Nothing is dropped from the prompt — the writer sees everything, and
 * is told what is load-bearing.
 *
 * `lead` is a count rather than a separate list because the composer already
 * orders its observations the way a letter tends to want them — the shape of
 * the period first, then work, people, body, money, the long view — and the
 * transit hits it leads with are ranked by orb. The first few ARE the news.
 */
export function letterPrompt(
  observations: string[], firstName: string, previous: string[], extra?: string, lead = 3,
): string {
  const avoid = previous.length
    ? '\n\nYou have written to this person before. Here are the last letters, in full. Do not reuse ' +
      'their openings, their rhythms, their images or their sentence shapes — a reader who keeps ' +
      'every letter must not be able to see the pattern:\n\n' +
      previous.map((p, i) => `--- letter ${i + 1} ---\n${p}`).join('\n\n')
    : '';
  const head = observations.slice(0, Math.max(1, lead));
  const rest = observations.slice(Math.max(1, lead));
  return [
    firstName ? `Their name is ${firstName}.` : 'You do not know their name; address them as "friend".',
    '',
    'WRITE ABOUT THESE. They are what is true about this person and this period, and they are the',
    'letter\'s subject — in your own words, woven together, never listed:',
    ...head.map((o) => `- ${o}`),
    ...(rest.length ? [
      '',
      'ALSO TRUE, AND OPTIONAL. Use one only if it belongs in the same thought and the letter still',
      'fits inside its length. Leaving all of them out is the right answer more often than not —',
      'the length rule wins every argument with this list:',
      ...rest.map((o) => `- ${o}`),
    ] : []),
    extra ? `\n${extra}` : '',
    avoid,
  ].filter(Boolean).join('\n');
}
