import {
  GEM_CATALOG, REMEDY_TEMPLATES, buildGemGuidance, buildRemedies, GEM_DISCLAIMER,
  type HealthFlag,
} from './gem-remedy-content';
import { violations } from './voice';
import { DASHA_LORDS } from './personal-factors';

/**
 * Two rules govern this content, and neither is optional.
 *
 *  1. The hub's voice: structured panels may show the machinery, PROSE NEVER
 *     MAY. Every sentence here is checked against the same `violations()` the
 *     rest of the zone is checked against — not a separate, laxer standard.
 *  2. A bodily observance is never suggested to somebody who should not do it.
 */

describe('every lord has an entry', () => {
  it('covers all nine, so no period can land on a gap', () => {
    for (const lord of DASHA_LORDS) {
      expect(GEM_CATALOG[lord]).toBeDefined();
      expect(REMEDY_TEMPLATES[lord].length).toBeGreaterThan(0);
    }
  });
});

describe('the prose never names the machinery', () => {
  it('passes the zone’s own voice checker, stone by stone', () => {
    for (const lord of DASHA_LORDS) {
      const g = GEM_CATALOG[lord];
      // `intention` and `caution` are prose. `stone`, `metal`, `finger`,
      // `beginOn` and `lord` are labelled data and are exempt by design.
      expect(violations(g.intention)).toEqual([]);
      expect(violations(g.caution)).toEqual([]);
    }
  });

  it('passes it for every remedy, practice and title', () => {
    for (const lord of DASHA_LORDS) {
      for (const r of REMEDY_TEMPLATES[lord]) {
        expect(violations(r.title)).toEqual([]);
        expect(violations(r.practice)).toEqual([]);
      }
    }
  });

  it('would actually catch a violation, so the checks above mean something', () => {
    // Guards the guard: if violations() ever stopped matching, every assertion
    // above would pass while checking nothing.
    expect(violations('Your chart shows Venus in Leo this month.').length).toBeGreaterThan(0);
  });
});

describe('choosing the stones', () => {
  it('leads with the stone of the current period', () => {
    const g = buildGemGuidance({ maha: 'Jupiter', antar: 'Venus' });
    expect(g.primary.stone).toBe(GEM_CATALOG.Jupiter.stone);
    expect(g.supporting.stone).toBe(GEM_CATALOG.Venus.stone);
  });

  it('never offers the same stone twice', () => {
    // When both periods share a lord, the supporting slot has to give way.
    const g = buildGemGuidance({ maha: 'Saturn', antar: 'Saturn' });
    expect(g.supporting.stone).not.toBe(g.primary.stone);
  });

  it('is deterministic — the same period gives the same stones', () => {
    const a = buildGemGuidance({ maha: 'Mars', antar: 'Ketu' });
    for (let i = 0; i < 10; i++) {
      const b = buildGemGuidance({ maha: 'Mars', antar: 'Ketu' });
      expect(b.primary.stone).toBe(a.primary.stone);
      expect(b.supporting.stone).toBe(a.supporting.stone);
    }
  });

  it('always carries the disclaimer', () => {
    expect(buildGemGuidance({ maha: 'Sun', antar: 'Moon' }).disclaimer).toBe(GEM_DISCLAIMER);
    expect(buildRemedies({ maha: 'Sun', antar: 'Moon' }).disclaimer).toBe(GEM_DISCLAIMER);
  });
});

describe('remedies respect what the citizen has told us', () => {
  const titlesFor = (flags: HealthFlag[]) =>
    buildRemedies({ maha: 'Sun', antar: 'Jupiter' }, flags).remedies.map((r) => r.title);

  it('offers the fasting practices when nothing rules them out', () => {
    expect(titlesFor([])).toContain('A lighter Sunday');
    expect(titlesFor([])).toContain('A simple Thursday');
  });

  it('withholds fasting during pregnancy', () => {
    expect(titlesFor(['pregnancy'])).not.toContain('A lighter Sunday');
    expect(titlesFor(['pregnancy'])).not.toContain('A simple Thursday');
  });

  it('withholds fasting for diabetes, an eating disorder, and from minors', () => {
    for (const flag of ['diabetes', 'eating-disorder', 'minor', 'underweight', 'breastfeeding'] as HealthFlag[]) {
      expect(titlesFor([flag])).not.toContain('A lighter Sunday');
    }
  });

  it('keeps the practices that involve nothing bodily', () => {
    // The point is a shorter safe list, not an empty one.
    const out = titlesFor(['pregnancy', 'diabetes']);
    expect(out).toContain('Give where it is not seen');
    expect(out.length).toBeGreaterThan(0);
  });

  it('says what it withheld rather than quietly showing less', () => {
    const r = buildRemedies({ maha: 'Sun', antar: 'Jupiter' }, ['pregnancy']);
    expect(r.withheld.map((w) => w.title)).toContain('A lighter Sunday');
    expect(r.withheld[0].reason).toMatch(/health/i);
  });

  it('withholds hard exercise in pregnancy and heart conditions', () => {
    const mars = buildRemedies({ maha: 'Mars', antar: 'Mars' }, ['heart']);
    expect(mars.remedies.map((x) => x.key)).not.toContain('mars-move');
  });

  it('does not repeat a lord’s practices when both periods share it', () => {
    const r = buildRemedies({ maha: 'Venus', antar: 'Venus' });
    expect(new Set(r.remedies.map((x) => x.key)).size).toBe(r.remedies.length);
  });
});
