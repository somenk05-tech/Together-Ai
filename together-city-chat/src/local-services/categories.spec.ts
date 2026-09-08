import { SERVICE_CATEGORIES, CATEGORY_GROUPS, CATEGORY_KEYS, categoriesByGroup, isCategory, categoryLabel } from './categories';

/**
 * THE VOCABULARY IS A CONTRACT, NOT A LIST.
 *
 * `key` is what a listing stores. The day somebody tidies "eye_hospitals_and_
 * optometrists" into "optometrists" is the day every optometrist in the city
 * drops out of the directory — the rows still exist, they just no longer match
 * anything the picker can offer, so nobody can find them and their owners
 * cannot see why. There is no error, no log line, and no test failing. Which is
 * why there is one here.
 *
 * The rule is: ADD and RETIRE, never rename. A retired trade keeps its key and
 * stops being offered; the listings under it stay findable by anyone who has
 * the link, and their owners can move them by editing.
 */
describe('the service vocabulary', () => {
  it('has no duplicate keys — a duplicate silently swallows one trade', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of CATEGORY_KEYS) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });

  it('has no duplicate labels within a group — two identical chips are a coin toss', () => {
    for (const g of categoriesByGroup()) {
      const labels = g.items.map((i) => i.label);
      const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
      expect([g.group, ...dupes]).toEqual([g.group]);
    }
  });

  it('keys are url- and column-safe', () => {
    // Asserted as a filtered list rather than in a loop, so a failure names the
    // offending key instead of just saying "expected true to be false".
    expect(CATEGORY_KEYS.filter((k) => !/^[a-z0-9_]+$/.test(k))).toEqual([]);
    expect(CATEGORY_KEYS.filter((k) => k.length > 48)).toEqual([]);
  });

  it('every category belongs to a named group', () => {
    expect(SERVICE_CATEGORIES.filter((c) => !c.group.trim()).map((c) => c.key)).toEqual([]);
    expect(SERVICE_CATEGORIES.filter((c) => !c.label.trim()).map((c) => c.key)).toEqual([]);
  });

  it('carries the owner’s groups — eighteen on 5 Aug, fifteen since three were retired on 8 Sep', () => {
    // Not a count for its own sake: a group quietly disappearing in a merge is
    // the kind of thing that shows up as "the directory feels smaller" six
    // weeks later. Fifteen offered, plus "Other" — which must be LAST, or it
    // lands in the middle of the browse chips and reads as a trade rather than
    // an escape hatch.
    expect(CATEGORY_GROUPS).toHaveLength(16);
    expect(CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1]).toBe('Other');
    expect(SERVICE_CATEGORIES[SERVICE_CATEGORIES.length - 1].key).toBe('other');
    const want = ['Healthcare', 'Food & Daily Needs', 'Home Services', 'Learning', 'Personal Care', 'Automotive'];
    expect(want.filter((g) => !CATEGORY_GROUPS.includes(g))).toEqual([]);
  });

  /**
   * RETIRED, NOT DELETED (owner, 8 Sep: "remove all these categories for now
   * from local services"). Emergency, Experiences and Travel & Hospitality
   * come off the picker, the chips, the word search and the DTO enum — and
   * their keys stay in the vocabulary, so a listing filed under one keeps its
   * label instead of rendering its key. "For now" is the flag: delete
   * `retired: true` and the group is back.
   */
  it('keeps a retired trade’s key but offers it nowhere', () => {
    const gone = ['Emergency', 'Experiences', 'Travel & Hospitality'];
    for (const g of gone) {
      expect(CATEGORY_GROUPS).not.toContain(g);
      expect(categoriesByGroup().find((x) => x.group === g)).toBeUndefined();
      expect(SERVICE_CATEGORIES.filter((c) => c.group === g).every((c) => c.retired)).toBe(true);
      expect(SERVICE_CATEGORIES.some((c) => c.group === g)).toBe(true);
    }
    expect(isCategory('hotels')).toBe(true);           // an old listing still resolves…
    expect(categoryLabel('hotels')).toBe('Hotels');
    expect(CATEGORY_KEYS).not.toContain('hotels');     // …but nothing new is filed there
    expect(CATEGORY_KEYS).not.toContain('sos');
    expect(CATEGORY_KEYS).not.toContain('trekking');
  });

  it('groups the picker in the order the list was written', () => {
    const grouped = categoriesByGroup();
    expect(grouped.map((g) => g.group)).toEqual(CATEGORY_GROUPS);
    expect(grouped[0].group).toBe('Healthcare');
    // Every OFFERED category lands in exactly one bucket; the retired ones in none.
    expect(grouped.reduce((n, g) => n + g.items.length, 0)).toBe(SERVICE_CATEGORIES.filter((c) => !c.retired).length);
  });

  it('resolves a key to its label, and refuses one that is not ours', () => {
    expect(isCategory('plumbers')).toBe(true);
    expect(isCategory('plumber')).toBe(false); // the old starter key — retired, not renamed into
    expect(categoryLabel('plumbers')).toBe('Plumbers');
    // An unknown key renders as itself rather than as "undefined" on a screen.
    expect(categoryLabel('not_a_trade')).toBe('not_a_trade');
  });

});
