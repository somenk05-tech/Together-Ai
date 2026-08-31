import { COORD_GRID_DEG, coarseCoords, distanceNote, searchDistanceKm, standCoords, type DXProfile } from './matching';
import { haversineKm } from '../shared/geo';
import { DatingService } from './dating.service';

/**
 * ── NOBODY CAN BE PLACED CLOSER THAN ABOUT FIVE KILOMETRES ──────────────────
 *
 * Fifth audit, 31 Aug, H2. The card said "About 47 km away", the number was
 * `haversineKm` rounded to the kilometre, and both ends of the measurement
 * were client-supplied: the target's browser point, stored exactly, and the
 * viewer's own, which is theirs to invent. Three saves from three invented
 * positions and three readings of the sentence is a trilateration to the
 * kilometre; the distance deal-breaker gave the same reading as a 200/404.
 *
 * Owner decision the same day: a ~5 km grid at both ends, and a band on the
 * card instead of a number. This file holds all three parts — the snap, the
 * read-through, and the sentence — and checks the thing the grid is FOR: that
 * moving the viewer around does not move the answer by less than a cell.
 */

// Somebody standing at a specific doorstep in Bandra.
const TARGET_EXACT = { lat: 19.0596, lng: 72.8295 };

describe('nobody can be placed closer than about five kilometres', () => {
  it('snaps a coordinate to the 0.05° grid, to two decimals', () => {
    expect(coarseCoords(19.0596, 72.8295)).toEqual({ lat: 19.05, lng: 72.85 });
    expect(coarseCoords(28.6139, 77.2090)).toEqual({ lat: 28.6, lng: 77.2 });
    expect(coarseCoords(-33.8688, 151.2093)).toEqual({ lat: -33.85, lng: 151.2 });
    expect(COORD_GRID_DEG).toBe(0.05);
  });

  it('a cell is about five and a half kilometres tall', () => {
    const km = haversineKm({ lat: 19.0, lng: 72.85 }, { lat: 19.0 + COORD_GRID_DEG, lng: 72.85 });
    expect(km).toBeGreaterThanOrEqual(5);
    expect(km).toBeLessThanOrEqual(6);
  });

  it('reads a stored exact point through the grid, so old rows are as coarse as new ones', () => {
    const d: DXProfile = { searchLat: TARGET_EXACT.lat, searchLng: TARGET_EXACT.lng };
    expect(standCoords(d)).toEqual(coarseCoords(TARGET_EXACT.lat, TARGET_EXACT.lng));
    expect(standCoords(d)).not.toEqual(TARGET_EXACT);
  });

  it('every viewer position inside one cell measures the same distance to the target', () => {
    // The trilateration: the attacker moves their own point around and reads
    // the distance. Inside a cell the reading cannot change, because both
    // points collapse to nodes before anything is measured.
    const target: DXProfile = { searchLat: TARGET_EXACT.lat, searchLng: TARGET_EXACT.lng };
    const readings = new Set<number | null>();
    for (const dLat of [-0.02, -0.01, 0, 0.01, 0.02]) {
      for (const dLng of [-0.02, -0.01, 0, 0.01, 0.02]) {
        readings.add(searchDistanceKm({ searchLat: 19.55 + dLat, searchLng: 72.85 + dLng }, target));
      }
    }
    expect(readings.size).toBe(1);
  });

  it('prints a band and never a number', () => {
    const me: DXProfile = { searchLat: 19.05, searchLng: 72.85 };
    const at = (km: number): DXProfile => ({ searchLat: 19.05 + km / 111.2, searchLng: 72.85 });
    expect(distanceNote(me, at(10))).toBe('In your city.');
    expect(distanceNote(me, at(40))).toBe('Within 50 km.');
    expect(distanceNote(me, at(120))).toBe('50–150 km away — an easy day out.');
    expect(distanceNote(me, at(240))).toBe('150–400 km away — a weekend.');
    expect(distanceNote(me, at(1150))).toBe('400–1,500 km away — a flight.');
    expect(distanceNote(me, at(4000))).toBe('Over 1,500 km away.');
    // 47 km is the reading the audit's attacker took. Nothing prints it.
    for (const km of [10, 40, 47, 120, 240, 1150, 4000]) {
      const note = distanceNote(me, at(km)) ?? '';
      expect(note).not.toMatch(/About \d/);
      expect(note).not.toContain('47');
    }
  });

  it('still says nothing when nobody can be placed', () => {
    expect(distanceNote({}, { searchLat: 19.05, searchLng: 72.85 })).toBeNull();
  });
});

describe('the exact point is never stored', () => {
  function saving() {
    const prisma = {
      datingProfile: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async (a: { create: Record<string, unknown> }) => ({ userId: 'u1', ...a.create, moderationJson: null })),
        update: jest.fn(async () => ({})),
      },
      moderationLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    };
    const svc = new DatingService(
      prisma as never, { syncShared: async () => undefined } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { statusOf: async () => ({}), fileAndReview: async () => undefined } as never,
      { track: () => undefined } as never, {} as never, { up: false } as never,
      { add: async () => true, handle: () => undefined, schedule: async () => false } as never,
    );
    const s = svc as unknown as Record<string, unknown>;
    s.moderateProfile = async () => ({ decision: 'approved', confidence: 1, score: 0, checks: [], reasons: [], decidedAt: '' });
    s.bumpListVersion = async () => undefined;
    s.photoUrlsAligned = async () => [];
    s.queueReindex = () => undefined;
    return { svc, prisma };
  }
  const dto = (extras: Record<string, unknown>) => ({
    gender: 'female' as const, seeking: 'any' as const, bio: 'A perfectly ordinary bio about hills and books.',
    birthDate: '1995-06-15', interests: ['Hills', 'Books', 'Tea'],
    extras: JSON.stringify({ sensitiveConsentAt: '2026-08-01T00:00:00Z', photos: [], ...extras }),
  });
  const stored = (prisma: { datingProfile: { upsert: jest.Mock } }) =>
    JSON.parse(prisma.datingProfile.upsert.mock.calls[0][0].create.extras as string) as Record<string, unknown>;

  it('snaps the browser point on write', async () => {
    const { svc, prisma } = saving();
    await svc.upsertProfile('u1', dto({ searchLat: TARGET_EXACT.lat, searchLng: TARGET_EXACT.lng }));
    expect(stored(prisma)).toMatchObject({ searchLat: 19.05, searchLng: 72.85 });
  });

  it('drops a point that is not a finite pair on Earth', async () => {
    for (const bad of [{ searchLat: 'x', searchLng: 1 }, { searchLat: 91, searchLng: 0 }, { searchLat: 1, searchLng: Infinity }, { searchLat: 19 }]) {
      const { svc, prisma } = saving();
      await svc.upsertProfile('u1', dto(bad));
      expect(stored(prisma)).not.toHaveProperty('searchLat');
      expect(stored(prisma)).not.toHaveProperty('searchLng');
    }
  });

  it('leaves a profile with no point alone', async () => {
    const { svc, prisma } = saving();
    await svc.upsertProfile('u1', dto({ city: 'Pune' }));
    expect(stored(prisma)).toMatchObject({ city: 'Pune' });
    expect(stored(prisma)).not.toHaveProperty('searchLat');
  });
});
