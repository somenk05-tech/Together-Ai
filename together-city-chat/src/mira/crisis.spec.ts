import { readCrisis, CRISIS_RE, CRISIS_SAY } from './crisis';
import { labels } from './relate';
import { violations } from './voice';

/**
 * The sentence that was answered with a journaling exercise.
 *
 * Every phrase below is one somebody has to be able to type at 2am and be met
 * by a number rather than by a prompt to reflect. They are assertions and not a
 * comment for exactly one reason: a future edit that narrows this lexicon has
 * to break a test to do it.
 */
describe('she hears it when somebody says it about themselves', () => {
  const said = [
    'i want to kill myself',
    'i keep thinking about killing myself',
    'i want to end my life',
    'i just want to end it all',
    'i am going to take my own life',
    'i want to die',
    'i wanna die',
    "i don't want to live anymore",
    'i dont want to be here',
    'there is no reason to live',
    'there is nothing left to live for',
    'everyone would be better off without me',
    "i can't go on",
    'i want to hurt myself',
    'i have been hurting myself',
    'i want to harm myself',
    'i cut myself last night',
    'i keep cutting myself',
    'i took an overdose',
    'i have been thinking about suicide',
    'i feel suicidal',
    'self harm',
    'i self-harm when it gets bad',
  ];

  it.each(said)('reads %j as first person', (t) => {
    expect(readCrisis(t)?.who).toBe('self');
  });

  /** Citizens are in India and switch language mid-sentence. A second list for
   *  Hinglish would only ever be half-maintained, so it is the same list. */
  const hinglish = [
    'mann karta hai jaan dena',
    'bas jaan de dun',
    'mar jaun to accha hai',
    'main marna chahta hoon',
    'main marna chahti hoon',
    'khudkhushi ka khayal aata hai',
    'atmahatya karne ka mann karta hai',
  ];

  it.each(hinglish)('reads %j as first person', (t) => {
    expect(readCrisis(t)?.who).toBe('self');
  });
});

describe('and when it is about somebody else', () => {
  const about = [
    'my friend wants to die',
    'my sister said she wants to kill herself',
    'he is suicidal',
    'she talked about ending it',
  ];

  it.each(about)('reads %j as about a third person', (t) => {
    expect(readCrisis(t)?.who).toBe('other');
  });

  /** A third-party subject has to actually be there. Without one the safe
   *  reading is that it is the person typing. */
  it('needs the subject, and takes first person otherwise', () => {
    expect(readCrisis('feeling suicidal')?.who).toBe('self');
    expect(readCrisis('i want to kill myself')?.who).toBe('self');
  });

  /** The distance limit. "my dad died and i want to die" is a disclosure about
   *  the person typing; reading it as being about the dad answers the wrong
   *  person entirely. */
  it('does not hand a first-person disclosure to the third-person copy', () => {
    expect(readCrisis('my dad died and i want to die')?.who).toBe('self');
  });
});

describe('it stays out of ordinary sentences', () => {
  it.each([
    'find somewhere for dinner',
    'i am dying to see that film',
    'my friend is ending it with her boyfriend',
    'what is my balance',
    '',
  ])('%j is not a crisis turn', (t) => {
    expect(readCrisis(t)).toBeUndefined();
  });
});

/**
 * ── THE PART THAT REACHES A PERSON ────────────────────────────────────────
 *
 * A helpline number that has moved is worse than no number at all, because it
 * is trusted on sight. These digits are asserted so that a rewrite of the prose
 * cannot quietly take them with it.
 */
describe('the copy carries the numbers', () => {
  it.each(['self', 'other'] as const)('%s names Tele-MANAS and the emergency number', (who) => {
    expect(CRISIS_SAY[who]).toMatch(/\b14416\b/);
    expect(CRISIS_SAY[who]).toMatch(/\b112\b/);
    expect(CRISIS_SAY[who]).toMatch(/tele-manas/i);
  });

  it('points at a person they know as well as at the line', () => {
    expect(CRISIS_SAY.self).toMatch(/somebody you trust/i);
    expect(CRISIS_SAY.other).toMatch(/tell somebody/i);
  });

  /** The third-party line is addressed to the one asking, about somebody else.
   *  Telling the asker that THEY are the one in danger is its own harm. */
  it('does not speak to the asker as the one at risk', () => {
    expect(CRISIS_SAY.other).not.toMatch(/\bi want you safe\b/i);
    expect(CRISIS_SAY.other).toMatch(/\bthem\b/);
  });

  it('is still Mira saying it, and diagnoses nobody', () => {
    for (const line of Object.values(CRISIS_SAY)) {
      expect(violations(line)).toEqual([]);
      expect(labels(line)).toEqual([]);
    }
  });
});

/** One lexicon, three readers. If this union stops covering either half, the
 *  governor and the router go quiet without anybody noticing. */
describe('the shared lexicon', () => {
  it('covers both halves', () => {
    expect(CRISIS_RE.test('i want to kill myself')).toBe(true);
    expect(CRISIS_RE.test('my friend wants to die')).toBe(true);
    expect(CRISIS_RE.test('order me pizza')).toBe(false);
  });
});
