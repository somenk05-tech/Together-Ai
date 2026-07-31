import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { clinicalSex, datingGender, displayGender, genderIdentityFromBeauty } from './sex-and-gender';
import { salutation } from '../shared/salutation';
import { canonicaliseDeclared } from '../shared/allergens';
import { diffProfile, versionConflict } from './profile-change';
import { answeredNow } from '../shared/prisma/answered-at';
import { PrismaService } from '../shared/prisma/prisma.service';
import { optimalHealthGate, type OptimalHealthGate } from './health-gate';
import { computeHealthScore, type HealthScoreResult } from './health-score';

/**
 * Master Profile — the single source of truth for shared user information.
 *
 * Principle (spec): every hub is a specialized VIEW of one Master Profile.
 * Hubs read from it to auto-populate, and any shared field they save flows
 * back through `syncShared()`, which (1) updates the canonical row and
 * (2) propagates the value into the hub tables that historically duplicated
 * it (astrology, dating, nutrition, fitness) — so existing engines keep
 * working unchanged while the copies can never diverge again.
 *
 * Consolidation is self-healing: `get()` back-fills the canonical row from
 * whatever hub data already exists, so long-time users see a complete Master
 * Profile the first time they open it, without re-entering anything.
 */

export interface SharedFields {
  gender?: string | null;
  sexAtBirth?: string | null;
  genderIdentity?: string | null;
  genderIdentityOther?: string | null;
  dateOfBirth?: Date | null;
  timeOfBirth?: string | null;
  birthCountry?: string | null;
  birthState?: string | null;
  birthCity?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  timeZone?: string | null;
  languages?: string | null;   // csv
  heightCm?: number | null;
  weightKg?: number | null;
  occupation?: string | null;
  phone?: string | null;
  address?: string | null;
  /** Declared food allergens, csv. Written by Nutrition; read by hubs that
   *  never ask. See the schema comment for why it is words and not keys. */
  foodAllergens?: string | null;
}

const SHARED_KEYS: Array<keyof SharedFields> = [
  'gender', 'sexAtBirth', 'genderIdentity', 'genderIdentityOther',
  'dateOfBirth', 'timeOfBirth', 'birthCountry', 'birthState', 'birthCity',
  'country', 'state', 'city', 'timeZone', 'languages', 'heightCm', 'weightKg', 'occupation', 'phone', 'address',
  'foodAllergens',
];

export const computeAge = (dob: Date | null | undefined): number | null => {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
};

/** Merge master row over per-hub sources (master wins; sources fill gaps).
 *  Pure — unit-tested. Order of `sources` = precedence (earlier wins). */
export function mergeShared(master: Partial<SharedFields>, ...sources: Array<Partial<SharedFields>>): SharedFields {
  const out: SharedFields = {};
  for (const key of SHARED_KEYS) {
    const mv = master[key];
    if (mv !== undefined && mv !== null && mv !== '') { (out as Record<string, unknown>)[key] = mv; continue; }
    for (const s of sources) {
      const sv = s[key];
      if (sv !== undefined && sv !== null && sv !== '') { (out as Record<string, unknown>)[key] = sv; break; }
    }
  }
  return out;
}

/** What a shared-field change means for each duplicating hub table.
 *  Pure — unit-tested. Only defined fields appear in each plan. */
export function propagationPlan(shared: SharedFields): {
  astro: Record<string, unknown>; dating: Record<string, unknown>;
  food: Record<string, unknown>; fitness: Record<string, unknown>;
} {
  const def = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  // Clinical consumers get sexAtBirth; social consumers get genderIdentity.
  // This line used to be `gender === 'male' || 'female' ? gender : undefined`,
  // which silently dropped a non-binary citizen's answer on the way to the two
  // engines that compute their calories. clinicalSex() makes the same refusal
  // where a formula needs a coefficient it does not have — but the citizen can
  // now answer the clinical question separately and stop being refused.
  const sexBinary = clinicalSex(shared);
  // Dating stores 'nonbinary'; the identity vocabulary says 'nonBinary'. This
  // line used to hand the raw identity over, and the six `seeking === gender`
  // comparisons in dating.service.ts are exact — one capital letter removed a
  // non-binary citizen from everybody's results and everybody from theirs.
  // datingGender() is the only crossing point between the two vocabularies.
  const social = datingGender(shared);
  const age = shared.dateOfBirth !== undefined ? computeAge(shared.dateOfBirth) ?? undefined : undefined;
  const birthPlace = [shared.birthCity, shared.birthState, shared.birthCountry].filter(Boolean).join(', ') || undefined;
  return {
    astro: def({
      birthDate: shared.dateOfBirth ?? undefined, birthTime: shared.timeOfBirth,
      birthCountry: shared.birthCountry ?? undefined, birthState: shared.birthState,
      birthCity: shared.birthCity ?? undefined, timeZone: shared.timeZone ?? undefined,
    }),
    dating: def({
      // Dating is a social surface: identity, never the clinical answer.
      gender: social, birthDate: shared.dateOfBirth ?? undefined,
      birthTime: shared.timeOfBirth, birthPlace,
    }),
    food: def({ heightCm: shared.heightCm, weightKg: shared.weightKg, sex: sexBinary, age }),
    fitness: def({ heightCm: shared.heightCm, weightKg: shared.weightKg, sex: sexBinary, age }),
  };
}

interface MasterRow extends SharedFields { id: string; userId: string; updatedAt: Date }

@Injectable()
export class MasterProfileService {
  private readonly logger = new Logger('MasterProfile');
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A wellness summary from what the citizen has actually recorded.
   *
   * Gathers the measurements from wherever they already live — body from the
   * fitness or food profile or the master record, movement from the workout log,
   * markers from the latest blood analysis — and hands them to a pure scorer.
   * Reads the tables directly rather than depending on the fitness, nutrition and
   * medical modules, all three of which would otherwise have to be imported here.
   *
   * Anything absent stays absent. The scorer drops a missing component from the
   * average instead of counting a zero into it, which is the whole point.
   */
  async healthScore(userId: string): Promise<HealthScoreResult & { optimalHealth: OptimalHealthGate }> {
    const db = this.prisma as unknown as {
      fitnessProfile: { findUnique(a: unknown): Promise<{ heightCm: number | null; weightKg: number | null } | null> };
      foodPref: { findUnique(a: unknown): Promise<{ heightCm: number | null; weightKg: number | null } | null> };
      workoutLog: { findMany(a: unknown): Promise<Array<{ minutes: number }>> };
      bloodAnalysis: { findFirst(a: unknown): Promise<{ payload: string } | null> };
    };

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [fitness, food, master, workouts, analysis] = await Promise.all([
      db.fitnessProfile.findUnique({ where: { userId } }).catch(() => null),
      db.foodPref.findUnique({ where: { userId } }).catch(() => null),
      this.master.findUnique({ where: { userId } }).catch(() => null),
      db.workoutLog.findMany({ where: { userId, doneAt: { gte: since } }, select: { minutes: true }, take: 500 }).catch(() => []),
      db.bloodAnalysis.findFirst({ where: { userId }, orderBy: { analyzedAt: 'desc' } }).catch(() => null),
    ]);

    // First source that actually has the measurement wins.
    const heightCm = fitness?.heightCm ?? food?.heightCm ?? (master as { heightCm?: number | null } | null)?.heightCm ?? null;
    const weightKg = fitness?.weightKg ?? food?.weightKg ?? (master as { weightKg?: number | null } | null)?.weightKg ?? null;

    // A citizen who has never logged a workout has no movement data — which is
    // different from having logged zero minutes, so it stays null rather than 0.
    const hasWorkoutHistory = workouts.length > 0;

    const result = computeHealthScore({
      heightCm,
      weightKg,
      workoutsLast30: hasWorkoutHistory ? workouts.length : null,
      workoutMinutesLast30: hasWorkoutHistory ? workouts.reduce((n, w) => n + (w.minutes || 0), 0) : null,
      markersInRange: markerShare(analysis?.payload),
    });
    // Whether to offer the Optimal Health plan travels WITH the score, so the
    // client never has to know the threshold (FE-8.1). A number that decides
    // whether somebody is shown clinical guidance does not belong in a
    // component.
    return { ...result, optimalHealth: optimalHealthGate(result) };
  }

  /** New table reaches the generated client on deploy (db push at boot). */
  private get master() {
    return (this.prisma as unknown as {
      masterProfile: {
        findUnique: (a: unknown) => Promise<MasterRow | null>;
        upsert: (a: unknown) => Promise<MasterRow>;
      };
    }).masterProfile;
  }

  /** The canonical merged view — auto-populated from every hub the user has
   *  already touched, then persisted so it only gets more complete. */
  async get(userId: string) {
    const astroDb = (this.prisma as unknown as {
      astroProfile: { findUnique: (a: unknown) => Promise<Record<string, unknown> | null> };
    }).astroProfile;
    const beautyDb = (this.prisma as unknown as {
      beautyProfile: { findUnique: (a: unknown) => Promise<{ extras?: string | null } | null> };
    }).beautyProfile;
    const [row, user, astro, dating, food, fitness, beauty] = await Promise.all([
      this.master.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.user.findUnique({ where: { id: userId } }),
      astroDb.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.datingProfile.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.fitnessProfile.findUnique({ where: { userId } }).catch(() => null),
      beautyDb.findUnique({ where: { userId } }).catch(() => null),
    ]);
    // Beauty stores its Basic Profile (age/gender/height/weight/city/occupation)
    // inside an extras JSON blob — parse it so those fields count as a source.
    let beautyEx: { age?: number; gender?: string; heightCm?: number; weightKg?: number; city?: string; occupation?: string } = {};
    try { beautyEx = beauty?.extras ? JSON.parse(beauty.extras) : {}; } catch { beautyEx = {}; }
    // Nutrition keeps the declared allergens inside its own extras blob. Parsing
    // it here makes them a SOURCE, which is what back-fills foodAllergens for
    // every citizen who declared one before the column existed — the same
    // self-healing path every other shared field arrived by, rather than an SQL
    // cast in the migration over a text column that may not hold valid JSON.
    let foodEx: { allergies?: string } = {};
    try {
      const raw = (food as { extras?: string | null } | null)?.extras;
      foodEx = raw ? JSON.parse(raw) : {};
    } catch { foodEx = {}; }
    const declaredFood = canonicaliseDeclared(String(foodEx.allergies ?? '').split(/[,;]/)).join(',') || undefined;

    const astroRow = astro as { birthDate?: Date; birthTime?: string | null; birthCountry?: string; birthState?: string | null; birthCity?: string; timeZone?: string } | null;
    const place = ((dating?.birthPlace as string | undefined) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const merged = mergeShared(
      (row ?? {}) as Partial<SharedFields>,
      // Precedence below the master row: astrology (richest birth data) →
      // dating → nutrition → fitness.
      astroRow ? {
        dateOfBirth: astroRow.birthDate, timeOfBirth: astroRow.birthTime,
        birthCountry: astroRow.birthCountry, birthState: astroRow.birthState,
        birthCity: astroRow.birthCity, timeZone: astroRow.timeZone,
        country: astroRow.birthCountry, state: astroRow.birthState, city: astroRow.birthCity,
      } : {},
      dating ? {
        genderIdentity: dating.gender, dateOfBirth: dating.birthDate, timeOfBirth: dating.birthTime,
        birthCity: place[0], birthState: place.length > 2 ? place[1] : undefined,
        birthCountry: place.length > 1 ? place[place.length - 1] : undefined,
      } : {},
      food ? { heightCm: food.heightCm, weightKg: food.weightKg, sexAtBirth: food.sex, foodAllergens: declaredFood } : {},
      fitness ? { heightCm: fitness.heightCm, weightKg: fitness.weightKg, sexAtBirth: fitness.sex === 'other' ? undefined : fitness.sex } : {},
      // Beauty stores its label capitalised ('Female'). Merging it raw put that
      // into a column whose readers compare lowercase, so the backfill was
      // writing a value clinicalSex() could never read — the same bug as the
      // sync, arriving by the other door.
      { heightCm: beautyEx.heightCm, weightKg: beautyEx.weightKg, genderIdentity: genderIdentityFromBeauty(beautyEx.gender), city: beautyEx.city, occupation: beautyEx.occupation },
    );

    // Self-healing consolidation: persist anything the sources knew that the
    // canonical row didn't (write-once; master stays authoritative afterwards).
    const gaps = Object.fromEntries(
      SHARED_KEYS.filter((k) => (row?.[k] === undefined || row?.[k] === null) && merged[k] !== undefined)
        .map((k) => [k, merged[k]]),
    );
    if (Object.keys(gaps).length) {
      await this.master.upsert({
        where: { userId }, update: gaps, create: { userId, ...gaps },
      }).catch(() => undefined);
    }

    // Age: prefer the precise value from date-of-birth, but fall back to the raw
    // age stored by hubs that never collect a DOB (Nutrition / Fitness) — so a
    // user who only filled Nutrition still gets their age everywhere.
    const rawFoodAge = (food as { age?: number | null } | null)?.age;
    // FitnessProfile.age is NOT NULL with a default of 35, written by
    // registration before anybody was asked anything — so reading it
    // unconditionally reported every brand-new citizen as 35 years old. That is
    // review p7 ("section shows fake age/sex") arriving through the back door,
    // in the one place whose job is to be the single source of truth.
    //
    // FoodPref.age is nullable and needs no such guard; absent means absent.
    const fitnessRow = fitness as { age?: number | null; answeredAt?: Date | null } | null;
    const rawFitAge = fitnessRow?.answeredAt ? fitnessRow.age : undefined;
    const age = computeAge(merged.dateOfBirth ?? null)
      ?? (typeof rawFoodAge === 'number' ? rawFoodAge : null)
      ?? (typeof rawFitAge === 'number' ? rawFitAge : null)
      ?? (typeof beautyEx.age === 'number' ? beautyEx.age : null);

    return {
      name: user?.name ?? '',
      email: user?.email ?? '',
      photo: (user as { profileImage?: string | null } | null)?.profileImage ?? null,
      ...merged,
      age,
      // The two answers already resolved, so no screen has to work them out.
      //
      // Four frontends were each doing their own version of this against the
      // retired `gender` column — nutrition for a CLINICAL value that sets
      // calorie targets, astrology and beauty and fitness for a social one. Four
      // copies of a rule that had already changed once under them.
      //
      // A page reads a field now. `resolvedSex` is null for intersex,
      // preferNotToSay and unanswered alike, because none of those is a
      // coefficient, and the caller is expected to say so rather than assume.
      resolvedSex: clinicalSex(merged) ?? null,
      resolvedGender: displayGender(merged) ?? null,
      updatedAt: row?.updatedAt?.toISOString?.() ?? null,
    };
  }

  /**
   * The write path every hub uses for shared fields: update the canonical row,
   * then propagate into the hub tables that duplicate the field (only rows
   * that already exist — a hub's own profile is still created by that hub).
   */
  async syncShared(userId: string, patch: SharedFields, source: string, opts: { expectedVersion?: number | null; changedById?: string } = {}) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([k, v]) => SHARED_KEYS.includes(k as keyof SharedFields) && v !== undefined),
    ) as SharedFields;
    if (!Object.keys(clean).length) return { synced: false };

    // Read before writing, for two reasons: the audit trail needs the old
    // values, and a caller that stated which version it was editing needs to be
    // told if the profile moved underneath it.
    const before = await this.master.findUnique({ where: { userId } }).catch(() => null);
    const current = (before as { version?: number } | null)?.version ?? 0;
    if (versionConflict(current, opts.expectedVersion)) {
      throw new ConflictException(
        'This profile was changed somewhere else while you were editing. Reload and try again.',
      );
    }

    const changes = diffProfile(before as Record<string, unknown> | null, clean as Record<string, unknown>);

    await this.master.upsert({
      where: { userId },
      // The version moves only when something actually changed. A save that
      // re-sends what is already there should not invalidate somebody else's
      // in-flight edit.
      update: { ...clean, ...(changes.length ? { version: current + 1 } : {}) },
      create: { userId, ...clean },
    }).catch((e: Error) => this.logger.warn(`master upsert failed (${source}): ${e.message}`));

    // Health data: height, weight, sex at birth, date of birth. The record of
    // what it used to be is part of what "who changed what, when" means, and
    // until now the only trace was a log line — which is not a record.
    if (changes.length) {
      await (this.prisma as unknown as {
        profileChange: { createMany: (a: unknown) => Promise<unknown> };
      }).profileChange.createMany({
        data: changes.map((c) => ({ ...c, userId, source, changedById: opts.changedById ?? userId })),
      }).catch((e: Error) => this.logger.warn(`profile change log failed (${source}): ${e.message}`));
    }

    const plan = propagationPlan(clean);
    const p = this.prisma as unknown as Record<string, { updateMany: (a: unknown) => Promise<unknown> }>;
    // updateMany({where:{userId}}) is a no-op when the hub row doesn't exist —
    // exactly the semantics we want (propagate, never create).
    await Promise.all([
      Object.keys(plan.astro).length ? p.astroProfile.updateMany({ where: { userId }, data: plan.astro }).catch(() => undefined) : null,
      Object.keys(plan.dating).length ? p.datingProfile.updateMany({ where: { userId }, data: plan.dating }).catch(() => undefined) : null,
      Object.keys(plan.food).length ? p.foodPref.updateMany({ where: { userId }, data: answeredNow(plan.food) }).catch(() => undefined) : null,
      Object.keys(plan.fitness).length ? p.fitnessProfile.updateMany({ where: { userId }, data: answeredNow(plan.fitness) }).catch(() => undefined) : null,
    ]);
    this.logger.log(`shared fields synced from ${source}: ${Object.keys(clean).join(', ')} (${changes.length} changed)`);
    return { synced: true, fields: Object.keys(clean), changed: changes.map((c) => c.field) };
  }

  /**
   * ONE platform-wide profile-completion score (spec: Progressive Profile
   * Completion). Aggregates the Master identity + every hub profile into a
   * single percentage, with a per-hub breakdown the Master Profile page renders
   * as "what's left to complete". Reads live each call, so it's always current
   * after any hub save (which syncs shared fields back here).
   */
  async completion(userId: string) {
    const m = await this.get(userId);
    const px = this.prisma as unknown as {
      foodPref: { findUnique(a: unknown): Promise<{ diet?: string | null; weightKg?: number | null; heightCm?: number | null; extras?: string | null } | null> };
      fitnessProfile: { findUnique(a: unknown): Promise<{ goal?: string | null; level?: string | null; heightCm?: number | null; weightKg?: number | null; conditions?: string | null } | null> };
      beautyProfile: { findUnique(a: unknown): Promise<{ extras?: string | null } | null> };
      datingProfile: { findUnique(a: unknown): Promise<{ bio?: string | null; interests?: string | null; extras?: string | null } | null> };
      jobProfile: { findUnique(a: unknown): Promise<{ headline?: string | null; skills?: string | null } | null> };
      user: { findUnique(a: unknown): Promise<{ bio?: string | null } | null> };
    };
    const [food, fitness, beauty, dating, jobs, user] = await Promise.all([
      px.foodPref.findUnique({ where: { userId } }).catch(() => null),
      px.fitnessProfile.findUnique({ where: { userId } }).catch(() => null),
      px.beautyProfile.findUnique({ where: { userId } }).catch(() => null),
      px.datingProfile.findUnique({ where: { userId } }).catch(() => null),
      px.jobProfile.findUnique({ where: { userId } }).catch(() => null),
      px.user.findUnique({ where: { id: userId } }).catch(() => null),
    ]);

    const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
    const json = (s: string | null | undefined): Record<string, unknown> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
    const datingEx = json(dating?.extras);
    const beautyEx = json(beauty?.extras);

    const section = (key: string, label: string, href: string, checks: boolean[]) => {
      const done = checks.filter(Boolean).length;
      return { key, label, href, done, total: checks.length, percent: Math.round((done / checks.length) * 100), complete: done === checks.length };
    };

    const sections = [
      section('identity', 'Identity', '/profile', [
        // displayGender(), not m.gender. The 20260730200000 split retired that
        // column — the Master Profile page writes sexAtBirth and genderIdentity
        // and never touches it — so this check could only ever pass for accounts
        // old enough to predate the split, or ones that had saved a Fitness or
        // Dating profile (both of which still wrote it back).
        //
        // Which means: a citizen who opened /profile, answered every question on
        // it correctly, and saved, was told their Identity section was 6 of 7
        // and always would be. The meter on the page graded them down for using
        // the page. §4 has just put that meter at the top of the dashboard, so
        // it is now the first thing they see.
        has(m.name), has(m.dateOfBirth), has(displayGender(m)), has(m.heightCm), has(m.city), has(m.languages), has(m.photo),
      ]),
      section('astrology', 'Astrology', '/profile/astrology', [
        has(m.dateOfBirth), has(m.timeOfBirth), has(m.birthCity ?? m.city),
      ]),
      // NOTE: hub rows (FoodPref/FitnessProfile/BeautyProfile) are auto-seeded
      // empty at signup AND carry column defaults (diet='everything',
      // fitness goal='general', level='beginner'). So "row exists" and those
      // defaulted columns are NOT evidence the user entered anything — counting
      // them made a brand-new account read as partly (Fitness: fully) complete.
      // Every check below is a field that only becomes set by real user input.
      section('nutrition', 'Nutrition', '/nutrition/preferences', [
        has(food?.weightKg), has(food?.heightCm), Object.keys(json(food?.extras)).length > 0,
      ]),
      section('fitness', 'Fitness', '/fitness/profile', [
        has(fitness?.heightCm), has(fitness?.weightKg), has(fitness?.conditions),
      ]),
      section('beauty', 'Beauty', '/beauty/profile', [
        arr(beautyEx.photos).length > 0, arr(beautyEx.goals).length > 0 || has(beautyEx.goal),
      ]),
      section('dating', 'Dating', '/dating/profile', [
        has(dating?.bio), (dating?.interests ?? '').split(',').filter(Boolean).length >= 3, arr(datingEx.photos).length >= 3,
      ]),
      section('jobs', 'Jobs', '/jobs/profile', [
        has(jobs?.headline), has(jobs?.skills),
      ]),
      section('social', 'Social', '/social/profile', [
        has(user?.bio),
      ]),
    ];

    const totalDone = sections.reduce((s, x) => s + x.done, 0);
    const totalChecks = sections.reduce((s, x) => s + x.total, 0);
    const percent = Math.round((totalDone / Math.max(1, totalChecks)) * 100);
    // Most impactful next steps: incomplete sections, least-complete first.
    const nextUp = sections.filter((s) => !s.complete).sort((a, b) => a.percent - b.percent).slice(0, 4).map((s) => ({ key: s.key, label: s.label, href: s.href }));

    // The dashboard's opening line comes from here rather than from the page,
    // because there is one formatter for how this city addresses a citizen and
    // it already exists. A second `name.split(' ')[0]` on the frontend is how
    // somebody ends up greeted "Dear ," above their own data — see
    // shared/salutation.ts, which was written after exactly that happened.
    return { greeting: salutation(m.name), percent, complete: percent >= 100, sections, nextUp };
  }
}

/**
 * The share of the latest panel's markers that came back in range.
 *
 * Reads the stored analysis rather than recomputing it, and returns null on
 * anything unreadable — a component that cannot be established must be missing,
 * never zero.
 */
function markerShare(payload?: string | null): number | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { markers?: Array<{ status?: string }> };
    const markers = parsed.markers ?? [];
    if (markers.length === 0) return null;
    const inRange = markers.filter((m) => (m.status ?? '').toLowerCase() === 'normal').length;
    return inRange / markers.length;
  } catch {
    return null;
  }
}
