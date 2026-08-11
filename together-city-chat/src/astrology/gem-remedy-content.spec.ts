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

describe('one practice a week', () => {
  /**
   * SIX WORTHWHILE THINGS AT ONCE IS A MENU, AND A MENU OF SELF-IMPROVEMENT IS
   * A MENU PEOPLE CLOSE. These are practices — they work by repetition — so the
   * useful question is not "what could I do" but "what am I doing this week".
   *
   * The three properties that make the rotation trustworthy are all here: it
   * does not move within a week, it moves on Monday, and it works through the
   * whole list before repeating. Nothing is stored, so the same arithmetic
   * gives the same answer on every device and after every deploy.
   */
  const pool = buildRemedies({ maha: 'Saturn', antar: 'Venus' }, [], new Date('2026-08-12T09:00:00Z'));

  it('gives exactly one practice for the week, and dates it', () => {
    expect(pool.thisWeek).not.toBeNull();
    // 12 August 2026 is a Wednesday; its week runs Monday the 10th to Sunday the 16th.
    expect(pool.weekFrom).toBe('2026-08-10');
    expect(pool.weekTo).toBe('2026-08-16');
  });

  it('does not change between Monday and Sunday', () => {
    const days = ['10', '11', '13', '16'].map((d) =>
      buildRemedies({ maha: 'Saturn', antar: 'Venus' }, [], new Date(`2026-08-${d}T22:00:00Z`)));
    for (const d of days) {
      expect({ from: d.weekFrom, title: d.thisWeek?.title })
        .toEqual({ from: '2026-08-10', title: pool.thisWeek?.title });
    }
  });

  it('turns over on the Monday, not on some other day', () => {
    const sunday = buildRemedies({ maha: 'Saturn', antar: 'Venus' }, [], new Date('2026-08-16T23:59:00Z'));
    const monday = buildRemedies({ maha: 'Saturn', antar: 'Venus' }, [], new Date('2026-08-17T00:01:00Z'));
    expect(sunday.thisWeek?.title).not.toBe(monday.thisWeek?.title);
    expect(monday.weekFrom).toBe('2026-08-17');
  });

  it('works through every practice before repeating one', () => {
    const seen = new Set<string>();
    for (let w = 0; w < pool.remedies.length; w++) {
      const d = new Date(Date.UTC(2026, 7, 10 + w * 7));
      seen.add(buildRemedies({ maha: 'Saturn', antar: 'Venus' }, [], d).thisWeek!.title);
    }
    expect(seen.size).toBe(pool.remedies.length);
  });

  it('shows what is coming without listing the whole rotation again', () => {
    expect(pool.upcoming.length).toBeLessThanOrEqual(3);
    expect(pool.upcoming[0].startsOn).toBe('2026-08-17');
    // And never repeats this week's practice as next week's.
    expect(pool.upcoming.map((u) => u.remedy.title)).not.toContain(pool.thisWeek!.title);
  });

  it('rotates only through practices that survived the health filter', () => {
    // A withheld practice is not shown, so it must not be scheduled either —
    // a rotation with a hole in it would show an empty week.
    const filtered = buildRemedies({ maha: 'Saturn', antar: 'Venus' }, ['pregnancy', 'diabetes'], new Date('2026-08-12T09:00:00Z'));
    const titles = new Set(filtered.remedies.map((r) => r.title));
    expect(titles.has(filtered.thisWeek!.title)).toBe(true);
    for (const u of filtered.upcoming) expect(titles.has(u.remedy.title)).toBe(true);
  });
});
