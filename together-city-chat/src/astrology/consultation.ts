import { shingleOverlap, wordsIn } from './letter';
import { violations } from './voice';

/**
 * Making a consultation sound like it was written for that question.
 *
 * WHAT WENT WRONG. "When will I find my soulmate?" and "When will my money come
 * in?" both came back with *"you're asking this question from two different
 * places at once, and it's worth untangling them. On the surface, you bring
 * real stability to how you pursue…"* — same opening, same five paragraphs,
 * same shape, different nouns.
 *
 * AND IT WAS NOT THE MODEL DRIFTING. composeAnswer() built a five-paragraph
 * DRAFT — layer one, layer two, the dates, the inner test, the strength and the
 * next step — and the prompt said "Keep every observation from the draft — you
 * are rewriting its voice, not its content." The model did exactly that. It was
 * faithfully reproducing a template because it had been handed one and told to
 * be faithful. A reader seeing two answers side by side sees the scaffolding,
 * and once seen it cannot be unseen.
 *
 * THE FIX IS THE ONE B.19 ALREADY PAID FOR. The model receives a BRIEF — the
 * observations, unordered, in plain English — and never a draft. What shape
 * they take, where the answer starts, and what voice it speaks in are chosen
 * per question from the rotations below and are different almost every time.
 *
 * A LIBRARY OF FIXED OPENINGS WOULD BE THE SAME BUG WITH MORE ENTRIES. The
 * brief for this work asked for fifty to a hundred stock openings to pick from
 * at random. That is a bigger template: a reader working through a hundred
 * answers meets the library, and every answer is still a blank being filled.
 * What rotates here is the MANNER — how to open, in what voice, in what order —
 * so the words are written each time. Ten openings × ten voices is a hundred
 * ways to begin, and none of them is a sentence anybody has written down.
 */

/** How the answer starts. A manner, never a phrase. */
const OPENINGS: string[] = [
  'Open with a plain observation about their situation — something true and specific, stated without preamble.',
  'Open with a short scene: two sentences of something happening, ordinary and recognisable, that the answer then turns to.',
  'Open with one image or comparison that holds the whole answer, and do not explain it — let the rest earn it.',
  'Open by answering the question directly, in one sentence, before anything else. Then spend the rest showing why.',
  'Open with the feeling underneath the question rather than the question — name what it is actually like to be asking it.',
  'Open with a general truth about how this part of life tends to work, then narrow to them by the second paragraph.',
  'Open with something practical they could do this week, then explain what makes it the right thing.',
  'Open with the part of this that usually surprises people, and say why it surprises them.',
  'Open by gently reframing the question into the better one underneath it — without saying you are reframing it.',
  'Open in the middle, as though continuing a conversation you were both already having.',
];

/** The order the answer moves in. */
const STRUCTURES: string[] = [
  'Answer → why that is so → when it is likely to matter → what to do about it.',
  'Where things actually stand → the opening in it they have not noticed → the thing to be careful of → the next step.',
  'An observation → what led here → where it stands now → where it tends → what to do.',
  'Take the question apart → say what it is really asking → answer that → one concrete step.',
  'The short answer first → the long explanation → the timing → three lines that sum it up.',
  'What is working → what is not → what that combination means → the one change worth making.',
  'The practical answer → the emotional answer → why they differ → how to hold both.',
];

/** Who is speaking. */
const VOICES: string[] = [
  'warm and unhurried, like someone who has known them a long time',
  'plain and practical, more interested in what to do than in how it feels',
  'reflective and a little philosophical, comfortable sitting with an open question',
  'psychologically astute — interested in the pattern behind the behaviour',
  'direct, almost blunt, but never unkind; short sentences, no cushioning',
  'quiet and observational, noticing more than it concludes',
  'encouraging in the way a good coach is: specific, demanding, on their side',
  'a storyteller, working through example rather than assertion',
  'measured and precise, the way somebody explains a thing they know well',
  'gentle and steadying, for a question that is clearly weighing on them',
];

/**
 * The register the subject asks for.
 *
 * A question about marriage should not read like a question about money. This
 * is the smallest thing that makes that true, and it is keyed on the topic the
 * citizen chose rather than guessed from the text.
 */
const TOPIC_REGISTER: Record<string, string> = {
  career: 'Write as somebody who understands work and how careers actually move — concrete about effort, timing and positioning.',
  marriage: 'Write as somebody who understands long partnerships — what makes them hold, and what quietly wears them down.',
  relationships: 'Write as somebody who understands how people actually get close to each other, and where it usually goes wrong.',
  business: 'Write as somebody who understands running something — customers, cash, risk, and the difference between busy and growing.',
  investments: 'Write about money as money: patience, position size, the cost of a decision made in a hurry. No mysticism about wealth.',
  education: 'Write as somebody who understands learning — how long it really takes, and what makes it stick.',
  children: 'Write with the care the subject deserves, and without sentimentality. Children are a practical subject as well as a tender one.',
  'foreign travel': 'Write as somebody who understands moving countries — paperwork, timing, and what it costs to leave and to arrive.',
  property: 'Write as somebody who understands buying and holding a home — the money and the meaning, which are not the same.',
  health: 'Write as wellness guidance, not diagnosis. Habits, energy, sleep, pacing. Never name a condition and never suggest one.',
  'spiritual growth': 'Write about meaning and inner life plainly, without incense. Nothing esoteric, nothing that sounds like a retreat brochure.',
};

/**
 * Phrasing that is now worn out, and the sentence that started it.
 *
 * Every one of these came from the old template or from the answers it
 * produced. They are banned rather than discouraged: a model that has seen a
 * phrase in its instructions reaches for it, and each of these appeared in
 * consecutive answers on unrelated questions.
 */
const WORN: Array<{ re: RegExp; why: string }> = [
  { re: /asking this question from two/i, why: 'the old template\'s opening' },
  { re: /\bworth untangling\b/i, why: 'the old template\'s opening' },
  { re: /\bon the surface\b/i, why: 'the old template\'s first move' },
  { re: /\bunderneath(,| though|, though)\b/i, why: 'the old template\'s second move' },
  { re: /\bwhat (?:you )?actually (?:need|matters)\b/i, why: 'the old template' },
  { re: /\bthe deeper need\b/i, why: 'the old template' },
  { re: /\bwhy this feels urgent now\b/i, why: 'the old template\'s hinge' },
  { re: /\bthe conditions around you\b/i, why: 'the old template' },
  { re: /\b(?:visible|steady), (?:visible|steady) progress\b/i, why: 'the old template' },
  { re: /\bin the coming weeks\b/i, why: 'the old template\'s timing paragraph' },
  { re: /\bhold (?:this|that) in mind\b/i, why: 'the old template\'s close' },
  { re: /\bfor the practical side\b/i, why: 'the old template\'s hinge' },
  { re: /\bthe inner test\b/i, why: 'the old template\'s close' },
  { re: /\btwo (?:different )?places at once\b/i, why: 'the old template\'s opening' },
];

export const ANSWER_WORDS = { min: 280, max: 620 } as const;

/** How much of an answer may echo one this person has already been sent. */
export const ANSWER_REPEAT_LIMIT = 0.16;

export interface AnswerProblem { what: string; why: string }

/**
 * Everything wrong with a candidate answer. Empty means it can be sent.
 *
 * `previous` is this citizen's own recent answers. The check that matters most
 * is the last one: two answers to two different questions must not be the same
 * answer, and only comparing them can establish that. Sixteen percent of
 * five-word runs is a tighter bar than the letter's twenty, because a letter is
 * one voice writing daily to one person and some rhythm is expected, whereas
 * two consultations on unrelated subjects have no reason to rhyme at all.
 */
export function answerProblems(candidate: string, previous: string[] = []): AnswerProblem[] {
  const out: AnswerProblem[] = [];
  const text = (candidate ?? '').trim();
  if (!text) return [{ what: 'empty', why: 'there is no answer' }];

  const words = wordsIn(text);
  if (words < ANSWER_WORDS.min) out.push({ what: `${words} words`, why: `shorter than ${ANSWER_WORDS.min}` });
  if (words > ANSWER_WORDS.max) out.push({ what: `${words} words`, why: `longer than ${ANSWER_WORDS.max}` });

  for (const { re, why } of WORN) {
    const m = re.exec(text);
    if (m) out.push({ what: m[0], why });
  }
  // Furniture. A consultation is prose; a heading in it is the template
  // showing through with the styling removed.
  if (/^\s*#{1,6}\s/m.test(text)) out.push({ what: 'a markdown heading', why: 'an answer is prose' });
  if (/^\s*(?:[-*•]|\d+[.)])\s+/m.test(text)) out.push({ what: 'a bullet list', why: 'an answer is prose' });
  if (/\*\*/.test(text)) out.push({ what: 'markdown emphasis', why: 'an answer is prose' });
  if (text.split('\n').some((l) => /^\s*[A-Z][^.!?]{0,40}:\s*$/.test(l))) {
    out.push({ what: 'a section label', why: 'an answer is prose' });
  }
  for (const v of violations(text)) out.push({ what: v.phrase, why: v.why });

  for (const prior of previous) {
    const overlap = shingleOverlap(text, prior);
    if (overlap >= ANSWER_REPEAT_LIMIT) {
      out.push({ what: `${Math.round(overlap * 100)}% shared phrasing`, why: 'reads like an earlier answer to a different question' });
      break;
    }
  }
  return out;
}

/** A stable pick per question, so the same question re-asked reads the same way. */
const pickBy = <T,>(arr: T[], seed: number, salt: number): T => arr[(seed + salt) % arr.length];

/**
 * The instructions for one specific answer.
 *
 * The rotation is the point. Ten openings, seven structures, ten voices and
 * eleven registers is more than seven thousand combinations, and the model
 * writes the sentences rather than selecting them — which is the difference
 * between variety and a bigger template.
 */
export function consultationRules(topic: string, seed: number, firstName?: string | null): string {
  const key = Object.keys(TOPIC_REGISTER).find((k) => topic.toLowerCase().includes(k)) ?? 'career';
  return [
    'You are answering one person\'s question about their own life, privately, in writing.',
    '',
    `SUBJECT: ${TOPIC_REGISTER[key]}`,
    `VOICE: ${pickBy(VOICES, seed, 0)}. Hold it for the whole answer.`,
    `HOW TO BEGIN: ${pickBy(OPENINGS, seed, 1)}`,
    `SHAPE: ${pickBy(STRUCTURES, seed, 2)} Do not label these parts or announce them.`,
    `LENGTH: between ${ANSWER_WORDS.min} and ${ANSWER_WORDS.max} words, in flowing paragraphs.`,
    firstName ? `Their name is ${firstName}. Use it at most once, and only where it lands.` : '',
    '',
    'ABSOLUTE RULES — breaking any one makes the answer unusable:',
    '1. Never reveal, name or hint at where the insight came from. No charts, stars, cards, planets,',
    '   signs, houses, moon phases, numbers, periods, systems or techniques. Not even obliquely.',
    '2. Never make yourself the subject. No "I think", no "as an AI", no "in my experience".',
    '3. Never predict a specific event or guarantee an outcome. Tendencies, conditions, likelihoods.',
    '4. Never use technical, mystical or esoteric vocabulary. Plain modern English.',
    '5. No headings, no bullet points, no bold, no labels. Paragraphs only.',
    '6. Use ONLY the observations given. Never invent a fact about this person.',
    '',
    'THESE PHRASES ARE BANNED. They are worn out, and an answer containing any of them is discarded:',
    '"asking this question from two places", "worth untangling", "on the surface", "underneath though",',
    '"what actually matters", "the deeper need", "why this feels urgent now", "the conditions around you",',
    '"steady, visible progress", "in the coming weeks", "hold this in mind", "for the practical side",',
    '"the inner test".',
    '',
    'The person should finish this thinking somebody sat down and wrote to them about THIS question.',
    'Not that a form was filled in.',
  ].filter(Boolean).join('\n');
}

/**
 * What the writer is allowed to know.
 *
 * The observations, and never an order for them. Handing over a drafted answer
 * is what produced two identical replies to two unrelated questions, so the
 * brief is explicitly labelled as unordered raw material.
 */
export function consultationPrompt(
  topic: string, question: string, observations: string[], history: string[], previous: string[],
): string {
  return [
    `Their question, on the subject of ${topic}:`,
    question,
    '',
    'What is true about them and about this period. These are unordered notes, not an outline —',
    'reflect them in your own words, in whatever order the answer wants them, and never list them:',
    ...observations.map((o) => `- ${o}`),
    history.length
      ? '\nThey have asked before. Earlier questions, most recent first:\n'
        + history.map((h) => `- ${h}`).join('\n')
        + '\nIf this continues a thread, acknowledge it naturally — never mechanically, never by quoting it back.'
      : '',
    previous.length
      ? '\nHere are answers this person has already been sent, in full. Do not reuse their openings,'
        + ' their shapes, their images or their sentence rhythms — somebody who keeps every answer must'
        + ' not be able to see a pattern:\n\n'
        + previous.map((p, i) => `--- earlier answer ${i + 1} ---\n${p}`).join('\n\n')
      : '',
  ].filter(Boolean).join('\n');
}
