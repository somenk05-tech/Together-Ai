import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

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
}

const SHARED_KEYS: Array<keyof SharedFields> = [
  'gender', 'dateOfBirth', 'timeOfBirth', 'birthCountry', 'birthState', 'birthCity',
  'country', 'state', 'city', 'timeZone', 'languages', 'heightCm', 'weightKg', 'occupation', 'phone',
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
  const sexBinary = shared.gender === 'male' || shared.gender === 'female' ? shared.gender : undefined;
  const age = shared.dateOfBirth !== undefined ? computeAge(shared.dateOfBirth) ?? undefined : undefined;
  const birthPlace = [shared.birthCity, shared.birthState, shared.birthCountry].filter(Boolean).join(', ') || undefined;
  return {
    astro: def({
      birthDate: shared.dateOfBirth ?? undefined, birthTime: shared.timeOfBirth,
      birthCountry: shared.birthCountry ?? undefined, birthState: shared.birthState,
      birthCity: shared.birthCity ?? undefined, timeZone: shared.timeZone ?? undefined,
    }),
    dating: def({
      gender: shared.gender ?? undefined, birthDate: shared.dateOfBirth ?? undefined,
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
    const [row, user, astro, dating, food, fitness] = await Promise.all([
      this.master.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.user.findUnique({ where: { id: userId } }),
      astroDb.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.datingProfile.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null),
      this.prisma.fitnessProfile.findUnique({ where: { userId } }).catch(() => null),
    ]);

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
        gender: dating.gender, dateOfBirth: dating.birthDate, timeOfBirth: dating.birthTime,
        birthCity: place[0], birthState: place.length > 2 ? place[1] : undefined,
        birthCountry: place.length > 1 ? place[place.length - 1] : undefined,
      } : {},
      food ? { heightCm: food.heightCm, weightKg: food.weightKg, gender: food.sex } : {},
      fitness ? { heightCm: fitness.heightCm, weightKg: fitness.weightKg, gender: fitness.sex === 'other' ? undefined : fitness.sex } : {},
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
    const rawFitAge = (fitness as { age?: number | null } | null)?.age;
    const age = computeAge(merged.dateOfBirth ?? null)
      ?? (typeof rawFoodAge === 'number' ? rawFoodAge : null)
      ?? (typeof rawFitAge === 'number' ? rawFitAge : null);

    return {
      name: user?.name ?? '',
      email: user?.email ?? '',
      photo: (user as { profileImage?: string | null } | null)?.profileImage ?? null,
      ...merged,
      age,
      updatedAt: row?.updatedAt?.toISOString?.() ?? null,
    };
  }

  /**
   * The write path every hub uses for shared fields: update the canonical row,
   * then propagate into the hub tables that duplicate the field (only rows
   * that already exist — a hub's own profile is still created by that hub).
   */
  async syncShared(userId: string, patch: SharedFields, source: string) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([k, v]) => SHARED_KEYS.includes(k as keyof SharedFields) && v !== undefined),
    ) as SharedFields;
    if (!Object.keys(clean).length) return { synced: false };

    await this.master.upsert({
      where: { userId }, update: clean, create: { userId, ...clean },
    }).catch((e: Error) => this.logger.warn(`master upsert failed (${source}): ${e.message}`));

    const plan = propagationPlan(clean);
    const p = this.prisma as unknown as Record<string, { updateMany: (a: unknown) => Promise<unknown> }>;
    // updateMany({where:{userId}}) is a no-op when the hub row doesn't exist —
    // exactly the semantics we want (propagate, never create).
    await Promise.all([
      Object.keys(plan.astro).length ? p.astroProfile.updateMany({ where: { userId }, data: plan.astro }).catch(() => undefined) : null,
      Object.keys(plan.dating).length ? p.datingProfile.updateMany({ where: { userId }, data: plan.dating }).catch(() => undefined) : null,
      Object.keys(plan.food).length ? p.foodPref.updateMany({ where: { userId }, data: plan.food }).catch(() => undefined) : null,
      Object.keys(plan.fitness).length ? p.fitnessProfile.updateMany({ where: { userId }, data: plan.fitness }).catch(() => undefined) : null,
    ]);
    this.logger.log(`shared fields synced from ${source}: ${Object.keys(clean).join(', ')}`);
    return { synced: true, fields: Object.keys(clean) };
  }
}
