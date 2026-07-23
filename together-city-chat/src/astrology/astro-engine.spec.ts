import {
  aspectBetween, julianDay, moonLongitude, moonPhaseAngle, natalChart,
  positionsAt, scanMonth, signOf, siderealLon, sunLongitude, tzOffsetMinutes, geocodeApprox,
} from './astro-engine';

/** Vedic sidereal sun sign for a date (what the whole engine now reports). */
const vedicSun = (iso: string) => {
  const jd = julianDay(new Date(iso));
  return signOf(siderealLon(sunLongitude(jd), jd));
};

describe('astro-engine', () => {
  it('places the Sun in the correct VEDIC (sidereal) sign on known dates', () => {
    // Sidereal = tropical − Lahiri ayanamsa (~24°), the Jyotish standard.
    expect(vedicSun('2000-01-05T12:00:00Z')).toBe('Sagittarius');
    expect(vedicSun('1995-08-08T12:00:00Z')).toBe('Cancer');
    expect(vedicSun('1988-05-05T12:00:00Z')).toBe('Aries');
    expect(vedicSun('2010-11-08T12:00:00Z')).toBe('Libra');
  });

  it('moves the Moon ~12-14°/day and the phase angle accordingly', () => {
    const jd = julianDay(new Date('2026-07-01T00:00:00Z'));
    let a = moonLongitude(jd + 1) - moonLongitude(jd);
    if (a < 0) a += 360;
    expect(a).toBeGreaterThan(10);
    expect(a).toBeLessThan(16);
    const p1 = moonPhaseAngle(jd), p2 = moonPhaseAngle(jd + 1);
    let dp = p2 - p1; if (dp < 0) dp += 360;
    expect(dp).toBeGreaterThan(9);
    expect(dp).toBeLessThan(15);
  });

  it('detects classical aspects with orbs and rejects non-aspects', () => {
    expect(aspectBetween(10, 130)?.type).toBe('trine');
    expect(aspectBetween(10, 101)?.type).toBe('square');
    expect(aspectBetween(355, 0)?.type).toBe('conjunction'); // wraps across 0°
    expect(aspectBetween(0, 40)).toBeNull();
  });

  it('computes a full natal chart with ascendant when time+place are known', () => {
    const chart = natalChart(new Date('1990-03-15T00:00:00Z'), '06:30', 'Asia/Kolkata', 19.08, 72.88);
    expect(chart.sun.sign).toBe('Pisces');
    expect(chart.planets).toHaveLength(7);
    expect(chart.ascendant).not.toBeNull();
    expect(chart.ascendant!.lon).toBeGreaterThanOrEqual(0);
    expect(chart.ascendant!.lon).toBeLessThan(360);
    // No birth time → no ascendant claimed
    const noTime = natalChart(new Date('1990-03-15T00:00:00Z'), null, 'Asia/Kolkata', 19.08, 72.88);
    expect(noTime.ascendant).toBeNull();
  });

  it('scans a month into real lunations and chart-specific dates', () => {
    const chart = natalChart(new Date('1992-11-20T00:00:00Z'), '14:15', 'Asia/Kolkata', 28.61, 77.21);
    const m = scanMonth(chart, 2026, 7);
    const lunations = m.events.filter((e) => e.kind === 'lunation');
    expect(lunations.length).toBeGreaterThanOrEqual(1); // every month has ≥1 new or full moon
    expect(lunations.length).toBeLessThanOrEqual(3);
    for (const d of [...m.bestDates, ...m.cautionDates]) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(31);
    }
    expect(m.transits).toHaveLength(7);
  });

  it('resolves time zones and approximate coordinates', () => {
    expect(tzOffsetMinutes('Asia/Kolkata', new Date('2026-07-22T00:00:00Z'))).toBe(330);
    const mum = geocodeApprox('Mumbai', 'Maharashtra', 'India', 'Asia/Kolkata');
    expect(mum.lat).toBeCloseTo(19.08, 1);
    const unknown = geocodeApprox('Smallville', null, 'India', 'Asia/Kolkata');
    expect(unknown.lng).toBeCloseTo(82.5, 0); // 5.5h × 15°
  });

  it('positionsAt returns every body inside the zodiac with retro flags', () => {
    const pos = positionsAt(julianDay(new Date('2026-07-22T12:00:00Z')));
    for (const p of pos) {
      expect(p.lon).toBeGreaterThanOrEqual(0);
      expect(p.lon).toBeLessThan(360);
      if (p.planet === 'Sun' || p.planet === 'Moon') expect(p.retrograde).toBe(false);
    }
  });
});
