import { ANSWER_WORDS, answerProblems, consultationPrompt, consultationRules } from './consultation';

/**
 * Two answers to two different questions must not be the same answer.
 *
 * "When will I find my soulmate?" and "When will my money come in?" both came
 * back opening *"you're asking this question from two different places at once,
 * and it's worth untangling them"* — and it was not the model drifting. It had
 * been handed a five-paragraph draft and told to keep its content and rewrite
 * only its voice. It obeyed.
 *
 * Everything here guards the fix rather than the symptom: the worn phrases are
 * refused BY NAME, the shape rotates per question, and an answer that reads
 * like an earlier one is rejected before it is sent.
 */

const A_REAL_ANSWER = [
  'Money almost never arrives on its own schedule, and the useful question is rarely when. It is what',
  'has to be true first. In your case the honest answer is that the work you are doing now is the kind',
  'that compounds quietly — it does not pay in the month you do it, and it pays for years after you',
  'stop noticing you did it. That is a frustrating answer to a direct question and it is the one that',
  'holds up.',
  '',
  'There is a real advantage in how you go about work, which is that you do not abandon things. Plenty',
  'of people are faster than you and fewer of them finish. What you need from the work underneath that,',
  'though, runs toward company and the room to think, and those two are quieter and much less',
  'negotiable. A version of this that pays well and starves the second one gets re-decided inside a',
  'year, and you will call it restlessness when it is nothing of the kind.',
  '',
  'Practically, this month favours proving something rather than announcing it. Doors that were stuck',
  'give a little more easily than they did in spring, and you may already have noticed the same effort',
  'costing you less than it did a few months ago. That is worth trusting. The seventh, the twelfth and',
  'the twenty-third are your strongest days for anything that needs another person to say yes; keep the',
  'irreversible decisions away from the fourth and the nineteenth.',
  '',
  'One step inside seven days, however small. A rate renegotiated, a conversation had, an invoice sent.',
  'Timing multiplies effort and it has never once replaced it, and the thing that would undermine you',
  'here is not bad luck but working past the point where rest would have earned more.',
].join(' ').replace(/\s+/g, ' ').trim();

describe('a consultation is written, not filled in', () => {
  it('accepts an answer that reads like somebody wrote it', () => {
    expect(answerProblems(A_REAL_ANSWER)).toEqual([]);
  });

  describe('refuses the phrases the template wore out', () => {
    // THE HARNESS. Every one of these is lifted from an answer that actually
    // shipped. If this ever goes quiet, the guard has stopped working.
    const shipped = [
      "Somen, you're asking this question from two different places at once, and it's worth untangling them.",
      'On the surface, you bring real stability to how you pursue your work.',
      'Underneath, though, what you actually need from your career runs toward connection.',
      'Why this feels urgent now: there is a pull toward revisiting ground you have covered.',
      'The conditions around you favour steady, visible progress rather than one big breakthrough.',
      'For the practical side over the coming weeks: pace matters.',
      "Here's the inner test worth applying as you weigh your actual options.",
    ];
    for (const line of shipped) {
      it(`rejects "${line.slice(0, 46)}…"`, () => {
        const found = answerProblems(`${A_REAL_ANSWER} ${line}`);
        expect(found.length).toBeGreaterThan(0);
      });
    }
  });

  it('refuses an answer that reads like the last one', () => {
    const rehash = A_REAL_ANSWER
      .replace(/money/gi, 'love').replace(/work/gi, 'marriage').replace(/invoice sent/, 'evening kept');
    const found = answerProblems(rehash, [A_REAL_ANSWER]);
    expect(found.map((p) => p.why)).toContain('reads like an earlier answer to a different question');
  });

  it('lets two genuinely different answers through', () => {
    const other = [
      'Start with the part nobody says out loud: most people meet the person they end up with while',
      'busy doing something else entirely. Waiting is not a strategy and it is not a moral failing',
      'either — it is just the least effective use of a year. What tends to work for you specifically is',
      'proximity to people doing something they care about, because the thing you actually respond to is',
      'not appearance and it is not charm, it is somebody being absorbed in their own life.',
      'You approach closeness steadily, which reads as reserve to people who move faster, and the ones',
      'worth having will read it correctly and wait. The ones who do not were never going to.',
      'Accept the invitation you would normally decline this month, especially around the seventh and the',
      'twenty-third. Not because those days are magic, but because you say yes more easily when the diary',
      'already has something in it, and a full week makes you braver than an empty one. What would',
      'undermine this is not loneliness. It is deciding in advance how it has to look.',
      'One thing inside a fortnight: say yes to something you would normally think about too long.',
      'That is the whole instruction, and it is harder than it sounds for exactly the reason above.',
    ].join(' ');
    // Enough overlap to be the same voice, not enough to be the same answer.
    expect(answerProblems(other, [A_REAL_ANSWER]).map((p) => p.why))
      .not.toContain('reads like an earlier answer to a different question');
  });

  it('holds the length and refuses furniture', () => {
    expect(answerProblems('Too short.').map((p) => p.why)).toContain(`shorter than ${ANSWER_WORDS.min}`);
    for (const junk of ['## A heading\n', '- a bullet\n- another\n', '**bold**', 'Timing:\n']) {
      expect({ junk, n: answerProblems(`${junk}${A_REAL_ANSWER}`).length > 0 }).toEqual({ junk, n: true });
    }
  });

  describe('the instructions rotate', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i * 977);

    it('does not hand every question the same opening, shape and voice', () => {
      const combos = new Set(seeds.map((s) => consultationRules('Career', s)));
      // Ten openings, seven shapes, ten voices. Forty questions should not
      // collapse onto a handful of instruction sets, or the rotation is
      // decorative and the answers will rhyme anyway.
      expect(combos.size).toBeGreaterThanOrEqual(30);
    });

    it('is stable for the same question, so re-reading is not a re-roll', () => {
      expect(consultationRules('Career', 12345)).toBe(consultationRules('Career', 12345));
    });

    it('speaks to the subject rather than to life in general', () => {
      expect(consultationRules('Health', 1)).toContain('wellness guidance');
      expect(consultationRules('Investments', 1)).toContain('No mysticism about wealth');
      expect(consultationRules('Marriage', 1)).toContain('long partnerships');
      // and it names the banned phrases to the writer, not only to the checker
      expect(consultationRules('Career', 1)).toContain('worth untangling');
    });
  });

  it('hands over notes and never an order for them', () => {
    const p = consultationPrompt('Career', 'Should I move?', ['They finish what they start.'], [], []);
    expect(p).toContain('unordered notes, not an outline');
    expect(p).toContain('They finish what they start.');
    // The earlier answers go in as things NOT to sound like, which is the only
    // way the writer can avoid them.
    const withPrev = consultationPrompt('Career', 'Should I move?', ['x'], [], ['an earlier answer']);
    expect(withPrev).toContain('an earlier answer');
    expect(withPrev).toContain('must not be able to see a pattern');
  });
});
