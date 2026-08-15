import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MasterProfileService } from '../../profile/master-profile.service';
import { MedicalService } from '../../medical/medical.service';
import { NutritionService } from '../../nutrition/nutrition.service';
import { swallowed } from '../../shared/swallow';
import { recommend, type Citizen } from './supplements.engine';

/**
 * WHAT THE ENGINE IS ALLOWED TO KNOW, AND WHERE IT COMES FROM.
 *
 * The engine itself is a pure function over a `Citizen` — no database, no
 * services, no clock — which is what makes it testable and what keeps the
 * safety rules readable. This file is the only place that talks to the hubs,
 * and it does three things worth naming.
 *
 * THE BLOOD WORK IS READ THROUGH THE CONSENT GATE, not out of the table.
 * `medical.sharedBiomarkers(userId, 'fitness')` is the reader that throws if
 * the citizen has revoked Fitness's access to their medical hub, and going
 * around it — a direct Prisma query for the same rows — would be a privacy
 * regression that no test in the medical hub could see. If consent is refused
 * the engine simply runs without labs, which it is built to do: the answers
 * become population-level and say so.
 *
 * EVERY READ IS SWALLOWED, and that is not laziness. A citizen with no
 * nutrition profile, no blood test and no medicines is the COMMON case on a
 * new account, and an engine that throws for them shows a broken screen
 * instead of the honest one — which is "here is what is generally true in
 * India, and here is what a test would settle."
 *
 * NOTHING IS SUBSTITUTED FOR MISSING DATA. No default weight, no assumed sex,
 * no "most people train three times a week". The whole iron rule rests on the
 * difference between a normal ferritin and no ferritin, and a default is how
 * that difference gets erased before anything reads it.
 */
@Injectable()
export class SupplementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    private readonly medical: MedicalService,
    private readonly nutrition: NutritionService,
  ) {}

  async plan(userId: string) {
    const [master, shared, targets, meds, pref, fitness] = await Promise.all([
      this.masterProfile.get(userId).catch(swallowed('supplements.master', null)),
      this.medical.sharedBiomarkers(userId, 'fitness').catch(swallowed('supplements.biomarkers', null)),
      this.nutrition.targets(userId).catch(swallowed('supplements.targets', null)),
      this.prisma.medicine.findMany({ where: { userId }, select: { name: true } })
        .catch(swallowed('supplements.medicines', [] as Array<{ name: string }>)),
      this.prisma.foodPref.findUnique({ where: { userId } }).catch(swallowed('supplements.pref', null)),
      this.prisma.fitnessProfile.findUnique({ where: { userId } }).catch(swallowed('supplements.fitness', null)),
    ]);

    const citizen: Citizen = {
      age: num(fitness?.age) ?? num(pick(master, 'food', 'age')),
      sex: sexOf(fitness?.sex ?? pick(master, 'dating', 'gender')),
      vegetarian: dietIsVeg(pref?.diet),
      vegan: String(pref?.diet ?? '').toLowerCase().includes('vegan'),
      goal: goalOf(fitness?.goal ?? pref?.goal),
      /* Sessions a week is not on the fitness profile — `level` and `mode` are
         what it holds — so the engine is told nothing rather than a number
         somebody guessed. Creatine's goal reason needs it, which is why
         creatine stays off the plan until the activity log can supply it. */
      trainsPerWeek: undefined,
      proteinTargetG: num(pick(targets, 'protein', 'g')) ?? num(pick(targets, 'proteinG')),
      proteinIntakeG: num(pick(targets, 'eaten', 'protein')),
      /* Conditions live on the FITNESS profile as a comma-separated string
         (the same list the nutrition clinical engine reads), so they are read
         from there rather than invented on the master profile. */
      conditions: listOf(fitness?.conditions) ?? listOf(pick(master, 'food', 'conditions')),
      medicines: meds.map((m) => m.name),
      taking: [],
      /* THE LAB NAMES ARE THE MEDICAL HUB'S KEYS, mapped once, here. The engine
         matches loosely on the NAME it is given, so this is the one place that
         has to know `vitd` means 25-OH vitamin D. */
      labs: labsFrom(shared),
    };

    const out = recommend(citizen);
    return {
      ...out,
      /* WHAT WAS ACTUALLY KNOWN, said out loud. A plan built without blood
         work and a plan built with it are different objects, and the screen
         has to be able to tell the citizen which one it is holding. */
      basis: {
        bloodWork: shared ? { takenOn: (shared as { takenOn?: string }).takenOn ?? null, granted: true } : null,
        medicines: (citizen.medicines ?? []).length,
        diet: citizen.vegan ? 'vegan' : citizen.vegetarian ? 'vegetarian' : null,
        goal: citizen.goal ?? null,
      },
    };
  }
}

/* ── the defensive readers ────────────────────────────────────────────────
   Every hub owns its own shape and changes it without asking this file, so
   nothing here indexes blindly: a missing field reads as "not known", which
   is a state the engine handles, rather than as a crash on somebody's
   supplement page. */
function pick(o: unknown, ...keys: string[]): unknown {
  let cur = o;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
function listOf(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}
function sexOf(v: unknown): Citizen['sex'] {
  const s = String(v ?? '').toLowerCase();
  return s.startsWith('m') ? 'male' : s.startsWith('f') ? 'female' : undefined;
}
function dietIsVeg(v: unknown): boolean | undefined {
  const s = String(v ?? '').toLowerCase();
  if (!s) return undefined;
  return s.includes('veg') || s.includes('jain');
}
function goalOf(v: unknown): Citizen['goal'] {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('muscle') || s.includes('gain') || s.includes('strong')) return 'muscle';
  if (s.includes('lose') || s.includes('fat') || s.includes('cut')) return 'fatloss';
  if (s.includes('endur') || s.includes('run')) return 'endurance';
  if (s.includes('sleep')) return 'sleep';
  if (s.includes('recover')) return 'recovery';
  return s ? 'wellness' : undefined;
}
/** The medical hub's biomarker keys → the names the engine matches on. Only
 *  the three that change an answer are mapped; an unmapped marker is not a
 *  marker the engine is entitled to reason about. */
function labsFrom(shared: unknown): Citizen['labs'] {
  const values = pick(shared, 'values');
  if (!values || typeof values !== 'object') return [];
  const at = String(pick(shared, 'takenOn') ?? '') || undefined;
  const v = values as Record<string, unknown>;
  const out: NonNullable<Citizen['labs']> = [];
  const add = (key: string, name: string, unit: string) => {
    const n = num(v[key]);
    if (n !== undefined) out.push({ name, value: n, unit, at });
  };
  add('vitd', '25-OH vitamin D', 'ng/mL');
  add('b12', 'Vitamin B12', 'pg/mL');
  add('ferritin', 'Ferritin', 'ng/mL');
  return out;
}
