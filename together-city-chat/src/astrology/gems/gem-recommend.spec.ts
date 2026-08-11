import { GEMS, GEM_BY_ID, PRIMARY_BY_PLANET } from './gem-catalog';
import { recommendGems, houseFrom, lordOf } from './gem-recommend';
import { WEARING, TRIAL_REQUIRED } from './wearing';
import { GEM_CATALOG } from '../gem-remedy-content';
import type { SignName } from '../astro-engine';

/**
 * A MARKETPLACE THAT PRESCRIBES HAS TO BE RIGHT ABOUT THE PRESCRIPTION.
 *
 * These stones cost between ₹80 and ₹400,000 a carat and the page tells people
 * which one is theirs. The tests below are not about rendering — they are about
 * the two things that would be embarrassing to get wrong: which stone, and how
 * it is worn.
 */

const chart = (over: Partial<Parameters<typeof recommendGems>[0]> = {}) => recommendGems({
  ascendant: 'Leo', moonSign: 'Taurus', mahadasha: 'Sun', antardasha: 'Venus', lifePath: 1, ...over,
});

describe('the shelf', () => {
  it('is the thirty stones, split the way the data sheet splits them', () => {
    expect(GEMS.length).toBe(30);
    const by = (k: string) => GEMS.filter((g) => g.kind === k).length;
    expect({ primary: by('primary'), substitute: by('substitute'), wellness: by('wellness') })
      .toEqual({ primary: 9, substitute: 16, wellness: 5 });
  });

  it('has exactly one primary per planet, which is what makes the join unambiguous', () => {
    expect(PRIMARY_BY_PLANET.size).toBe(9);
    for (const g of GEMS.filter((x) => x.kind === 'primary')) {
      expect(PRIMARY_BY_PLANET.get(g.planet)?.id).toBe(g.id);
    }
  });

  it('points every substitute at a primary that exists', () => {
    for (const g of GEMS.filter((x) => x.kind === 'substitute')) {
      expect({ id: g.id, primary: GEM_BY_ID.get(g.substituteFor ?? '')?.kind }).toEqual({ id: g.id, primary: 'primary' });
    }
    // And a wellness stone is prescribed to nobody.
    for (const g of GEMS.filter((x) => x.kind === 'wellness')) expect(g.substituteFor).toBeNull();
  });

  it('carries a price range for every stone, min under max', () => {
    for (const g of GEMS) {
      expect({ id: g.id, ok: g.perCaratMinInr > 0 && g.perCaratMinInr < g.perCaratMaxInr })
        .toEqual({ id: g.id, ok: true });
    }
  });

  it('has a photograph for every stone, keyed by its own id', () => {
    // The thirty images were extracted from the owner's stone-pages HTML. A
    // card whose src does not match its id is a card showing another stone.
    for (const g of GEMS) expect(g.image).toBe(`/assets/gems/${g.id}.webp`);
  });
});

describe('which stone this chart calls for', () => {
  it('reads the life stone off the ascendant, not off anything else', () => {
    // Leo's ruler is the Sun, and the Sun's stone is ruby. This is the one row
    // the owner's own card text names, so it doubles as a check on the table.
    const r = chart({ ascendant: 'Leo' });
    const life = r.recommendations.find((x) => x.role === 'life');
    expect(life?.gem.id).toBe('ruby');
    expect(GEM_BY_ID.get('ruby')?.whyRecommended).toContain('Life Stone for Leo lagna');
  });

  it('reads the fortune stone off the ninth house', () => {
    // Ninth from Sagittarius is Leo, ruled by the Sun — again, the card says so.
    expect(houseFrom('Sagittarius', 9)).toBe('Leo');
    const r = chart({ ascendant: 'Sagittarius', mahadasha: 'Saturn', moonSign: 'Aries', lifePath: 5 });
    expect(r.recommendations.find((x) => x.role === 'fortune')?.gem.id).toBe('ruby');
  });

  it('counts the ninth house inclusively, all the way round the wheel', () => {
    for (const s of ['Aries', 'Cancer', 'Libra', 'Capricorn', 'Pisces'] as SignName[]) {
      expect(houseFrom(s, 1)).toBe(s);
      expect(houseFrom(houseFrom(s, 9), 5)).toBe(s);   // 9th of the 9th is the 5th back
    }
  });

  it('never lists one stone twice, however many ways it qualifies', () => {
    // Leo lagna, Sun mahadasha, life path 1 — three separate routes to ruby.
    const r = chart({ ascendant: 'Leo', mahadasha: 'Sun', lifePath: 1 });
    const ids = r.recommendations.map((x) => x.gem.id);
    expect(ids.length).toBe(new Set(ids).size);
    const ruby = r.recommendations.find((x) => x.gem.id === 'ruby');
    // One card, holding the highest role and every reason it earned.
    expect(ruby?.role).toBe('life');
    expect(ruby!.reasons.length).toBeGreaterThan(1);
  });

  it('drops the two stones that need a birth time, rather than guessing them', () => {
    const r = chart({ ascendant: null });
    expect(r.timeUnknown).toBe(true);
    expect(r.recommendations.some((x) => x.role === 'life' || x.role === 'fortune')).toBe(false);
    // And still answers — the moon rashi stone is the fallback, not an error.
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it('never opens on the whole shelf', () => {
    // Five roles, so five cards at the very most, and a stone that holds two
    // roles makes it fewer. Thirty is what a jewellery site shows.
    for (const asc of [null, 'Aries', 'Leo', 'Capricorn'] as (SignName | null)[]) {
      const r = chart({ ascendant: asc });
      expect({ asc, tooMany: r.recommendations.length > 5 }).toEqual({ asc, tooMany: false });
    }
  });

  it('offers the cheaper stone for the same planet rather than only the costly one', () => {
    // A diamond is ₹150,000 a carat and a white sapphire is ₹6,000. Somebody
    // whose chart asks for Venus should be told both exist.
    const r = chart({ ascendant: 'Libra' });
    const venus = r.recommendations.find((x) => x.gem.planet === 'venus');
    expect(venus?.gem.id).toBe('diamond');
    expect(venus!.substitutes.map((s) => s.gem.id)).toContain('white-sapphire');
    for (const s of venus!.substitutes) expect(s.gem.perCaratMinInr).toBeLessThan(venus!.gem.perCaratMinInr);
  });

  it('carries the 72-hour trial note on the three stones that need it, and on no others', () => {
    // Neelam, Gomed and Lehsunia are not simply sold. The flag travels with the
    // recommendation so a surface cannot forget to print it.
    const r = chart({ ascendant: 'Capricorn', moonSign: 'Aquarius', mahadasha: 'Saturn', lifePath: 8 });
    const neelam = r.recommendations.find((x) => x.gem.id === 'blue-sapphire');
    expect(neelam?.trialNote).toContain('72 hours');
    for (const rec of r.recommendations) {
      expect({ id: rec.gem.id, flagged: rec.trialNote !== null })
        .toEqual({ id: rec.gem.id, flagged: TRIAL_REQUIRED.has(rec.gem.id) });
    }
  });
});

describe('which stone to buy first', () => {
  /**
   * A PAGE THAT HANDS SOMEBODY FOUR STONES AND LETS THEM WORK OUT THE ORDER has
   * done the hard part and stopped one step short. The tradition is not neutral
   * between them, so neither is this.
   */
  it('ranks them 1, 2, 3 with no gaps and no ties', () => {
    const r = chart();
    expect(r.recommendations.map((x) => x.rank)).toEqual(r.recommendations.map((_, i) => i + 1));
  });

  it('calls the first one the must-have and nothing else', () => {
    const r = chart();
    expect(r.recommendations[0].priority).toBe('must-have');
    expect(r.recommendations.filter((x) => x.priority === 'must-have').length).toBe(1);
  });

  it('promotes the moon stone to first when there is no birth time', () => {
    // The rank is the POSITION, not the role. Reading it off the role would put
    // a moon stone fourth on a page where it is the only stone there is.
    const r = chart({ ascendant: null });
    expect(r.recommendations[0].rank).toBe(1);
    expect(r.recommendations[0].priority).toBe('must-have');
    expect(['moon', 'period']).toContain(r.recommendations[0].role);
  });

  it('names the stones traditionally worn together, and never claims the opposite', () => {
    // The wearing table lists each planet's allies. The ENMITY list is a
    // separate file we do not have, so a stone missing from `wornWith` is not
    // being called incompatible — it is simply not claimed either way.
    const r = chart({ ascendant: 'Leo', moonSign: 'Cancer', mahadasha: 'Jupiter', antardasha: 'Sun', lifePath: 3 });
    const ruby = r.recommendations.find((x) => x.gem.id === 'ruby');
    // Sun's allies are moon, mars and jupiter — a yellow sapphire on the same
    // page is named, and every name is a stone that is actually on it.
    const onPage = new Set(r.recommendations.map((x) => x.gem.name));
    for (const rec of r.recommendations) {
      for (const name of rec.wornWith) {
        expect({ of: rec.gem.name, with: name, onPage: onPage.has(name) }).toEqual({ of: rec.gem.name, with: name, onPage: true });
      }
      expect(rec.wornWith).not.toContain(rec.gem.name);
    }
    expect(ruby!.wornWith.length).toBeGreaterThan(0);
  });
});

describe('how many carats, for this person', () => {
  /**
   * THE FAILURE THIS REPLACED, because it shipped and it was expensive.
   *
   * One rule for all thirty stones — a ratti per ten kilos — prescribed a
   * hundred-kilo citizen a NINE-CARAT BLUE SAPPHIRE, ₹1,35,000 to ₹4,50,000 of
   * Neelam. That is the one stone practice is most careful about and it is worn
   * SMALL. The body-weight rule is real; alone, it is a rule about the wearer
   * with nothing in it about the stone.
   */
  const forKg = (kg: number) => recommendGems({
    ascendant: 'Capricorn', moonSign: 'Taurus', mahadasha: 'Saturn', antardasha: 'Venus', lifePath: 8, bodyKg: kg,
  });

  it('never prescribes a heavy blue sapphire, whatever the wearer weighs', () => {
    for (const kg of [55, 70, 100, 140]) {
      const neelam = forKg(kg).recommendations.find((x) => x.gem.id === 'blue-sapphire')!;
      // Three to five ratti is the custom; five ratti is 4.55 ct.
      expect({ kg, ct: neelam.weight!.carats, tooBig: neelam.weight!.carats > 4.75 })
        .toEqual({ kg, ct: neelam.weight!.carats, tooBig: false });
    }
  });

  it('keeps a diamond small and a coral heavy, because they are worn that way', () => {
    const r = recommendGems({ ascendant: 'Libra', moonSign: 'Aries', mahadasha: 'Venus', antardasha: 'Mars', lifePath: 6, bodyKg: 100 });
    const venus = r.recommendations.find((x) => x.gem.planet === 'venus')!;
    const mars = r.recommendations.find((x) => x.gem.planet === 'mars');
    expect(venus.weight!.carats).toBeLessThanOrEqual(2);      // diamond, under two carats
    if (mars) expect(mars.weight!.carats).toBeGreaterThan(venus.weight!.carats * 3);
  });

  it('places a person inside the stone\'s range rather than outside it', () => {
    // Light and heavy wearers of the same stone differ, but both stay in range.
    const light = forKg(45).recommendations.find((x) => x.gem.id === 'blue-sapphire')!.weight!;
    const heavy = forKg(120).recommendations.find((x) => x.gem.id === 'blue-sapphire')!.weight!;
    expect(light.carats).toBeLessThanOrEqual(heavy.carats);
    for (const w of [light, heavy]) {
      expect(w.carats).toBeGreaterThanOrEqual(w.fromCt);
      expect(w.carats).toBeLessThanOrEqual(w.toCt);
    }
    // And it says WHY it sits where it does, so the page can explain itself.
    expect(['floor', 'placed', 'ceiling']).toContain(heavy.bound);
  });

  it('bounds every stone in the catalogue, primaries and substitutes alike', () => {
    for (const kg of [40, 70, 100, 150]) {
      for (const rec of forKg(kg).recommendations) {
        for (const w of [rec.weight!, ...rec.substitutes.map((s) => s.weight!)]) {
          expect({ kg, id: rec.gem.id, inRange: w.carats >= w.fromCt && w.carats <= w.toCt })
            .toEqual({ kg, id: rec.gem.id, inRange: true });
        }
      }
    }
  });

  it('makes a substitute heavier than the stone it stands in for', () => {
    const r = recommendGems({ ascendant: 'Libra', moonSign: 'Taurus', mahadasha: 'Venus', antardasha: 'Sun', lifePath: 6, bodyKg: 70 });
    const venus = r.recommendations.find((x) => x.gem.planet === 'venus')!;
    for (const s of venus.substitutes) expect(s.weight!.carats).toBeGreaterThan(venus.weight!.carats);
  });

  it('offers no figure at all when nobody has told us a body weight', () => {
    const r = chart();
    expect(r.weightUnknown).toBe(true);
    for (const rec of r.recommendations) {
      expect({ id: rec.gem.id, weight: rec.weight, from: rec.fromInr }).toEqual({ id: rec.gem.id, weight: null, from: null });
    }
  });

  it('prices the stone at that weight, not per carat', () => {
    const r = forKg(70);
    const g = r.recommendations[0];
    expect(g.fromInr).toBe(Math.round(g.weight!.carats * g.gem.perCaratMinInr));
    expect(g.toInr).toBe(Math.round(g.weight!.carats * g.gem.perCaratMaxInr));
  });
});

describe('how it is worn', () => {
  it('names a finger, a hand, a metal and a day for every recommendation', () => {
    // The first question anybody asks about a prescribed stone is which finger.
    for (const rec of chart().recommendations) {
      const w = rec.wearing;
      expect({ id: rec.gem.id, complete: !!(w.finger && w.hand && w.metal && w.day) })
        .toEqual({ id: rec.gem.id, complete: true });
    }
  });

  it('agrees with the remedies page, row for row', () => {
    /**
     * THE REASON `wearing.ts` EXISTS. These nine rows were in the codebase
     * twice — once for the remedies page and once inside the owner's ring
     * studio — and they disagreed about Ketu: little finger in one, middle
     * finger in the other. Two answers to "which finger", both confident, read
     * by two pages nobody compares.
     *
     * The single table won. This asserts the old one now derives from it, so
     * the divergence cannot come back the next time either is edited.
     */
    for (const [lord, entry] of Object.entries(GEM_CATALOG)) {
      const w = WEARING[lord.toLowerCase() as keyof typeof WEARING];
      expect({ lord, finger: entry.finger }).toEqual({ lord, finger: w.finger });
      expect({ lord, day: entry.beginOn }).toEqual({ lord, day: w.day });
      expect({ lord, metal: entry.metal }).toEqual({ lord, metal: w.metal });
    }
  });
});
