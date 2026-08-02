import { BLOOD_GROUPS, BLOOD_GROUP_UNKNOWN, bloodGroupFrom, bloodGroupLabel, bloodGroupNote } from './blood-group';

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
    expect(bloodGroupFrom('bombay')).toBeUndefined();     // real, but hh says nothing about Rh
    expect(bloodGroupFrom('0+')).toBeUndefined();         // zero, not the letter O
    expect(bloodGroupNote('C+')).toBe('Not recorded');
  });
});

describe('the Bombay phenotype', () => {
  it('is offered, in both Rh forms', () => {
    expect(bloodGroupFrom('hh+')).toBe('hh+');
    expect(bloodGroupFrom('hh-')).toBe('hh-');
    expect(BLOOD_GROUPS).toContain('hh+');
    expect(BLOOD_GROUPS).toContain('hh-');
  });

  it('reads the names people actually use for it', () => {
    expect(bloodGroupFrom('Bombay +')).toBe('hh+');
    expect(bloodGroupFrom('bombay (hh) negative')).toBe('hh-');
    expect(bloodGroupFrom('Oh+')).toBe('hh+');
    expect(bloodGroupFrom('HH NEG')).toBe('hh-');
  });

  it('still refuses it without an Rh sign', () => {
    // hh is ABO-independent, not Rh-independent. An unsigned answer is as
    // incomplete as a bare "A", and half a fact about somebody's blood is not
    // a fact worth storing.
    expect(bloodGroupFrom('bombay')).toBeUndefined();
    expect(bloodGroupFrom('hh')).toBeUndefined();
    expect(bloodGroupFrom('Oh')).toBeUndefined();
  });

  it('is shown by name, never as its storage key', () => {
    // 'hh+' in front of a citizen is the app talking to itself.
    expect(bloodGroupLabel('hh+')).toBe('Bombay (hh) +');
    expect(bloodGroupLabel('hh-')).toBe('Bombay (hh) −');
    expect(bloodGroupNote('hh+')).toBe('Bombay (hh) +');
    // Everything else is already its own label.
    expect(bloodGroupLabel('O-')).toBe('O-');
  });

  it('does not collide with the ABO groups it sits beside', () => {
    // 'O' and 'Oh' are one character apart and mean different things.
    expect(bloodGroupFrom('O+')).toBe('O+');
    expect(bloodGroupFrom('O positive')).toBe('O+');
    expect(bloodGroupFrom('A+')).toBe('A+');
  });
});
