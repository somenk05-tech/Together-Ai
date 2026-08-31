import { shapeExtras, shownText } from './extras-shape';
import { DatingService } from './dating.service';
import { effectiveDealBreakers, languageBarrier, canonicalGoal, factorScores, confidenceFor, type DXProfile } from './matching';

/**
 * ── ONE ROW CANNOT TAKE THE ROOM DOWN (fifth audit, 31 Aug, H6) ─────────────
 *
 * `extras` was a free JSON blob and the engine trusted every type in it. One
 * saved profile with `"languages": "Hindi"` — a string where a list was read —
 * threw inside the scoring loop for every viewer whose pool contained it: a
 * 500 on Browse and Curated Matches, city-wide, from one row, with a clean bio
 * that moderation had passed. And only `bio` was scanned, so a handle in the
 * dating name or a phone number in `profession` reached every card.
 *
 * Two parts, both held here: the save shapes the blob to the keys this hub
 * reads at their types and lengths, and moderation scans every field a
 * stranger is shown. The first half is proven the way the audit found it —
 * by handing the engine the exact wrong-typed values through the shape and
 * watching it not throw.
 */

/** The blob the audit's attacker saved. */
const HOSTILE: Record<string, unknown> = {
  languages: 'Hindi',
  dealBreakers: 1,
  relationshipGoal: 5,
  city: 400001,
  personalityTraits: 'kind',
  values: { a: 1 },
  wantsChildren: 3,
  prefDiet: ['x'],
  diet: null,
  prefAgeMin: 'twenty',
  heightCm: Infinity,
  partnerLocationMode: 'everywhere',
  photos: 'https://evil.example/x.jpg',
  seekingList: [1, 'male', null],
  padding: 'x'.repeat(1_000_000),
  firstName: '  priya   sharma  ',
};

describe('one row cannot take the room down', () => {
  it('drops every wrong-typed value and every unknown key', () => {
    const s = shapeExtras(HOSTILE);
    for (const k of ['languages', 'dealBreakers', 'relationshipGoal', 'city', 'personalityTraits', 'values', 'wantsChildren', 'prefDiet', 'diet', 'prefAgeMin', 'heightCm', 'partnerLocationMode', 'padding']) {
      expect(s).not.toHaveProperty(k);
    }
    // A list with junk in it keeps only its strings.
    expect(s.seekingList).toEqual(['male']);
    // A string photo entry is not an array of photos.
    expect(s).not.toHaveProperty('photos');
    // And the shaped blob is small whatever came in.
    expect(JSON.stringify(s).length).toBeLessThan(200);
  });

  it('the engine survives the shaped blob where it threw on the raw one', () => {
    const raw = HOSTILE as unknown as DXProfile;
    // The audit's four TypeErrors, on the raw blob:
    expect(() => effectiveDealBreakers(raw)).toThrow();
    expect(() => languageBarrier({ languages: ['hindi'] }, raw)).toThrow();
    expect(() => canonicalGoal(raw.relationshipGoal)).toThrow();
    // And none of them on what the save now stores:
    const shaped = shapeExtras(HOSTILE) as DXProfile;
    expect(() => effectiveDealBreakers(shaped)).not.toThrow();
    expect(() => languageBarrier({ languages: ['hindi'] }, shaped)).not.toThrow();
    expect(() => canonicalGoal(shaped.relationshipGoal)).not.toThrow();
    const me: DXProfile = { languages: ['hindi'], personalityTraits: ['kind'], values: ['family'], city: 'Pune' };
    expect(() => factorScores(80, ['tea'], ['tea'], me, shaped)).not.toThrow();
    expect(() => confidenceFor(me, shaped, ['tea'], ['tea'])).not.toThrow();
  });

  it('keeps a well-formed blob whole, tidied', () => {
    const s = shapeExtras({
      firstName: '  priya   sharma  ', city: 'Pune', languages: ['Hindi', 'English'], dealBreakers: ['Smoking'],
      prefAgeMin: 25, prefAgeMax: null, heightCm: 165, partnerLocationMode: 'any',
      photos: ['dating/u1/a.jpg', 'dating/u1/b.jpg'], relationshipGoal: 'Long-term', religion: 'Hindu',
      sensitiveConsentAt: '2026-08-01T00:00:00Z', visibility: 'everyone', searchLat: 19.05, searchLng: 72.85,
      selfieKey: 'dating/u1/selfie.jpg', selfieAt: '2026-08-02T00:00:00Z',
    });
    expect(s).toEqual({
      firstName: 'priya sharma', city: 'Pune', languages: ['Hindi', 'English'], dealBreakers: ['Smoking'],
      prefAgeMin: 25, prefAgeMax: null, heightCm: 165, partnerLocationMode: 'any',
      photos: ['dating/u1/a.jpg', 'dating/u1/b.jpg'], relationshipGoal: 'Long-term', religion: 'Hindu',
      sensitiveConsentAt: '2026-08-01T00:00:00Z', visibility: 'everyone', searchLat: 19.05, searchLng: 72.85,
      selfieKey: 'dating/u1/selfie.jpg', selfieAt: '2026-08-02T00:00:00Z',
    });
  });

  it('caps what a stranger can be shown', () => {
    const s = shapeExtras({ firstName: 'a'.repeat(200), profession: 'b'.repeat(500), languages: Array.from({ length: 50 }, (_, i) => `l${i}`) });
    expect((s.firstName as string).length).toBe(40);
    expect((s.profession as string).length).toBe(120);
    expect((s.languages as string[]).length).toBe(20);
  });

  it('a handle in the dating name, or a phone number in the profession, is a rejection', async () => {
    const prisma = {
      user: { findUnique: async () => ({ createdAt: new Date('2026-01-01T00:00:00Z') }) },
      moderationLog: { count: async () => 0 },
    };
    const svc = new DatingService(
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, { track: () => undefined } as never, {} as never, { up: false } as never,
      { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
    ) as unknown as { moderateProfile(u: string, d: unknown): Promise<{ decision: string; checks: Array<{ name: string; pass: boolean }> }>; aiBioModeration: unknown };
    svc.aiBioModeration = async () => ({ flagged: false, confidence: 1 });
    const dto = (extras: Record<string, unknown>, interests: string[] = ['Hills', 'Books', 'Tea']) => ({
      gender: 'female', seeking: 'any', bio: 'A perfectly ordinary bio about hills and books.',
      birthDate: '1995-06-15', interests, extras: JSON.stringify({ photos: ['dating/u1/a.jpg'], ...extras }),
    });
    const failed = (r: { checks: Array<{ name: string; pass: boolean }> }) => r.checks.filter((c) => !c.pass).map((c) => c.name);

    const name = await svc.moderateProfile('u1', dto({ firstName: 'Priya @priya_x' }));
    expect(name.decision).toBe('rejected');
    expect(failed(name)).toContain('fields-no-contact');

    const work = await svc.moderateProfile('u1', dto({ profession: 'call me 98765 43210' }));
    expect(work.decision).toBe('rejected');

    const interest = await svc.moderateProfile('u1', dto({}, ['Hills', 'Books', 'insta: priya_x']));
    expect(interest.decision).toBe('rejected');

    const fine = await svc.moderateProfile('u1', dto({ firstName: 'Priya', profession: 'Product designer', city: 'Pune', languages: ['Hindi', 'English'] }));
    expect(failed(fine)).toEqual([]);
    expect(fine.decision).toBe('approved');
  });

  it('names every field a stranger is shown, so all of them get scanned', () => {
    const fields = shownText({
      firstName: 'Priya @priya_x', profession: 'call 98765 43210', education: 'IIT', city: 'Pune',
      personalityTraits: ['kind'], values: ['family'], languages: ['Hindi'], bio: 'not here', photos: ['k'],
    });
    expect(fields).toEqual(['Priya @priya_x', 'call 98765 43210', 'IIT', 'Pune', 'kind', 'family', 'Hindi']);
  });
});
