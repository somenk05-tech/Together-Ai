import { allergyMark, allergyNotice, joinTerms, venueMark } from './allergen-voice';

const PLACES = { one: 'place', many: 'places' };
const DISHES = { one: 'dish', many: 'dishes' };

describe('the notice never speaks unless something happened', () => {
  it('nothing removed → no sentence, not a zero', () => {
    expect(allergyNotice(['peanuts'], 0, PLACES)).toBeNull();
    expect(allergyNotice([], 0, PLACES)).toBeNull();
  });

  it('nothing declared → no sentence, even if a count arrives', () => {
    // A count with no matched term means a caller wired it wrong. Silence beats
    // "3 places are not shown here because you told us about ." — the golden
    // rule's mirror applied to our own actions.
    expect(allergyNotice([], 3, PLACES)).toBeNull();
    expect(allergyNotice(['   '], 3, PLACES)).toBeNull();
  });
});

describe('what it actually says', () => {
  it('singular and plural, in the right nouns', () => {
    expect(allergyNotice(['peanuts'], 1, PLACES)!.sentence)
      .toBe('1 place is not shown here because you told us about peanuts.');
    expect(allergyNotice(['peanuts'], 4, PLACES)!.sentence)
      .toBe('4 places are not shown here because you told us about peanuts.');
    expect(allergyNotice(['peanuts'], 1, DISHES)!.sentence)
      .toBe('1 dish is not shown here because you told us about peanuts.');
  });

  it('names the terms that MATCHED, deduplicated and stable', () => {
    const n = allergyNotice(['milk', 'peanuts', 'milk'], 6, PLACES)!;
    expect(n.terms).toEqual(['milk', 'peanuts']);
    expect(n.sentence).toContain('milk and peanuts');
    expect(n.removed).toBe(6);
  });

  it('reads as a sentence at one, two and three terms', () => {
    expect(joinTerms(['peanuts'])).toBe('peanuts');
    expect(joinTerms(['peanuts', 'milk'])).toBe('peanuts and milk');
    expect(joinTerms(['peanuts', 'milk', 'egg'])).toBe('peanuts, milk and egg');
  });
});

describe('the marker on one dish', () => {
  it('names what matched when it is something they cannot see', () => {
    const m = allergyMark('nuts', 'cashew paste', 'Shahi Korma');
    expect(m.label).toBe('Contains cashew paste — you told us about nuts.');
    expect(m.term).toBe('nuts');
  });

  it("does not read the dish's own name back to somebody looking at it", () => {
    // "Contains Kaju Curry" under a heading that reads Kaju Curry is noise.
    expect(allergyMark('nuts', 'Kaju Curry', 'Kaju Curry').label)
      .toBe('Contains nuts — you told us to avoid it.');
    // Same thing, punctuated differently — clean() decides, not equality.
    expect(allergyMark('nuts', 'Kaju  Curry!', 'Kaju Curry').label)
      .toBe('Contains nuts — you told us to avoid it.');
  });
});

describe('the marker on a venue that is shown rather than hidden', () => {
  it('carries the proportion, because that is the decision being made', () => {
    expect(venueMark('peanuts', 'Moongphali Chaat', 1).label)
      .toBe('1 dish here contains peanuts: Moongphali Chaat.');
    expect(venueMark('peanuts', 'Groundnut Chikki', 4).label)
      .toBe('4 dishes here contain peanuts, including Groundnut Chikki.');
  });

  it('admits when it cannot read the menu at all', () => {
    // A live Places result has no menu — guessing from the name would be
    // inventing, and saying nothing would be worse.
    expect(venueMark('peanuts', 'The Groundnut Bar', 0, false).label)
      .toBe("We can't read this menu, and peanuts is in the name — worth checking before you order.");
  });
});
