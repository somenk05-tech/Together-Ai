import { boundingBox, haversineKm, parsePoint, humanDistance } from './geo';

/**
 * THE BOX AND THE CIRCLE.
 *
 * The whole reason these are two functions is performance, and performance bugs
 * do not announce themselves — a "near me" that quietly reads the whole table
 * works perfectly at ten listings and falls over at ten thousand. So the
 * properties that make the split correct are pinned here:
 *
 *  · the box must CONTAIN the circle, or a real result is dropped before the
 *    trim ever sees it — that is a silent wrong answer, the worst kind;
 *  · the box must be wider in longitude than in latitude away from the equator,
 *    because a degree of longitude shrinks towards the poles. Getting this wrong
 *    is invisible in Bengaluru and badly wrong in London.
 */
describe('distance', () => {
  const BLR = { lat: 12.9716, lng: 77.5946 }; // Bengaluru
  const MUM = { lat: 19.0760, lng: 72.8777 }; // Mumbai

  it('measures a real distance between two real cities', () => {
    const km = haversineKm(BLR.lat, BLR.lng, MUM.lat, MUM.lng);
    // ~845 km great-circle. A generous band: this is checking the formula is
    // the right formula, not that the constant is to four places.
    expect(km).toBeGreaterThan(820);
    expect(km).toBeLessThan(870);
  });

  it('is zero to itself and symmetric', () => {
    expect(haversineKm(BLR.lat, BLR.lng, BLR.lat, BLR.lng)).toBeCloseTo(0, 6);
    expect(haversineKm(BLR.lat, BLR.lng, MUM.lat, MUM.lng))
      .toBeCloseTo(haversineKm(MUM.lat, MUM.lng, BLR.lat, BLR.lng), 6);
  });
});

describe('the bounding box contains the circle', () => {
  it('never cuts a point that is genuinely within the radius', () => {
    const lat = 12.9716, lng = 77.5946, km = 5;
    const b = boundingBox(lat, lng, km);
    // Walk the circle and check every point on it is inside the box. If the box
    // clipped the circle anywhere, a business exactly that far away would be
    // filtered out by SQL before the exact trim could keep it.
    for (let deg = 0; deg < 360; deg += 5) {
      const t = (deg * Math.PI) / 180;
      const pLat = lat + (km / 111.32) * Math.cos(t);
      const pLng = lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(t);
      expect(pLat).toBeGreaterThanOrEqual(b.minLat - 1e-9);
      expect(pLat).toBeLessThanOrEqual(b.maxLat + 1e-9);
      expect(pLng).toBeGreaterThanOrEqual(b.minLng - 1e-9);
      expect(pLng).toBeLessThanOrEqual(b.maxLng + 1e-9);
    }
  });

  it('widens in longitude away from the equator', () => {
    const equator = boundingBox(0, 0, 10);
    const london = boundingBox(51.5, 0, 10);
    const eqWidth = equator.maxLng - equator.minLng;
    const ldWidth = london.maxLng - london.minLng;
    expect(ldWidth).toBeGreaterThan(eqWidth * 1.5);
    // Latitude does not care where you are.
    expect(london.maxLat - london.minLat).toBeCloseTo(equator.maxLat - equator.minLat, 9);
  });

  it('does not explode at the pole', () => {
    const b = boundingBox(89.999, 0, 10);
    expect(Number.isFinite(b.minLng)).toBe(true);
    expect(Number.isFinite(b.maxLng)).toBe(true);
  });
});

describe('reading a point off a query string', () => {
  it('takes a well-formed pair', () => {
    expect(parsePoint('12.9716,77.5946')).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(parsePoint(' 12.9716 , 77.5946 ')).toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it('returns null rather than throwing on anything else', () => {
    // A malformed parameter is a filter that does not apply. It is not a 500,
    // and it is certainly not NaN reaching a WHERE clause.
    for (const bad of ['', 'here', '12.9716', 'a,b', '91,0', '0,181', undefined]) {
      expect(parsePoint(bad)).toBeNull();
    }
  });
});

describe('saying a distance the way a person would', () => {
  it('uses metres below a kilometre and rounds to ten', () => {
    expect(humanDistance(0.24)).toBe('240 m');
    expect(humanDistance(0.303)).toBe('300 m');
  });
  it('uses one decimal up to ten kilometres, then whole ones', () => {
    expect(humanDistance(1.84)).toBe('1.8 km');
    expect(humanDistance(12.4)).toBe('12 km');
  });
});
