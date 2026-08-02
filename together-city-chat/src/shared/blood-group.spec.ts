import { BLOOD_GROUPS, BLOOD_GROUP_UNKNOWN, bloodGroupFrom, bloodGroupNote } from './blood-group';

/**
 * The field is optional, so most of this spec is about SILENCE — which kind it
 * is, and that neither kind is ever turned into an answer.
 */
describe('blood group', () => {
  it('reads the eight groups, however they were typed', () => {
    expect(bloodGroupFrom('O+')).toBe('O+');
    expect(bloodGroupFrom('o positive')).toBe('O+');
    expect(bloodGroupFrom(' AB neg ')).toBe('AB-');
    expect(bloodGroupFrom('A−')).toBe('A-');        // unicode minus
    expect(bloodGroupFrom('b Pos')).toBe('B+');
    for (const g of BLOOD_GROUPS) expect(bloodGroupFrom(g)).toBe(g);
  });

  it('keeps "I do not know" as an answer, not as an absence', () => {
    expect(bloodGroupFrom('unknown')).toBe(BLOOD_GROUP_UNKNOWN);
    expect(bloodGroupFrom("don't know")).toBe(BLOOD_GROUP_UNKNOWN);
    expect(bloodGroupNote(BLOOD_GROUP_UNKNOWN)).toBe("You told us you don't know it");
  });

  it('says which silence it is', () => {
    // The distinction the whole 1 Aug absence sweep was about: nobody asked is
    // not the same fact as they answered and do not know.
    expect(bloodGroupNote(null)).toBe('Not recorded');
    expect(bloodGroupNote(undefined)).toBe('Not recorded');
    expect(bloodGroupNote('')).toBe('Not recorded');
    expect(bloodGroupNote(BLOOD_GROUP_UNKNOWN)).not.toBe('Not recorded');
  });

  it('refuses to guess', () => {
    // Whatever this returned would be filed as the citizen's own answer about
    // their body, and nothing here can check it.
    expect(bloodGroupFrom('C+')).toBeUndefined();
    expect(bloodGroupFrom('A')).toBeUndefined();          // sign missing: which one?
    expect(bloodGroupFrom('O positive-ish')).toBeUndefined();
    expect(bloodGroupFrom('bombay')).toBeUndefined();     // real, and not offered - see the doc
    expect(bloodGroupFrom('0+')).toBeUndefined();         // zero, not the letter O
    expect(bloodGroupNote('C+')).toBe('Not recorded');
  });
});
