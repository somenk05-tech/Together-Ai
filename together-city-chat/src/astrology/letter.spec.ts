import { DAILY_WORDS, MONTHLY_WORDS, TITLE_WORDS, bannedVocabulary, letterProblems, salutationFor, shingleOverlap, titleProblems, toLetter } from './letter';

/**
 * The letter contract, checked.
 *
 * Everything the daily and monthly surfaces used to guarantee STRUCTURALLY is
 * now a property of one block of prose. A section called "Career & Work" could
 * not accidentally become a bullet list; a letter can. A chip reading
 * "🪐 Saturn Dasha" was labelled data and was allowed to name the machinery; a
 * sentence never is. So the rules are functions, and this is where they are held
 * to account.
 *
 * The harnesses matter more than the happy paths here. A guard that only ever
 * sees good input tells you nothing — three of the tests below feed it the
 * EXACT output of the page this replaced, and demand it be refused.
 */

const GOOD_BODY = [
  'Something has been sitting with you for a few days now, and my guess is that you have already',
  'decided what you think about it and are only waiting for a decent moment to say so. That moment is',
  'probably closer than it feels. When you do say it, say it plainly — the version of you that speaks',
  'calmly is far more persuasive than the version that has rehearsed, and people tend to hear the',
  'first one properly.',
  '',
  'Work is going to reward finishing over starting for a while yet. That is not the most exciting',
  'thing to be told, but the kind of effort you are putting in compounds quietly, and it only',
  'compounds if it stays consistent. One small deliberate step counts for more right now than a plan',
  'that covers everything. If your attention keeps drifting toward getting organised rather than',
  'getting ahead, let it — that instinct is usually right about what the week actually needs.',
  '',
  'With the people close to you, the small attentive gesture will land better than the grand one. It',
  'nearly always does with you. If a conversation matters today, listen first for longer than feels',
  'natural; the mood around you tilts toward feeling before reasoning, and the thing left unsaid is',
  'usually the thing worth asking about. On the practical side, keep it simple — water, one proper',
  'meal, twenty unhurried minutes outside. Your energy is running restless rather than low, and',
  'restless responds to rhythm, not to effort.',
  '',
  'Money is a good place to be patient this month. Nothing needs deciding this week that could not be',
  'decided better next week, and the test worth applying before any spend is only whether it serves',
  'where you are actually heading. You already know the answer for most of them.',
  '',
  'Whatever today turns out to be, you do not have to solve all of it at once. Moving with a clear',
  'head is worth more than moving quickly, and a fair amount of what is on your mind will look',
  'smaller by tomorrow evening. Take five minutes tonight and ask what deserves a little more of your',
  'attention this week and what deserves a little less. Let the answer be gentle.',
].join('\n');

/**
 * A DAILY AT ITS NEW LENGTH — 103 words.
 *
 * GOOD_BODY above is roughly three hundred, which is what a daily used to be
 * and is now a rejection: the owner cut the daily to 80–150 words and the
 * monthly to 120–180 because length was doing the work insight is supposed to
 * do. GOOD_BODY is kept exactly as it was and has changed jobs — it is the
 * harness for "a daily that has run away with itself", which is a more useful
 * thing for it to be than a passing example.
 *
 * This one is deliberately UNDER 120 as well as inside the daily range, so the
 * test below can show the same letter passing as a daily and failing as a
 * month without needing a third fixture to make the point.
 */
const DAILY_BODY = [
  'There is something you have been circling for a few days, and my sense is that you decided what',
  'you think about it a while ago and have only been waiting for a decent moment. That moment is',
  'closer than it feels. Say it plainly when you do — the calm version of you is more persuasive',
  'than the rehearsed one, and people tend to hear the first one properly.',
  '',
  'The rest of the day rewards finishing over starting. One small deliberate step counts for more',
  'than a plan that covers everything, and none of it has to be solved before this evening.',
].join('\n');

/** And a month at its own length — 306 words, which is also far too long to be a day. */
const MONTH_BODY = [
  'August is going to ask you to consolidate rather than begin. That will feel like the wrong',
  'instruction, because you have spent a long stretch thinking about what you could build and that',
  'chapter is not finished — but the useful work this month is finding out which of the things you',
  'already committed to actually hold their shape. That is not retreat. It is the month you find out',
  'what is real, which is the only thing that makes the next round of building worth doing.',
  '',
  'Pay attention to what moves easily and what you keep having to push. The heaviness is rarely a',
  'sign to try harder; more often it is a sign you are working the wrong angle, and the honest thing',
  'is to change the angle rather than the effort. Growth here arrives through patience and attention',
  'rather than force, and it will show up in small ways first — a conversation that goes differently',
  'because you listened rather than steered it, an old piece of work asking for something you had',
  'not considered. Those signals are worth more this month than any plan you make at the start of',
  'it.',
  '',
  'The middle of the month is where your judgement is sharpest, and it is worth saving the',
  'conversation that genuinely matters for then rather than spending it early on something that only',
  'feels urgent. Money and commitments both reward the slower read. With the people close to you,',
  'the small attentive thing lands better than the grand one, as it nearly always does with you.',
  '',
  'Keep one evening a week genuinely free. It is the first thing you will cut, and by September it',
  'will have been the thing that made the difference — not because rest is virtuous, but because you',
  'think better when you are not owed to anybody.',
].join('\n');

const good = (name = 'Somen') => `${salutationFor(name)}\n\n${DAILY_BODY}`;

/**
 * What the page used to send, verbatim in shape.
 *
 * Five labelled sections, an emoji per heading, a lucky strip and a reflection
 * box. Every guard in this file exists so that this cannot come back by
 * accident, so this is what it is tested against.
 */
const OLD_PAGE = [
  'Dear Somen,',
  '',
  'A clear sky',
  '',
  '💼 Career & Work:',
  'This is a good moment to say something you have been holding back.',
  '',
  '❤️ Relationships:',
  'Care reaches people best from you when it is attentive and quietly devoted.',
  '',
  '🌿 Health & Energy:',
  'Your energy feels restless at the moment.',
  '',
  '✨ Lucky today — Number 3, Colour Olive, Best time afternoon.',
].join('\n');

describe('the letter contract', () => {
  it('accepts a letter that is only a letter', () => {
    expect(letterProblems(good(), 'daily', 'Somen')).toEqual([]);
  });

  it('opens with their name, and copes when there is not one', () => {
    expect(salutationFor('Somen Kumar')).toBe('Dear Somen,');
    expect(salutationFor(null)).toBe('Dear friend,');
    expect(salutationFor('x')).toBe('Dear friend,');  // a handle is not a name
    const wrong = letterProblems(`Hello Somen!\n\n${GOOD_BODY}`, 'daily', 'Somen');
    expect(wrong.map((p) => p.why)).toContain('does not open with "Dear Somen,"');
  });

  it('refuses the page this replaced', () => {
    // THE HARNESS. Not a hypothetical: this is the shape of what shipped
    // yesterday, and every one of these findings is a thing the citizen used to
    // see. If this ever comes back green, the guard has stopped working.
    const found = letterProblems(OLD_PAGE, 'daily', 'Somen').map((p) => p.what);
    // Both rules have to fire. The named-headings rule knows those five titles
    // and would go quiet the moment somebody invented a sixth; the generic
    // label rule is what catches the sixth. A harness that accepted either one
    // alone would not notice the general rule rotting.
    expect(found).toContain('a section label');
    expect(found).toContain('one of the old section headings');
  });

  describe('refuses furniture', () => {
    const cases: Array<[string, string]> = [
      ['a markdown heading', '## Career\n\n'],
      ['a bullet or numbered list', '- one thing\n- another thing\n\n'],
      ['a bullet or numbered list', '1. the first thing\n2. the second\n\n'],
      ['markdown emphasis', 'This is **important**, and\n\n'],
      ['a section label', 'Relationships:\n\n'],
      ['a second salutation inside the body', 'Dear reader, one more thing.\n\n'],
      ['a gap wide enough to read as a section break', 'One thought.\n\n\n\nAnother.\n\n'],
    ];
    for (const [why, snippet] of cases) {
      it(`rejects ${why}`, () => {
        const found = letterProblems(`${salutationFor('Somen')}\n\n${snippet}${GOOD_BODY}`, 'daily', 'Somen');
        expect(found.map((p) => p.what)).toContain(why);
      });
    }
  });

  describe('refuses the vocabulary', () => {
    // One per family, chosen as the phrasings a writer actually drifts into
    // rather than the obvious ones. "Mercury is retrograde" is easy to catch and
    // nobody writes it; "a retrograde stretch" is what slips through.
    const leaks = [
      'a retrograde stretch is a good time to review',
      'your chart shows a strong pull toward home',
      'this is a Taurus kind of patience',
      'your life path number rewards this',
      'the waning moon favours letting go',
      'Saturn has been asking a lot of you',
      'the planets are unusually quiet for you',
      'a numerology reading would call this a completion year',
      'this is a karmic pattern worth naming',
      'the universe is nudging you toward it',
      'your face reading suggests patience',
      'this prediction is worth sitting with',
    ];
    for (const leak of leaks) {
      it(`rejects "${leak}"`, () => {
        expect(bannedVocabulary(leak).length).toBeGreaterThan(0);
      });
    }

    it('leaves ordinary English alone', () => {
      // The words a strict list would over-reach into. "Energy" is how someone
      // feels; a "period" is a stretch of time; "signs" are what you notice.
      for (const fine of [
        'your energy is running restless today',
        'this is a period of steady work rather than fast work',
        'the early signs are that it will go better than you expect',
        'a house move is on your mind',
        'you tend to read a room quickly',
      ]) {
        expect({ fine, found: bannedVocabulary(fine) }).toEqual({ fine, found: [] });
      }
    });
  });

  describe('refuses a manufactured ending', () => {
    for (const closer of ['Good luck.', 'Have a wonderful day.', 'Stay positive.', 'Warm regards.', 'Wishing you all the best.']) {
      it(`rejects "${closer}"`, () => {
        const found = letterProblems(`${good()} ${closer}`, 'daily', 'Somen');
        expect(found.length).toBeGreaterThan(0);
      });
    }
  });

  describe('holds the length', () => {
    it('rejects a letter too short to be one', () => {
      const found = letterProblems(`${salutationFor('Somen')}\n\nA few words only.`, 'daily', 'Somen');
      expect(found.map((p) => p.why)).toContain(`shorter than ${DAILY_WORDS.min}`);
    });

    it('rejects a daily that has run away with itself', () => {
      const long = `${salutationFor('Somen')}\n\n` + `${GOOD_BODY}\n\n`.repeat(3);
      expect(letterProblems(long, 'daily', 'Somen').map((p) => p.why)).toContain(`longer than ${DAILY_WORDS.max}`);
    });

    it('holds the monthly to its own, longer range', () => {
      // The same letter is a fine daily and just short of a month.
      expect(letterProblems(good(), 'daily', 'Somen')).toEqual([]);
      expect(letterProblems(good(), 'monthly', 'Somen').map((p) => p.why))
        .toContain(`shorter than ${MONTHLY_WORDS.min}`);
    });

    it('accepts a month at its own length, and refuses it as a day', () => {
      const asMonth = `${salutationFor('Somen')}\n\n${MONTH_BODY}`;
      expect(letterProblems(asMonth, 'monthly', 'Somen')).toEqual([]);
      expect(letterProblems(asMonth, 'daily', 'Somen').map((p) => p.why))
        .toContain(`longer than ${DAILY_WORDS.max}`);
    });

    /**
     * THE RANGES ARE THE FEATURE, so they are asserted rather than assumed.
     * A later edit that quietly restores 430-word dailies would otherwise pass
     * every test in this file — each one is written against the constants.
     */
    it('is holding the short letter the owner asked for', () => {
      expect(DAILY_WORDS).toEqual({ min: 80, max: 150 });
      expect(MONTHLY_WORDS).toEqual({ min: 240, max: 320 });
    });
  });

  describe('refuses to send the same letter twice', () => {
    it('catches a letter that is yesterday\'s with the nouns changed', () => {
      const yesterday = GOOD_BODY;
      const today = GOOD_BODY.replace('restless', 'steady').replace('Monday', 'Tuesday');
      expect(shingleOverlap(today, yesterday)).toBeGreaterThan(0.5);
      const found = letterProblems(`${salutationFor('Somen')}\n\n${today}`, 'daily', 'Somen', [yesterday]);
      expect(found.map((p) => p.why)).toContain('reuses a previous letter');
    });

    it('does not punish two different letters for sharing a language', () => {
      const other = [
        'There is a decision you have been circling and my sense is you are closer to it than you think.',
        'Give it one more quiet evening before you commit, and then commit properly rather than halfway.',
        'The people around you will take their cue from how settled you sound, not from how certain you are,',
        'and those are different things. Keep the week narrow: two things that would matter in a year, and',
        'everything else done adequately. Eat properly, walk somewhere without your phone, and let the rest',
        'of it wait until it is actually urgent, which most of it will never become. What is worth watching',
        'is the point in the afternoon where tiredness starts arguing on your behalf; that is usually when',
        'the unnecessary sentence gets said. Nothing here has to be finished today, and a clear head is',
        'worth more than a fast one. If a conversation goes sideways, leave it a day rather than a week.',
        'The distance between those two is where most small things become large ones, and you already know',
        'which side of it you tend to land on when you are busy.',
      ].join(' ');
      expect(shingleOverlap(other, GOOD_BODY)).toBeLessThan(0.2);
    });
  });

  /**
   * THE TITLE IS THE ONE LINE EVERYBODY READS.
   *
   * It is also the only line that gets screenshotted, which is why the whole
   * vocabulary ban applies to it and then some: a clean hundred-word letter
   * under a title reading "Saturn's Lesson" has told the reader exactly what
   * produced it, and none of the checks on the body would have noticed.
   */
  describe('the title', () => {
    it('accepts a title that names the day', () => {
      for (const t of ['Move, But Don\'t Rush', 'Let the Quiet Work', 'Say the Thing Plainly', 'Choose What Stays']) {
        expect({ t, found: titleProblems(t) }).toEqual({ t, found: [] });
      }
    });

    it('refuses the three the owner named by hand', () => {
      for (const t of ['Daily Horoscope', 'Your Horoscope Today', "Today's Astrology"]) {
        expect(titleProblems(t).length).toBeGreaterThan(0);
      }
    });

    it('refuses a title that only says where you already are', () => {
      // "TODAY" is printed above it as a label. A title repeating it is a
      // heading, and a heading is what this page stopped having.
      for (const t of ['Today Is Your Day', 'The Month Ahead For You', 'Your Week In Focus']) {
        expect(titleProblems(t).map((p) => p.why)).toContain('says where you are, which the label above it already says');
      }
    });

    it('holds its length at both ends', () => {
      expect(titleProblems('Go Slowly').map((p) => p.why)).toContain(`shorter than ${TITLE_WORDS.min}`);
      expect(titleProblems('A Title That Simply Will Not Stop Going On').map((p) => p.why))
        .toContain(`longer than ${TITLE_WORDS.max}`);
    });

    it('refuses the punctuation that turns a title into a label', () => {
      expect(titleProblems('This Month: Consolidate').map((p) => p.what)).toContain(':');
      expect(titleProblems('Move, But Do Not Rush.').map((p) => p.why)).toContain('a title does not end in punctuation');
      expect(titleProblems('"Move, But Do Not Rush"').map((p) => p.what)).toContain('quotation marks');
      expect(titleProblems('MOVE, BUT DO NOT RUSH').map((p) => p.why)).toContain('set in capitals rather than written');
    });

    it('applies the whole vocabulary ban to four words', () => {
      for (const t of ['A Retrograde Kind Of Week', 'What The Stars Are Asking', 'Your Karmic Homework Now']) {
        expect(titleProblems(t).length).toBeGreaterThan(0);
      }
    });

    it('has something to say about nothing', () => {
      expect(titleProblems('').map((p) => p.why)).toContain('there is no title');
    });
  });

  it('splits a letter into the parts a screen renders', () => {
    const l = toLetter(`${salutationFor('Somen')}\n\n${GOOD_BODY}\n\n\n`, 'Somen', '  Move, But Don\'t Rush  ');
    expect(l.title).toBe('Move, But Don\'t Rush');
    expect(l.salutation).toBe('Dear Somen,');
    // The letter closes and does not sign itself with the company's name.
    expect(l.signOff).toBe('With care,');
    expect(l.body.startsWith('Something has been sitting')).toBe(true);
    expect(l.body).not.toContain('Dear Somen,');
    expect(l.body).not.toMatch(/\n{3,}/);
    expect(l.words).toBeGreaterThan(DAILY_WORDS.min);
  });
});
