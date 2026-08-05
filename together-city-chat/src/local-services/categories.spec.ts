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

  it('carries the owner’s eighteen groups', () => {
    // Not a count for its own sake: this is the list supplied on 5 Aug, and a
    // group quietly disappearing in a merge is the kind of thing that shows up
    // as "the directory feels smaller" six weeks later.
    // Eighteen from the owner, plus "Other" — which must be LAST, or it lands
    // in the middle of the browse chips and reads as a trade rather than an
    // escape hatch.
    expect(CATEGORY_GROUPS).toHaveLength(19);
    expect(CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1]).toBe('Other');
    expect(SERVICE_CATEGORIES[SERVICE_CATEGORIES.length - 1].key).toBe('other');
    const want = ['Healthcare', 'Food & Daily Needs', 'Home Services', 'Emergency', 'Learning', 'Experiences'];
    expect(want.filter((g) => !CATEGORY_GROUPS.includes(g))).toEqual([]);
  });

  it('groups the picker in the order the list was written', () => {
    const grouped = categoriesByGroup();
    expect(grouped.map((g) => g.group)).toEqual(CATEGORY_GROUPS);
    expect(grouped[0].group).toBe('Healthcare');
    // Every category lands in exactly one bucket.
    expect(grouped.reduce((n, g) => n + g.items.length, 0)).toBe(SERVICE_CATEGORIES.length);
  });

  it('resolves a key to its label, and refuses one that is not ours', () => {
    expect(isCategory('plumbers')).toBe(true);
    expect(isCategory('plumber')).toBe(false); // the old starter key — retired, not renamed into
    expect(categoryLabel('plumbers')).toBe('Plumbers');
    // An unknown key renders as itself rather than as "undefined" on a screen.
    expect(categoryLabel('not_a_trade')).toBe('not_a_trade');
  });

  /**
   * A HANDFUL OF THESE ARE NOT BUSINESSES, AND THAT IS THE OWNER'S CALL.
   *
   * "SOS", "Emergency contacts" and "Disaster alerts" are features rather than
   * things a citizen lists themselves as, and "Nearby hospitals" restates
   * Healthcare › Hospitals. They ship as given. This test does not fail on
   * them — it names them, so that when somebody wonders why the Emergency
   * group is empty, the answer is here rather than in a chat log.
   */
  it('records which Emergency entries nobody will ever list themselves under', () => {
    const emergency = categoriesByGroup().find((g) => g.group === 'Emergency');
    expect(emergency?.items.map((i) => i.label)).toEqual([
      'SOS', 'Roadside assistance', 'Emergency contacts',
      'Nearby hospitals', 'Blood donors', 'Disaster alerts',
    ]);
  });
});
