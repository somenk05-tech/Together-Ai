import { ForbiddenException, Injectable } from '@nestjs/common';
import { answeredNow } from '../shared/prisma/answered-at';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { clinicalSex } from '../profile/sex-and-gender';
import { MedicalService } from '../medical/medical.service';
import { flagsFor } from '../nutrition/clinical-engine';
import {
  buildPlan, conditionsFromLabs, conditionsFromDeclared, computeBodyProgram, LEVELS, MODES, BODY_GOALS,
  type ConditionAdjustment,
} from './fitness-engine';
import type { SaveFitnessProfileDto, LogWorkoutDto } from './dto/fitness.dto';

const DEFAULT_PROFILE = { age: 35, sex: 'other', level: 'beginner', mode: 'mixed', goal: 'general', conditions: [] as string[], heightCm: null as number | null, weightKg: null as number | null, bodyGoal: 'athletic' };

@Injectable()
export class FitnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    // Fitness reads biomarkers only through the Medical Hub's consent gate.
    private readonly medical: MedicalService,
  ) {}

  private optionsFor(sex: string) {
    return {
      levels: LEVELS.map(({ key, label, note }) => ({ key, label, note })),
      modes: MODES.map(({ key, label, note }) => ({ key, label, note })),
      bodyGoals: BODY_GOALS.map(({ key, label, tag }) => ({ key, label: label[sex] ?? label.other, tag })),
    };
  }

  async getProfile(userId: string) {
    const row = await this.prisma.fitnessProfile.findUnique({ where: { userId } });
    // Shared demographics (age, gender, height, weight) are owned by the Master
    // Profile — the single source of truth — so they always reflect whatever the
    // user entered in any hub. Fitness owns only level/mode/goal/conditions/body.
    const pre = await this.prefillFromMaster(userId).catch(() => null);
    if (!row) {
      const sex = pre?.sex ?? 'other';
      return { ...DEFAULT_PROFILE, ...(pre ?? {}), saved: false, prefilled: Boolean(pre && (pre.heightCm || pre.weightKg || pre.age)), options: this.optionsFor(sex) };
    }
    // Master demographics take precedence over the fitness row's cached copy.
    const age = pre?.age ?? row.age;
    const sex = pre?.sex ?? row.sex;
    const heightCm = pre?.heightCm ?? row.heightCm;
    const weightKg = pre?.weightKg ?? row.weightKg;
    return {
      age, sex, level: row.level, mode: row.mode, goal: row.goal,
      conditions: row.conditions ? row.conditions.split(',').filter(Boolean) : [],
      heightCm, weightKg, bodyGoal: row.bodyGoal,
      saved: true, options: this.optionsFor(sex),
    };
  }

  /** Shared demographics from the Master Profile for a first-time fitness form. */
  private async prefillFromMaster(userId: string): Promise<{ age?: number; sex?: string; heightCm?: number | null; weightKg?: number | null } | null> {
    const m = await this.masterProfile.get(userId);
    // clinicalSex(), not m.gender. `sex` here feeds Mifflin-St Jeor, and this
    // line was reading the SOCIAL column for a CLINICAL value — the exact
    // conflation the 20260730200000 split existed to end, still live in the one
    // place a wrong answer changes somebody's calorie target.
    //
    // It was also reading a column the Master Profile page stopped writing, so a
    // citizen who answered "Sex at birth: female" on that page arrived here with
    // nothing, and computeTargets fell back to a reference body.
    //
    // clinicalSex() prefers sexAtBirth, falls back to the pre-split column for
    // rows the backfill did not reach, and returns undefined for intersex or
    // preferNotToSay rather than guessing — which the caller already handles,
    // because "no sex on file" is reported in `assumed[]`.
    const sex = clinicalSex(m);
    const out: { age?: number; sex?: string; heightCm?: number | null; weightKg?: number | null } = {};
    if (typeof m.age === 'number') out.age = m.age;
    if (sex) out.sex = sex;
    if (typeof m.heightCm === 'number') out.heightCm = m.heightCm;
    if (typeof m.weightKg === 'number') out.weightKg = m.weightKg;
    return Object.keys(out).length ? out : null;
  }

  async saveProfile(userId: string, dto: SaveFitnessProfileDto) {
    const data = {
      age: dto.age, sex: dto.sex, level: dto.level, mode: dto.mode, goal: dto.goal,
      conditions: dto.conditions.join(','), heightCm: dto.heightCm ?? null, weightKg: dto.weightKg ?? null, bodyGoal: dto.bodyGoal,
    };
    // The citizen saved their training profile — this row is no longer defaults.
    await this.prisma.fitnessProfile.upsert({ where: { userId }, update: answeredNow(data), create: { userId, ...answeredNow(data) } } as never);
    // Master Profile sync. This wrote `gender` — the retired column — which is
    // most of why it still looked alive: saving a fitness profile refilled it,
    // so the read sites that depended on it kept working for anybody who had,
    // and silently failed for anybody who had not.
    //
    // The fitness form asks a clinical question ("female | male | other" against
    // a BMR equation), so its answer belongs in sexAtBirth. 'other' is not a
    // clinical answer and is dropped rather than stored as one.
    await this.masterProfile.syncShared(userId, {
      heightCm: dto.heightCm ?? undefined, weightKg: dto.weightKg ?? undefined,
      sexAtBirth: dto.sex === 'other' ? undefined : dto.sex,
    }, 'fitness').catch(() => undefined);
    return this.getProfile(userId);
  }

  // ─────────────── body goal ↔ nutrition (the reverse-connect) ───────────────
  private async labFlagsFor(userId: string): Promise<{ flags: Record<string, string>; values: Record<string, number>; granted: boolean }> {
    try {
      const shared = await this.medical.sharedBiomarkers(userId, 'fitness');
      const values = shared.values ?? {};
      return { flags: flagsFor(values) as Record<string, string>, values, granted: true };
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
      return { flags: {}, values: {}, granted: false };
    }
  }

  /** The integrated program: target body composition → calories/macros + workout emphasis + health gains. */
  async bodyProgram(userId: string) {
    const p = await this.getProfile(userId);
    const { flags, values, granted } = await this.labFlagsFor(userId);
    const program = computeBodyProgram({
      age: p.age, sex: p.sex, level: p.level, heightCm: p.heightCm, weightKg: p.weightKg,
      bodyGoal: p.bodyGoal, labFlags: flags, labValues: values,
    });
    return { ...program, consentGranted: granted };
  }

  /** Reverse-connect: push the body-goal-derived nutrition target into the Nutrition Hub. */
  async syncNutrition(userId: string) {
    const p = await this.getProfile(userId);
    const program = computeBodyProgram({
      age: p.age, sex: p.sex, level: p.level, heightCm: p.heightCm, weightKg: p.weightKg, bodyGoal: p.bodyGoal,
    });
    await this.prisma.foodPref.upsert({
      where: { userId },
      update: { goal: program.nutrition.goal, heightCm: p.heightCm ?? undefined, weightKg: p.weightKg ?? undefined, age: p.age, sex: p.sex === 'other' ? undefined : p.sex },
      create: { userId, goal: program.nutrition.goal, heightCm: p.heightCm ?? undefined, weightKg: p.weightKg ?? undefined, age: p.age, sex: p.sex === 'other' ? undefined : p.sex },
    });
    return { synced: true, nutritionGoal: program.nutrition.goal, proteinTarget: program.nutrition.proteinTarget };
  }

  /** Conditions the user carries in their Medical records (kind=condition) mapped to fitness keys. */
  private async recordConditions(userId: string): Promise<string[]> {
    const recs = await this.prisma.medicalRecord.findMany({ where: { userId, kind: 'condition' } });
    const text = recs.map((r) => `${r.title} ${r.detail ?? ''}`.toLowerCase()).join(' | ');
    const keys: string[] = [];
    if (/diabet/.test(text)) keys.push('diabetes');
    if (/hypertens|high blood pressure|\bbp\b/.test(text)) keys.push('hypertension');
    return keys;
  }

  /**
   * The differentiated plan: age band + level + mode, adjusted by declared conditions,
   * Medical-record conditions, and — with consent — biomarker-derived conditions.
   */
  async plan(userId: string) {
    const profile = await this.getProfile(userId);

    // Lab-derived conditions come through the consent gate (may be revoked).
    let labConditions: ConditionAdjustment[] = [];
    let usedLabs = false;
    let consentGranted = true;
    try {
      const shared = await this.medical.sharedBiomarkers(userId, 'fitness');
      const values = shared.values ?? {};
      if (Object.keys(values).length) {
        labConditions = conditionsFromLabs(flagsFor(values) as Record<string, string>, values);
        usedLabs = true;
      }
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
      consentGranted = false; // revoked → plan still builds from age + declared/record conditions
    }

    const recordKeys = await this.recordConditions(userId);
    const declared = conditionsFromDeclared([...profile.conditions, ...recordKeys], recordKeys.length ? 'records' : 'declared');

    const plan = buildPlan({
      age: profile.age, sex: profile.sex, level: profile.level, goal: profile.goal, mode: profile.mode,
      labConditions, declaredConditions: declared, usedLabs,
    });
    return { ...plan, consentGranted };
  }

  // ─────────────── activity log ───────────────
  async log(userId: string) {
    const rows = await this.prisma.workoutLog.findMany({ where: { userId }, orderBy: { doneAt: 'desc' }, take: 50 });
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const week = rows.filter((r) => r.doneAt >= weekAgo);
    return {
      entries: rows.map((r) => ({ id: r.id, focus: r.focus, minutes: r.minutes, intensity: r.intensity, note: r.note, doneAt: r.doneAt.toISOString() })),
      weekMinutes: week.reduce((s, r) => s + r.minutes, 0),
      weekSessions: week.length,
    };
  }

  async addLog(userId: string, dto: LogWorkoutDto) {
    await this.prisma.workoutLog.create({
      data: { userId, focus: dto.focus, minutes: dto.minutes, intensity: dto.intensity, note: dto.note ?? null },
    });
    return this.log(userId);
  }
}
