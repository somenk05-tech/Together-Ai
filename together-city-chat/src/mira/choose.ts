export interface Choice { label: string; path: string }

/**
 * She asked a question. This is her reading the answer.
 *
 * ── THE LOOP THIS ENDS ────────────────────────────────────────────────────
 *
 * Found in production, in the owner's own chat:
 *
 *     — You can't assess my astrology profile
 *     — Two places that could be: Astrology or Profile. Which one?
 *     — Astrology
 *     — Two places that could be: Astrology or Log. Which one?
 *
 * Two separate faults, and both had to go.
 *
 * FIRST, she was not decisive. `findInCity` returned its top two and the
 * service asked whenever there were two, even when the first was an exact name
 * match and the second was a room that merely contained the word. "Astrology"
 * scoring 1.0 against "Astrology Log" scoring 0.5 is not ambiguity, it is an
 * answer with a runner-up. That is fixed in `city.ts`, which now returns the
 * score, and in the service, which requires a real contest before asking.
 *
 * SECOND — and this is the loop — SHE DID NOT KNOW SHE HAD ASKED. Every turn
 * started from nothing, so "Astrology" arrived as a fresh utterance and went
 * back through the same matcher that had just produced the question. She could
 * have gone round for ever, and did.
 *
 * ── WHY THIS IS STATELESS ─────────────────────────────────────────────────
 *
 * No session store, no conversation row, no server-side memory. The options she
 * offered ride out on the reply and come back on the next ask, exactly as
 * `hour` and `recent` already do. The whole codebase works this way and it is
 * not laziness: a server that remembers the last question is a server that has
 * to expire it, scope it to a device, and decide what happens when two tabs
 * disagree.
 *
 * ── WHAT COUNTS AS AN ANSWER ──────────────────────────────────────────────
 *
 * People answer a two-way question in about five ways, and all of them are
 * cheap to accept. What is NOT accepted is a partial-word guess: "pro" does not
 * select "Profile". A wrong guess here sends somebody to a page they did not
 * ask for and — worse — teaches them that answering her is a gamble.
 *
 * ── AND "NO" IS AN ANSWER ─────────────────────────────────────────────────
 *
 * "no", "neither", "none", "both", "cancel", "stop" all used to fall out of
 * here as `undefined`, which the service reads as "not an answer" and re-routes
 * as a fresh request — so declining her question navigated somewhere. Somebody
 * who says "neither" has told her something specific: the question was wrong.
 * That is a third outcome, not a missing one, and it has its own return so the
 * caller can drop the pending question instead of acting on it.
 */
const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * WHAT SHE DOES WITH A REFUSAL IS THE CALLER'S BUSINESS. This only names it.
 *
 * Anchored on the whole answer rather than searched for inside it, because
 * "no" and "all" are ordinary words in the middle of a sentence and a refusal
 * that fires on "no idea, the second one" is worse than one that never fires.
 */
export type Refusal = 'none' | 'both';

/** The narrow every caller needs once: an option she can act on, or not one. */
export const isChoice = (a: Choice | Refusal | undefined): a is Choice => typeof a === 'object';

const REFUSALS: Array<{ re: RegExp; as: Refusal }> = [
  { re: /^(?:no|nope|nah|not really|neither|none|nothing|cancel|stop|forget it|never mind|nevermind)(?: of (?:them|those))?$/, as: 'none' },
  { re: /^(?:both|either|all)(?: of (?:them|those))?$/, as: 'both' },
];

/**
 * "the first one", "second", "number 2" — position, not name.
 *
 * Matched against the stripped text, and against the RAW text when stripping
 * left nothing behind — which is the whole of a real bug. `FILLER` contains the
 * word `one`, so a bare "one" — the most natural spoken answer there is to a
 * two-way question — arrived here as an empty string and matched nothing.
 *
 * The fallback is only for that empty case, and has to be: "the second one"
 * read raw matches `one` before it ever reaches `second`.
 */
const ORDINALS: Array<{ re: RegExp; index: number }> = [
  { re: /\b(?:the\s+)?(?:first|1st|one)\b/, index: 0 },
  { re: /\b(?:the\s+)?(?:second|2nd|two)\b/, index: 1 },
  { re: /\b(?:the\s+)?(?:third|3rd|three)\b/, index: 2 },
];

/**
 * A digit is a position only when it is the WHOLE answer.
 *
 * `\b2\b` anywhere in the text meant "2 tickets" picked the second option and
 * took somebody to a page instead of booking anything. A number in a sentence
 * is a quantity; a number on its own is a choice.
 */
const DIGIT = /^(?:number\s+|option\s+)?([123])$/;

/** Words that carry no choice — stripped before matching so "astrology one"
 *  and "the astrology please" both land on Astrology. */
const FILLER = /\b(?:the|one|that|this|please|thanks|ok|okay|yes|yeah|take me to|go to|show me|i mean|i meant)\b/g;

export function resolveChoice(text: string, options: Choice[]): Choice | Refusal | undefined {
  if (!options.length) return undefined;
  const raw = norm(text);
  if (!raw) return undefined;

  // A long sentence is a new request, not an answer to a two-way question.
  // Somebody who types a paragraph has moved on, and treating it as a pick is
  // how you navigate away mid-thought.
  if (raw.split(' ').length > 8) return undefined;

  const stripped = raw.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

  // 1. The label itself, exactly. The overwhelmingly common case, and the one
  //    that was broken.
  for (const o of options) {
    const n = norm(o.label);
    if (stripped === n || raw === n) return o;
  }

  // 2. The label inside a short sentence — "astrology please", "the profile
  //    one". Whole-word only.
  for (const o of options) {
    const n = norm(o.label);
    if (n && new RegExp(`(?:^| )${escapeRe(n)}(?: |$)`).test(raw)) return o;
  }

  // 3. A refusal. After the labels, so an option could in principle be called
  //    "None" and still be pickable, and before the guesses below, so "no one"
  //    is heard as "no" rather than as "one".
  for (const { re, as } of REFUSALS) if (re.test(stripped) || re.test(raw)) return as;

  // 4. A distinctive word FROM the label — "log" for "Astrology Log". Only if
  //    exactly one option owns it, or it is not a choice, it is a coin toss.
  if (stripped) {
    const owners = options.filter((o) =>
      norm(o.label).split(' ').some((w) => w.length > 2 && w === stripped),
    );
    if (owners.length === 1) return owners[0];
  }

  // 5. Position.
  const position = stripped || raw;
  for (const { re, index } of ORDINALS) {
    if (re.test(position) && options[index]) return options[index];
  }
  const digit = DIGIT.exec(position);
  if (digit && options[Number(digit[1]) - 1]) return options[Number(digit[1]) - 1];

  return undefined;
}

/** Named `escapeRe` rather than `escape`, which is a global this shadowed. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
