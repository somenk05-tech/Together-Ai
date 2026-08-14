/**
 * The relationship lane — deterministic, and deliberately narrow.
 *
 * ── WHERE THIS COMES FROM ─────────────────────────────────────────────────
 *
 * The SoulSync plan describes an assistant that does four things Mira could
 * not: understand a conflict, hand over a COMMUNICATION SCRIPT, hand over a
 * BOUNDARY SCRIPT, and refer to a person when it is beyond software. Across
 * partner, parent, child, sibling, friend, in-law, co-parent, colleague — and
 * the one most products forget, the relationship with yourself.
 *
 * It also writes the guardrail, in the plan's own words: "AI advice must not be
 * positioned as therapy, legal advice, medical advice, or guaranteed
 * relationship success." That sentence is the spine of this file.
 *
 * ── WHY THERE IS NO MODEL HERE ────────────────────────────────────────────
 *
 * The same argument `Astrology-Voice-Principles.md` already won: language rules
 * that live in a system prompt are suggestions. A model improvising about
 * somebody's marriage is the exact thing the guardrail above is about, and the
 * failure is invisible — a fluent, confident, wrong sentence about a person it
 * has never met, delivered to somebody who is upset.
 *
 * So every word here was written by a person and can be read before it ships.
 * A model comes later and, as everywhere else in this codebase, will only
 * rewrite prose that already exists and is already correct.
 *
 * ── THE THREE RULES THE LIBRARY IS BUILT ON ───────────────────────────────
 *
 * 1. SHE DESCRIBES BEHAVIOUR, NEVER DIAGNOSES A PERSON. "He didn't answer" is
 *    an observation. "He's avoidant" is a diagnosis of somebody who is not in
 *    the room, cannot reply, and did not consent to being assessed. The second
 *    kind is banned outright — see `LABELS`.
 *
 * 2. THE SCRIPT IS A FIRST SENTENCE, NOT A STRATEGY. What people are actually
 *    stuck on is how to open. A paragraph of tactics is a plan somebody has to
 *    perform, and it fails on contact with a real conversation.
 *
 * 3. SOME THINGS ARE NOT HERS. Control, coercion, violence, or somebody at the
 *    edge — she stops, says so plainly, and points at a person. No script. A
 *    communication script handed into a controlling relationship is not neutral;
 *    it can be used as evidence by the person causing the harm.
 */

/** Who it is about. `self` is deliberate — the plan lists it, and it is the one
 *  most products drop. */
export type Kind =
  | 'partner' | 'parent' | 'child' | 'sibling' | 'friend'
  | 'inlaw' | 'coparent' | 'colleague' | 'self';

/** What kind of stuck it is. Not an emotion — a SHAPE, because the shape is
 *  what decides whether a script exists and which one. */
export type Shape =
  | 'unheard' | 'boundary' | 'apology' | 'repair' | 'distance' | 'avoidance' | 'unknown';

export interface Script {
  /** The first sentence. Theirs to change — it is a starting line, not a spell. */
  opening: string;
  /** Why it is shaped that way. One line, so it can be disagreed with. */
  why: string;
}

export interface Read {
  kind?: Kind;
  /** The word THEY used — "mum", "my brother", "my boss". Echoed back verbatim
   *  rather than translated into the category, because being told your own
   *  relationship's correct label is the tell of a form, not a conversation. */
  who?: string;
  shape: Shape;
  /** What she says first: what she heard, not what she concluded. */
  reflection: string;
  script?: Script;
  /** Set when this is past what software should be doing. When present there is
   *  NO script, and that is the point. */
  handOff?: string;
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
const has = (hay: string, ...words: string[]): boolean =>
  words.some((w) => new RegExp(`(?:^| )${w}(?: |$)`).test(hay));

/**
 * ── BEYOND HER, AND CHECKED FIRST ─────────────────────────────────────────
 *
 * Before the relationship, before the shape, before anything. A message that
 * matches here never reaches the script library, because the script library is
 * the wrong answer to every one of these and an actively dangerous answer to
 * some.
 *
 * The list is behaviour, not diagnosis: things being DONE, described in the
 * words people actually use for them.
 */
const BEYOND: Array<{ re: RegExp; say: string }> = [
  {
    re: /\b(?:hits?|hit me|beat|beats me|threatens?|threatened|hurt me|afraid of (?:him|her|them)|scared of (?:him|her|them)|(?:i'?m|am|feel) not safe|not safe (?:at home|with (?:him|her|them))|violent)\b/i,
    say: 'That is not something to work out with a better sentence, and I am not going to hand you one. Talk to somebody who can actually help — a counsellor, or someone you trust, today rather than eventually.',
  },
  {
    re: /\b(?:won'?t let me|controls?|controlling|checks my phone|tracks me|isolat(?:es|ing) me|cut me off from|takes my (?:money|salary|phone))\b/i,
    say: 'What you are describing is about control rather than about communication, and a better opening line does not touch it. That is worth talking through with a counsellor rather than with me.',
  },
  {
    re: /\b(?:drinks? too much|drinking problem|addict|addiction|using again|gambl(?:es|ing) away)\b/i,
    say: 'That one is bigger than a conversation, and the people who are good at it do it for a living. I would rather point you at one than pretend I can script it.',
  },
];

/** The words people use, and the category they land in. Ordered longest-first
 *  at match time so "father-in-law" never reads as "father". */
const WHO: Array<{ kind: Kind; words: string[] }> = [
  { kind: 'inlaw', words: ['mother in law', 'father in law', 'sister in law', 'brother in law', 'in laws', 'in law'] },
  { kind: 'coparent', words: ['co parent', 'coparent', 'my ex', 'ex husband', 'ex wife', 'their father', 'their mother'] },
  { kind: 'partner', words: ['husband', 'wife', 'partner', 'boyfriend', 'girlfriend', 'fiance', 'fiancee', 'my ex partner'] },
  { kind: 'parent', words: ['mum', 'mom', 'mother', 'dad', 'father', 'papa', 'ma', 'parents', 'my folks'] },
  { kind: 'child', words: ['my son', 'my daughter', 'my kid', 'my kids', 'my child', 'my children'] },
  { kind: 'sibling', words: ['brother', 'sister', 'sibling', 'bhai', 'didi'] },
  { kind: 'colleague', words: ['my boss', 'my manager', 'colleague', 'coworker', 'co worker', 'my team', 'at work'] },
  { kind: 'friend', words: ['my friend', 'best friend', 'my mate', 'friends'] },
  { kind: 'self', words: ['myself', 'about me', 'my own head', 'with myself'] },
];

export function whoIsIt(text: string): { kind: Kind; who: string } | undefined {
  const hay = norm(text);
  const all = WHO.flatMap((w) => w.words.map((word) => ({ kind: w.kind, word })));
  // Longest first: "mother in law" must beat "mother".
  all.sort((a, b) => b.word.length - a.word.length);
  for (const { kind, word } of all) if (has(hay, word)) return { kind, who: word };
  return undefined;
}

/** What kind of stuck. Checked in order — the earlier ones are more specific. */
const SHAPES: Array<{ shape: Shape; re: RegExp }> = [
  { shape: 'boundary', re: /\b(?:keeps? (?:asking|calling|showing up|turning up)|won'?t stop|too much|every day|boundar|space from|need space|say no|saying no|guilt trip|pressure)\b/i },
  { shape: 'apology', re: /\b(?:i (?:was )?(?:messed up|screwed up|was wrong|hurt (?:him|her|them)|shouldn'?t have)|apolog|my fault|owe (?:him|her|them) an?)\b/i },
  { shape: 'unheard', re: /\b(?:doesn'?t listen|never listens|not listening|doesn'?t hear|feel unheard|feel invisible|talk(?:ing)? past|dismiss(?:es|ed)?)\b/i },
  { shape: 'avoidance', re: /\b(?:don'?t know how to (?:say|tell|bring)|scared to (?:say|tell|ask)|keep putting (?:it|this) off|avoid(?:ing)? (?:the|this|that) conversation|how do i (?:tell|say|ask|bring))\b/i },
  { shape: 'distance', re: /\b(?:drift(?:ed|ing)|grown apart|barely (?:speak|talk)|haven'?t spoken|stopped talking|distant|we don'?t talk)\b/i },
  { shape: 'repair', re: /\b(?:fight|argued?|argument|fell out|not speaking|angry (?:at|with)|things are (?:bad|tense)|fix (?:this|things|it))\b/i },
];

/**
 * "do not" and "don't" are the same sentence.
 *
 * The spec caught this on "I do not know how to tell my dad", which read as
 * `unknown` and got no script — while "I don't know how to tell my dad" worked.
 * Writing both spellings into every pattern would mean remembering to, in every
 * pattern, for ever; one normaliser at the door is the version that cannot be
 * forgotten halfway down the list.
 */
function contract(text: string): string {
  return text
    .replace(/\bwill not\b/gi, "won't")
    .replace(/\bcan not\b|\bcannot\b/gi, "can't")
    .replace(/\b(do|does|did|is|are|was|were|have|has|had|would|could|should)\s+not\b/gi, "$1n't");
}

function shapeOf(text: string): Shape {
  const t = contract(text);
  for (const { shape, re } of SHAPES) if (re.test(t)) return shape;
  return 'unknown';
}

/**
 * ── THE SCRIPTS ──────────────────────────────────────────────────────────
 *
 * One opening sentence per shape, and a line saying why it is built that way so
 * the citizen can disagree with the reasoning rather than just the words.
 *
 * They all share a construction, and it is the only technique in this file:
 * SAY THE EFFECT, ASK FOR THE THING. No accusation, no motive, no adjective
 * about the other person. "When X happens, I feel Y — can we Z" survives being
 * repeated back in an argument, which is the actual test, because it will be.
 *
 * `self` gets its own set. Talking to yourself about yourself is a different
 * job from talking to somebody else, and reusing the couple's script for it
 * would be the tell that nobody thought about it.
 */
const SCRIPTS: Record<Shape, Script | undefined> = {
  unheard: {
    opening: '“When I bring something up and it moves on quickly, I stop bringing things up. Can we take this one slowly?”',
    why: 'It reports what happens and what it costs, and asks for one specific thing. Nothing in it can be argued with, because none of it is a claim about them.',
  },
  boundary: {
    opening: '“I can do Sunday, and I can’t do the rest of the week. That isn’t about you — it’s what I have.”',
    why: 'A boundary that arrives with what you CAN do is a plan. One that arrives alone is a refusal, and gets negotiated.',
  },
  apology: {
    opening: '“I was wrong about that, and I’ve been thinking about why. I’m not asking you to be fine with it yet.”',
    why: 'Naming the thing and dropping the request is the whole of it. An apology that ends in "but" or in "so can we move on" is a negotiation wearing an apology’s clothes.',
  },
  repair: {
    opening: '“I don’t want to win this one. Can we start again from what we actually disagreed about?”',
    why: 'Most repairs stall because the fight is now about the fight. Naming the original disagreement is the shortest way back.',
  },
  distance: {
    opening: '“I noticed we haven’t really spoken in a while. No reason, no crisis — I just miss it. Are you around this week?”',
    why: 'Saying there is no crisis is the load-bearing part. Otherwise the other person spends the first ten minutes working out what is wrong.',
  },
  avoidance: {
    opening: '“There’s something I’ve been putting off saying, and putting it off is making it bigger. Can I say it badly and you let me finish?”',
    why: 'Asking for room to say it badly removes the reason it has not been said — the fear of getting it wrong on the first attempt.',
  },
  unknown: undefined,
};

const SELF_SCRIPTS: Partial<Record<Shape, Script>> = {
  boundary: {
    opening: 'Write down the thing you keep saying yes to, and what saying yes costs you that week. Then decide once, in writing, rather than every time you are asked.',
    why: 'Deciding in advance is easier than deciding under pressure, which is when you are always asked.',
  },
  apology: {
    opening: 'Say what you did in one sentence, without the reason. Then read it back and see whether the reason was doing any work.',
    why: 'The explanation is usually where self-forgiveness quietly turns into a case for the defence.',
  },
  unknown: {
    opening: 'Say the sentence you have been circling out loud, once, to nobody. The words you avoid are usually the subject.',
    why: 'Naming it is most of the work, and it is the part that does not need anybody else present.',
  },
};

/** How she opens — what she HEARD, not what she concluded. */
function reflect(kind: Kind | undefined, who: string | undefined, shape: Shape): string {
  const them = who ? `your ${who.replace(/^my /, '')}` : 'them';
  if (kind === 'self') return 'Right — so this one is with yourself.';
  switch (shape) {
    case 'unheard': return `So you say something to ${them} and it does not land.`;
    case 'boundary': return `So the ask keeps coming, and saying no to ${them} costs something.`;
    case 'apology': return 'So you think you got it wrong, and it is sitting there.';
    case 'repair': return `So it went badly with ${them} and now it is stuck.`;
    case 'distance': return `So there is more space between you and ${them} than there used to be.`;
    case 'avoidance': return `So the thing is unsaid, and not saying it is its own weight now.`;
    default: return who ? `So this is about ${them}.` : 'Okay. Tell me which part is the stuck one.';
  }
}

/**
 * Read a situation, if there is one to read.
 *
 * Returns undefined when this is not a relationship turn at all — she should
 * not be reaching for a script because somebody mentioned their sister while
 * asking about a restaurant.
 */
export function readSituation(text: string): Read | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;

  const person = whoIsIt(t);
  const shape = shapeOf(t);

  /**
   * ── BEFORE EVERYTHING, INCLUDING BEFORE GIVING UP ────────────────────────
   *
   * This check used to sit AFTER the "nothing to work with" return, and the
   * spec caught it on four of the six cases that matter most: "I am scared of
   * him", "he threatened me", "he checks my phone and tracks me", "she won't
   * let me see my friends". None of them names a relationship in a word this
   * file knows — "him" is not in the list and never will be — and none matches
   * a conversational shape, so all four fell out of the early return and Mira
   * said nothing at all.
   *
   * Silence is not the safe default here. It is the same as not noticing.
   */
  const relaxed = contract(t);
  for (const { re, say } of BEYOND) {
    if (re.test(t) || re.test(relaxed)) {
      return {
        kind: person?.kind,
        who: person?.who,
        shape,
        reflection: 'I want to stop you there, because this is not the kind of thing I should be scripting.',
        handOff: say,
      };
    }
  }

  // Nothing to work with: no relationship named AND no recognisable shape.
  if (!person && shape === 'unknown') return undefined;

  const script = person?.kind === 'self'
    ? SELF_SCRIPTS[shape] ?? SELF_SCRIPTS.unknown
    : SCRIPTS[shape];

  return {
    kind: person?.kind,
    who: person?.who,
    shape,
    reflection: reflect(person?.kind, person?.who, shape),
    script,
  };
}

/**
 * ── WHAT SHE MAY NEVER SAY ABOUT SOMEBODY WHO IS NOT HERE ─────────────────
 *
 * Diagnosis, clinical vocabulary, and verdicts on a person's character. Every
 * one of these is a judgement about somebody who cannot reply, did not consent
 * to being assessed, and is being described by the one person in the room who
 * is upset with them.
 *
 * They are also the words this genre reaches for first — which is exactly why
 * they are checked in code rather than trusted to taste. `relate.spec.ts` runs
 * this over every line the library can produce.
 */
const LABELS = [
  /\bnarcissis/i, /\bgaslight/i, /\btoxic\b/i, /\babusive\b/i, /\bcodepend/i,
  /\bavoidant\b/i, /\banxious attachment\b/i, /\bemotionally unavailable\b/i,
  /\bmanipulat/i, /\bpassive.aggressive\b/i, /\bdisorder\b/i, /\bdiagnos/i,
  /\btherap(?:y|ist)\b/i, /\bclinical/i, /\btrauma\b/i, /\btriggered\b/i,
  /\bred flags?\b/i, /\bshould (?:leave|break up|divorce)\b/i,
  /\bthey (?:will|won'?t) (?:ever )?change\b/i,
];

/** Every rule a line breaks. Empty means it is safe to say out loud. */
export function labels(text: string): string[] {
  return LABELS.filter((re) => re.test(text)).map((re) => re.source);
}

/** Everything the library can ever say — for the spec to sweep. A rule that
 *  only covers the lines somebody remembered to test is not a rule. */
export function allLines(): string[] {
  const out: string[] = [];
  for (const s of Object.values(SCRIPTS)) if (s) out.push(s.opening, s.why);
  for (const s of Object.values(SELF_SCRIPTS)) if (s) out.push(s.opening, s.why);
  for (const b of BEYOND) out.push(b.say);
  const kinds: Array<Kind | undefined> = [undefined, 'partner', 'parent', 'child', 'sibling', 'friend', 'inlaw', 'coparent', 'colleague', 'self'];
  const shapes: Shape[] = ['unheard', 'boundary', 'apology', 'repair', 'distance', 'avoidance', 'unknown'];
  for (const k of kinds) for (const s of shapes) out.push(reflect(k, k ? `my ${k}` : undefined, s));
  return out;
}
