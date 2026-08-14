import { readSituation, whoIsIt, labels, allLines } from './relate';
import { violations } from './voice';

describe('she works out who it is about', () => {
  it('reads the ordinary words people use', () => {
    expect(whoIsIt('my mum keeps calling')?.kind).toBe('parent');
    expect(whoIsIt('things are tense with my wife')?.kind).toBe('partner');
    expect(whoIsIt('my boss does not listen')?.kind).toBe('colleague');
    expect(whoIsIt('my brother and i had a fight')?.kind).toBe('sibling');
    expect(whoIsIt('i am angry with myself')?.kind).toBe('self');
  });

  /** "father-in-law" is not a father, and matching shortest-first would say it
   *  was. The whole category would be wrong for the person most likely to be
   *  the reason somebody is asking. */
  it('does not read an in-law as a parent', () => {
    expect(whoIsIt('my mother in law keeps showing up')?.kind).toBe('inlaw');
    expect(whoIsIt('my father in law')?.kind).toBe('inlaw');
    expect(whoIsIt('my mother')?.kind).toBe('parent');
  });

  it('echoes the word they used rather than the category', () => {
    // Being told your own relationship's correct label is the tell of a form.
    expect(readSituation('my mum does not listen')?.who).toBe('mum');
    expect(readSituation('my mom does not listen')?.who).toBe('mom');
  });
});

describe('she reads what kind of stuck it is', () => {
  const shape = (t: string) => readSituation(t)?.shape;

  it('tells the shapes apart', () => {
    expect(shape('my wife never listens when I bring it up')).toBe('unheard');
    expect(shape('my mum keeps asking and I cannot say no')).toBe('boundary');
    expect(shape('I was wrong and I owe my brother an apology')).toBe('apology');
    expect(shape('we had a fight and now we are not speaking')).toBe('repair');
    expect(shape('my friend and I have drifted, we barely speak')).toBe('distance');
    expect(shape('I do not know how to tell my dad')).toBe('avoidance');
  });

  it('gives a script for a shape it recognises', () => {
    const r = readSituation('my wife never listens when I bring it up');
    expect(r?.script?.opening).toBeTruthy();
    expect(r?.script?.why).toBeTruthy();
  });

  /** Talking to yourself about yourself is a different job. Reusing the
   *  couple's script would be the tell that nobody thought about it. */
  it('has its own answers for the relationship with yourself', () => {
    const other = readSituation('my wife keeps asking and I cannot say no')?.script?.opening;
    const self = readSituation('I keep saying yes to myself and cannot say no')?.script?.opening;
    expect(self).toBeTruthy();
    expect(self).not.toBe(other);
  });

  /** Somebody mentioning their sister while asking about dinner is not a
   *  relationship turn, and reaching for a script there is the failure mode
   *  that makes this kind of feature insufferable. */
  it('stays out of it when there is nothing to read', () => {
    expect(readSituation('find somewhere for dinner')).toBeUndefined();
    expect(readSituation('what is my balance')).toBeUndefined();
    expect(readSituation('')).toBeUndefined();
  });
});

/**
 * ── THE PART THAT MATTERS ─────────────────────────────────────────────────
 *
 * A communication script handed into a controlling relationship is not neutral.
 * It can be used as evidence by the person causing the harm, and it tells
 * somebody that what they are living inside is a communication problem. These
 * are checked BEFORE the relationship and before the shape, and they return no
 * script at all.
 */
describe('some things are not hers', () => {
  const beyond = [
    'my husband hits me',
    'I am scared of him',
    'he threatened me',
    'she wont let me see my friends',
    'he checks my phone and tracks me',
    'my dad drinks too much',
  ];

  it.each(beyond)('hands %j to a person, not a script', (t) => {
    const r = readSituation(t);
    expect(r?.handOff).toBeTruthy();
    expect(r?.script).toBeUndefined();
  });

  it('points at somebody real rather than trailing off', () => {
    const r = readSituation('my husband hits me');
    expect(r?.handOff).toMatch(/counsell?or|somebody|someone you trust/i);
  });

  /** The check runs first, so a message that would otherwise be a tidy
   *  "boundary" does not get a boundary script on the way past. */
  it('wins over a shape it would otherwise match', () => {
    const r = readSituation('she wont let me say no and keeps asking every day');
    expect(r?.script).toBeUndefined();
    expect(r?.handOff).toBeTruthy();
  });
});

/**
 * ── SHE DESCRIBES BEHAVIOUR, SHE DOES NOT DIAGNOSE A PERSON ───────────────
 *
 * "He didn't answer" is an observation. "He's avoidant" is a judgement about
 * somebody who is not in the room, cannot reply, and did not consent to being
 * assessed — delivered by the one person present who is upset with them.
 *
 * These words are the ones this genre reaches for FIRST, which is exactly why
 * the rule is code and the sweep is over every line the library can produce,
 * not over the handful somebody remembered to write a test for.
 */
describe('nothing she says diagnoses anybody', () => {
  it.each(allLines())('%j', (line) => {
    expect(labels(line)).toEqual([]);
  });

  it('is a rule that can actually fail', () => {
    // A guard that cannot fail is read as proof and is worth nothing.
    expect(labels('he is emotionally unavailable and frankly toxic')).not.toEqual([]);
    expect(labels('you should leave')).not.toEqual([]);
    expect(labels('that is textbook gaslighting')).not.toEqual([]);
  });

  /** The plan's own sentence: not therapy, not medical, not legal, and no
   *  promises about how it turns out. */
  it('never calls itself therapy or promises an outcome', () => {
    for (const line of allLines()) {
      expect(line).not.toMatch(/\btherap(?:y|ist)\b/i);
      expect(line).not.toMatch(/\b(?:will|guarantee|promise)[^.]*\b(?:work out|be fine|fix it)\b/i);
    }
  });
});

/** And all of it still has to sound like her. The city's voice rules apply to
 *  this lane exactly as they apply to a wallet balance. */
describe('and it is still Mira saying it', () => {
  it.each(allLines())('%j', (line) => {
    expect(violations(line)).toEqual([]);
  });
});
