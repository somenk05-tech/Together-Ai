import { MasterProfileService } from './master-profile.service';
import type { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Regression tests for profile completion.
 *
 * The bug: signup auto-seeds empty FoodPref/FitnessProfile/BeautyProfile rows,
 * and those tables carry column DEFAULTS (diet='everything', fitness
 * goal='general', level='beginner'). The old checks counted "row exists" and
 * those defaulted columns, so a brand-new account that had entered NOTHING
 * reported real progress — Fitness even read 100% complete.
 *
 * These tests lock in that completion reflects only user-entered data.
 */

/** A prisma double returning exactly what a freshly-registered user has. */
function prismaFor(rows: {
  food?: unknown; fitness?: unknown; beauty?: unknown; dating?: unknown; jobs?: unknown; user?: unknown;
  master?: Record<string, unknown>;
}): PrismaService {
  const one = (v: unknown) => ({ findUnique: async () => v ?? null });
  return {
    foodPref: one(rows.food),
    fitnessProfile: one(rows.fitness),
    beautyProfile: one(rows.beauty),
    datingProfile: one(rows.dating),
    jobProfile: one(rows.jobs),
    jobsProfile: one(rows.jobs),
    user: one(rows.user ?? {}),
    masterProfile: {
      findUnique: async () => rows.master ?? null,
      upsert: async () => rows.master ?? null,
      update: async () => rows.master ?? null,
    },
  } as unknown as PrismaService;
}

describe('MasterProfileService.completion', () => {
  /** Stub `get()` (the merged Master Profile) so we test the section checks. */
  function serviceWith(prisma: PrismaService, master: Record<string, unknown>) {
    const svc = new MasterProfileService(prisma);
    (svc as unknown as { get: (u: string) => Promise<unknown> }).get = async () => master;
    return svc;
  }

  it('reports a brand-new account as essentially empty (seeded rows + column defaults do not count)', async () => {
    // Exactly what AuthService.initializeAccount() leaves behind: empty rows
    // that still carry their schema defaults.
    const prisma = prismaFor({
      food: { diet: 'everything', goal: 'maintain', activity: 1.4, weightKg: null, heightCm: null, extras: null },
      fitness: { age: 35, sex: 'other', level: 'beginner', mode: 'mixed', goal: 'general', conditions: '', heightCm: null, weightKg: null },
      beauty: { extras: null },
      dating: null,
      jobs: { headline: '', skills: '', experienceYears: 0, seniority: 'junior' },
      user: { bio: null },
    });
    const svc = serviceWith(prisma, { name: 'New User' }); // only the signup name

    const c = await svc.completion('u1');

    expect(c.complete).toBe(false);
    // Only the signup-provided name counts → single digits, never "mostly done".
    expect(c.percent).toBeLessThan(15);

    const byKey = Object.fromEntries(c.sections.map((s) => [s.key, s]));
    // The headline regression: Fitness used to report 100% here.
    expect(byKey.fitness.done).toBe(0);
    expect(byKey.fitness.complete).toBe(false);
    expect(byKey.nutrition.done).toBe(0);
    expect(byKey.beauty.done).toBe(0);
    expect(byKey.dating.done).toBe(0);
    expect(byKey.jobs.done).toBe(0);
    // And it should be steering the user somewhere useful.
    expect(c.nextUp.length).toBeGreaterThan(0);
  });

  it('increases only when the user actually enters data', async () => {
    const prisma = prismaFor({
      food: { diet: 'everything', weightKg: 72, heightCm: 178, extras: JSON.stringify({ cuisines: ['Indian'] }) },
      fitness: { level: 'beginner', goal: 'general', heightCm: 178, weightKg: 72, conditions: 'hypertension' },
      beauty: { extras: JSON.stringify({ photos: ['a'], goals: ['glow'] }) },
      dating: null,
      jobs: { headline: 'Product Designer', skills: 'figma,ux' },
      user: { bio: 'Hello city.' },
    });
    const svc = serviceWith(prisma, { name: 'Real User', city: 'Mumbai' });

    const c = await svc.completion('u1');
    const byKey = Object.fromEntries(c.sections.map((s) => [s.key, s]));

    expect(byKey.nutrition.done).toBe(3);
    expect(byKey.fitness.done).toBe(3);
    expect(byKey.beauty.done).toBe(2);
    expect(byKey.jobs.done).toBe(2);
    expect(byKey.social.done).toBe(1);
    expect(c.percent).toBeGreaterThan(40);
  });

  it('keeps the response contract the frontend renders', async () => {
    const svc = serviceWith(prismaFor({}), { name: 'X' });
    const c = await svc.completion('u1');
    expect(typeof c.percent).toBe('number');
    expect(typeof c.complete).toBe('boolean');
    expect(Array.isArray(c.sections)).toBe(true);
    expect(Array.isArray(c.nextUp)).toBe(true);
    for (const s of c.sections) {
      expect(s).toEqual(expect.objectContaining({
        key: expect.any(String), label: expect.any(String), href: expect.any(String),
        done: expect.any(Number), total: expect.any(Number), percent: expect.any(Number), complete: expect.any(Boolean),
      }));
    }
  });
});
