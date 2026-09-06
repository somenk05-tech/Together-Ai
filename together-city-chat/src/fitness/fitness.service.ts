import { swallowed } from '../shared/swallow';
import { ACTIVITY_FACTORS } from '../shared/energy';
import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProfileEditMeterService } from '../profile/profile-edit-meter.service';
import { profileChanged } from '../profile/edit-quota';
import { answeredNow } from '../shared/prisma/answered-at';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { clinicalSex } from '../profile/sex-and-gender';
import { MedicalService } from '../medical/medical.service';
import { flagsFor } from '../nutrition/clinical-engine';
import { NutritionService } from '../nutrition/nutrition.service';
import {
  buildPlan, conditionsFromLabs, conditionsFromDeclared, computeBodyProgram, levelDef, LEVELS, MODES, BODY_GOALS,
  type ConditionAdjustment,
} from './fitness-engine';
import { buildSession, type LevelKey, type BodyGoalKey, type SessionInput, type Intensity } from './session-engine';
import { buildProgramme, daysBetween, type Muscle } from './programme-engine';
import { EQUIPMENT_KEYS, type Condition, type Equipment , type Pattern } from './exercise-library';
import type { SaveFitnessProfileDto, LogWorkoutDto, EditWorkoutDto, TodaySessionQueryDto } from './dto/fitness.dto';

const DEFAULT_PROFILE = {
  age: 35, sex: 'other', level: 'beginner', mode: 'mixed', goal: 'general', conditions: [] as string[],
  heightCm: null as number | null, weightKg: null as number | null, bodyGoal: 'athletic',
  equipment: [] as string[], daysPerWeek: null as number | null, limitations: null as string | null,
  place: null as string | null, sessionMinutes: null as number | null,
};

/** How a nutrition goal reads in a sentence. The note names the setting that
 *  disagrees with the body goal, and "lose" is a database value, not English. */
const GOAL_WORDS: Record<string, string> = { lose: 'losing weight', maintain: 'maintaining', gain: 'gaining weight' };

@Injectable()
export class FitnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    // Fitness reads biomarkers only through the Medical Hub's consent gate.
    private readonly medical: MedicalService,
    // One protein prescription per person, and Nutrition owns it. See
    // clinicalProtein() — this hub asks rather than keeping a second copy of a
    // clinical rule that reads conditions, pregnancy, age and kidney staging.
    private readonly nutrition: NutritionService,
    // Five free profile changes a month, ₹50 each after (5 Sep). Optional so
    // the specs that build this service by hand are not asked to build a
    // wallet; Nest always provides it.
    @Optional() private readonly meter?: ProfileEditMeterService,
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
    const pre = await this.prefillFromMaster(userId).catch(swallowed('fitness.getProfile', null));
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
      // Empty and null travel as themselves. '' is not 'none' and null is not
      // a number — the difference between "no equipment" and "never asked" is
      // the difference between an honest session and an invented one.
      equipment: row.equipment ? row.equipment.split(',').filter(Boolean) : [],
      daysPerWeek: row.daysPerWeek ?? null,
      limitations: row.limitations ?? null,
      place: row.place ?? null,
      sessionMinutes: row.sessionMinutes ?? null,
      saved: true, options: this.optionsFor(sex),
    };
  }

  /**
   * How much the citizen moves, from the one place that knows.
   *
   * This hub used to derive it from `level` — the field its own form labels
   * "Ability level · basic → super-athletic" and its summary row calls
   * "Ability". That is training experience. Two people with identical bodies
   * were given different energy needs because one said they were more
   * experienced, and neither number matched what Nutrition used.
   *
   * Ability still decides the programme: how many sessions, how hard. It has
   * simply stopped deciding how many calories somebody burns sitting still.
   *
   * Null when they have never answered. computeBodyProgram refuses on null
   * rather than choosing a factor for them.
   */
  private async activityFor(userId: string): Promise<number | null> {
    const m = await this.masterProfile.get(userId).catch(swallowed('fitness.activityFor', null));
    const level = (m as { activityLevel?: string | null } | null)?.activityLevel;
    if (!level) return null;
    return ACTIVITY_FACTORS[level as keyof typeof ACTIVITY_FACTORS] ?? null;
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
    const { method } = dto;
    const data = {
      age: dto.age, sex: dto.sex, level: dto.level, mode: dto.mode, goal: dto.goal,
      conditions: dto.conditions.join(','), heightCm: dto.heightCm ?? null, weightKg: dto.weightKg ?? null, bodyGoal: dto.bodyGoal,
      // `?? undefined` rather than `?? null`: a form that does not send a field
      // must LEAVE it, not erase it. The Training Profile and any future
      // shorter form both write through here.
      equipment: dto.equipment ? dto.equipment.join(',') : undefined,
      daysPerWeek: dto.daysPerWeek ?? undefined,
      limitations: dto.limitations ?? undefined,
      place: dto.place ?? undefined,
      sessionMinutes: dto.sessionMinutes ?? undefined,
    };
    // FIVE FREE CHANGES A MONTH, THEN ₹50 (5 Sep). Priced before the write,
    // counted after it, and only when an answer actually moved — a re-save of
    // the same profile is not a change, and the FIRST save of a profile is
    // the citizen arriving, not changing their mind: it is never counted.
    const before = this.meter ? await this.prisma.fitnessProfile.findUnique({ where: { userId } }).catch(swallowed('fitness.saveProfile: read before', null)) : null;
    const changed = Boolean(before?.answeredAt) && profileChanged(before as unknown as Record<string, unknown>, data);
    const priceInr = changed && this.meter ? await this.meter.assertCanSave(userId, method) : 0;
    // The citizen saved their training profile — this row is no longer defaults.
    await this.prisma.fitnessProfile.upsert({ where: { userId }, update: answeredNow(data), create: { userId, ...answeredNow(data) } });
    if (changed && this.meter) await this.meter.record(userId, 'fitness', priceInr, method);
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
    }, 'fitness').catch(swallowed('fitness.saveProfile', undefined));
    return this.getProfile(userId);
  }

  /**
   * ── TODAY'S SESSION ───────────────────────────────────────────────────────
   *
   * Everything the engine needs, gathered in one place: the saved training
   * profile, the body goal, the conditions the citizen declared AND the ones
   * their medical records carry, the intensity ceiling the weekly plan derives
   * from their labs, Nutrition's day, and what they have actually done this
   * week.
   *
   * NONE OF THIS IS NEW DATA. Every one of these was already computed and
   * already on a screen somewhere; the Workout page simply never asked for any
   * of it and built the session in the browser from three hardcoded tables.
   * The gathering IS the feature.
   *
   * Every read that can fail is allowed to, and its absence is NAMED rather
   * than substituted: a session that quietly assumes a body, a lab or a
   * calorie target is the thing this replaces.
   */
  async session(userId: string, q: TodaySessionQueryDto) {
    const profile = await this.getProfile(userId);
    const missing: string[] = [];

    // The ceiling comes from the weekly plan, which already reads the labs
    // through the Medical consent gate. Two readings of a lab result would be
    // two answers to "how hard may this person work".
    const plan = await this.plan(userId).catch(swallowed('fitness.session.plan', null));
    const intensityCap = ((plan as { intensityCap?: string } | null)?.intensityCap ?? 'moderate') as Intensity;

    /**
     * AND TODAY'S DAY OUT OF THE SAME PLAN.
     *
     * The ceiling came from the week and nothing else did, so the plan could
     * say "Tuesday: Pull" while this built a full-body session with squats in
     * it — and no screen in the application would have shown the two
     * disagreeing. They are the same day now.
     *
     * MONDAY-FIRST, BECAUSE THE PLAN IS. `sessions` is built over
     * ['Mon'…'Sun'], and Date#getDay is Sunday-first; reading the array with
     * getDay() directly would hand a citizen Sunday's rest day on a Monday
     * morning, which is the sort of off-by-one that looks like the feature
     * simply not working.
     *
     * A DAY THE PLAN CANNOT PRODUCE IS NOT INVENTED. If the plan failed to
     * build, or is an older shape with no `patterns` on it, this stays
     * undefined and the session is exactly what it was before.
     */
    const sessions = (plan as { sessions?: Array<{ day: string; focus: string; kind: string; trains?: string[]; patterns?: string[] }> } | null)?.sessions;
    const todayIdx = (new Date().getDay() + 6) % 7;   // Mon = 0
    const planDay = sessions?.[todayIdx];
    const day = planDay && Array.isArray(planDay.patterns)
      ? {
        title: planDay.focus.replace(/ — weights$/, ''),
        trains: planDay.trains ?? [],
        patterns: planDay.patterns as Pattern[],
        kind: planDay.kind as NonNullable<SessionInput['day']>['kind'],
      }
      : undefined;

    // The medical records' conditions count exactly as the declared ones do —
    // a citizen who wrote their arthritis into their records has told us.
    const recordKeys = await this.recordConditions(userId).catch(swallowed('fitness.session.records', [] as string[]));
    const declared = [...profile.conditions, ...recordKeys];
    const conditions = (['hypertension', 'diabetes', 'pregnancy', 'jointPain'] as Condition[])
      .filter((c) => declared.includes(c));

    const targets = await this.nutrition.targets(userId).catch(swallowed('fitness.session.targets', null)) as
      { kcal?: unknown; protein?: unknown; goal?: unknown } | null;
    const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
    if (num(targets?.kcal) == null) missing.push('your daily calorie target — set it in Nutrition and this session explains itself against it');

    const log = await this.log(userId).catch(swallowed('fitness.session.log', null)) as
      { entries?: Array<{ doneAt: Date | string }>; weekMinutes?: number; weekSessions?: number } | null;
    const last = log?.entries?.[0]?.doneAt ? new Date(log.entries[0].doneAt) : null;
    const daysSinceLast = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;

    const equipment = (profile.equipment as string[]).filter((k): k is Equipment => (EQUIPMENT_KEYS as readonly string[]).includes(k));
    if (equipment.length === 0) missing.push('what you have to train with — without it a home session can only be bodyweight');
    if (profile.daysPerWeek == null) missing.push('how many days a week you can train');

    const input: SessionInput = {
      day,
      minutes: q.minutes ?? profile.sessionMinutes ?? 45,
      location: (q.place ?? profile.place ?? 'home') as 'home' | 'gym',
      // At a gym, the machines and the bars are there whether or not anybody
      // ticked a box — that is what a gym IS. At home nothing is assumed.
      equipment: (q.place ?? profile.place) === 'gym'
        ? ([...new Set<Equipment>([...equipment, 'dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'])])
        : equipment,
      level: profile.level as LevelKey,
      bodyGoal: profile.bodyGoal as BodyGoalKey,
      conditions,
      intensityCap,
      kcalTarget: num(targets?.kcal),
      proteinG: num(targets?.protein),
      nutritionGoal: typeof targets?.goal === 'string' ? targets.goal : null,
      weightKg: profile.weightKg ?? null,
      recent: {
        sessionsLast7: log?.weekSessions ?? 0,
        minutesLast7: log?.weekMinutes ?? 0,
        daysSinceLast,
      },
      limitations: profile.limitations ?? null,
      missing,
    };
    const built = buildSession(input);

    /**
     * ── THE MONTH LAYS OVER THE SESSION (owner, 6 Sep) ───────────────────
     *
     * A trainer's month says which body part today is and which movements
     * — from the whole catalogue — so on a strength day the session's
     * working block IS the month's day: its movements, its sets, its reps,
     * its phase. The warm-up, the cool-down and the walk are the session's
     * own, as before. On a rest or cardio day the session keeps its own
     * work but says what the month has down for today, so a citizen who
     * presses Start on a rest day is told, not stopped.
     */
    const month = await this.programme(userId).catch(swallowed('fitness.session.programme', null));
    const today = month && month.todayIndex >= 0 && month.todayIndex < month.days.length ? month.days[month.todayIndex] : null;
    if (month && today) {
      const phase = month.phases.find((p) => p.key === today.phase);
      built.programme = {
        day: today.index + 1, of: month.days.length, week: today.week, phase: today.phase, phaseLabel: phase?.label ?? today.phase,
        kind: today.kind, title: today.title, parts: today.parts, note: today.note,
      };
      if (today.kind === 'strength' && today.exercises.length) {
        const work = built.blocks.find((b) => b.title === 'The work');
        if (work) {
          const first = today.exercises[0];
          work.note = `${first.sets} sets each, ${first.restSec}s rest · ${phase?.label ?? today.phase} week.`;
          work.exercises = today.exercises.map((e) => ({
            id: `cat-${e.id}`, name: e.name, pattern: patternOfMuscle(e.muscle), sets: e.sets, reps: e.reps, restSec: e.restSec,
            steps: e.steps, muscles: [e.works], thumb: e.thumb, gif: e.gif, video: '',
          }));
        }
        built.headline = `${built.minutes} min ${today.title.toLowerCase()} — ${today.parts} + ${built.walkMinutes} min walk`;
        built.why.day = `Day ${today.index + 1} of ${month.days.length}: your month has today as ${today.title} — ${today.parts} — in the ${(phase?.label ?? today.phase).toLowerCase()} week. ${today.note}`;
      } else if (today.kind === 'rest') {
        built.why.day = `Day ${today.index + 1} of ${month.days.length}: your month has today as a rest day. ${today.note} If you train anyway, keep it to this and the walk.`;
      } else {
        built.why.day = `Day ${today.index + 1} of ${month.days.length}: your month has today as ${today.title.toLowerCase()} — ${today.cardioMinutes} minutes. ${today.note}`;
      }
    } else {
      built.programme = null;
    }
    return { ...built, place: input.location, equipmentUsed: input.equipment };
  }

  /**
   * ── A MONTH WITH A TRAINER (owner, 6 Sep) ─────────────────────────────────
   *
   * Twenty-eight days from the day the citizen first opened it, built by
   * programme-engine.ts from the profile, the kit, the conditions and the
   * whole catalogue, and rolled into a fresh cycle when the month is up. The
   * only thing stored is the start date: the month itself is a pure function
   * of the profile and the day, so it is the same on every open and moves
   * the moment the profile does. Done marks come from the workout log.
   */
  async programme(userId: string) {
    const profile = await this.getProfile(userId);
    const today = cityDay(new Date());
    const row = await this.prisma.fitnessProfile.findUnique({ where: { userId }, select: { programmeStart: true } })
      .catch(swallowed('fitness.programme: read start', null));
    let start = row?.programmeStart ? cityDay(new Date(row.programmeStart)) : null;
    if (!start) {
      start = today;
      await this.prisma.fitnessProfile.upsert({
        where: { userId },
        update: { programmeStart: new Date(`${today}T00:00:00Z`) },
        create: { userId, programmeStart: new Date(`${today}T00:00:00Z`) },
      }).catch(swallowed('fitness.programme: write start', undefined));
    }
    let cycle = 0;
    while (daysBetween(start, today) >= 28) { start = addDaysIso(start, 28); cycle += 1; }

    const recordKeys = await this.recordConditions(userId).catch(swallowed('fitness.programme.records', [] as string[]));
    const declared = [...profile.conditions, ...recordKeys];
    const conditions = (['hypertension', 'diabetes', 'pregnancy', 'jointPain'] as Condition[]).filter((c) => declared.includes(c));
    const own = (profile.equipment as string[]).filter((k): k is Equipment => (EQUIPMENT_KEYS as readonly string[]).includes(k));
    const equipment = profile.place === 'gym'
      ? [...new Set<Equipment>([...own, 'dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'])]
      : own;
    const built = buildProgramme({
      startDate: start, today,
      daysPerWeek: profile.daysPerWeek ?? levelDef(profile.level).days,
      level: profile.level as LevelKey, mode: profile.mode, bodyGoal: profile.bodyGoal as BodyGoalKey,
      equipment, conditions, seed: userId, cycle,
    });
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId, doneAt: { gte: new Date(`${start}T00:00:00Z`), lt: new Date(`${addDaysIso(start, 28)}T00:00:00Z`) } },
      select: { doneAt: true },
    }).catch(swallowed('fitness.programme.logs', [] as { doneAt: Date }[]));
    const done = new Set(logs.map((l) => cityDay(l.doneAt)));
    return { ...built, cycle, today, days: built.days.map((d) => ({ ...d, done: done.has(d.date) })) };
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
      age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg,
      activity: await this.activityFor(userId),
      // ONE NUMBER PER PERSON. Asked for rather than recomputed: the clinical
      // protein rule reads conditions, pregnancy, age and kidney staging, and a
      // second copy of it in this hub is a second copy that drifts. This hub
      // used to dose 1.8 g/kg of actual weight and print 185 g beside
      // Nutrition's 74 g, with nothing to tell the citizen which to eat.
      ...(await this.clinicalTargets(userId)),
      bodyGoal: p.bodyGoal, labFlags: flags, labValues: values,
    });
    return { ...program, consentGranted: granted };
  }

  /**
   * The day Nutrition has already prescribed for this citizen: its energy, its
   * protein, and how its goal reads in words.
   *
   * ONE READ, THREE FIELDS. This was `clinicalProtein()` and fetched the same
   * object to take one number off it; asking twice for the rest would have been
   * two round trips and, worse, two chances for the kcal and the protein on one
   * screen to come from two different reads of a profile being edited.
   *
   * Best-effort. If Nutrition cannot answer, this hub falls back to its own
   * goal's figures and labels them — a page that refuses to show a number
   * because the other hub is slow is worse than a page showing the number it
   * can defend.
   */
  private async clinicalTargets(userId: string): Promise<{ clinicalProteinG: number | null; clinicalKcal: number | null; clinicalGoalLabel: string | null }> {
    const t = await this.nutrition.targets(userId).catch(swallowed('fitness.clinicalTargets', null)) as
      { protein?: unknown; kcal?: unknown; goal?: unknown } | null;
    const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
    const goal = typeof t?.goal === 'string' ? t.goal : null;
    return {
      clinicalProteinG: num(t?.protein),
      clinicalKcal: num(t?.kcal),
      clinicalGoalLabel: goal ? (GOAL_WORDS[goal] ?? goal) : null,
    };
  }

  /**
   * Push the BODY — and only the body — into the Nutrition Hub.
   *
   * THIS USED TO OVERWRITE THE NUTRITION GOAL, and that was the whole defect
   * the owner saw. A citizen whose body goal is Athletic and whose nutrition
   * goal is losing weight got 2993 kcal on one page and 2455 on the other; one
   * press of this button silently moved their day by 538 kcal, regenerated
   * their week against it, and told them only that it had "synced".
   *
   * Height, weight, age and sex are facts about a body and there is no reason
   * for two copies of them. A GOAL IS A DECISION, and Nutrition is where it is
   * taken — it is the goal every meal plan, portion, journal entry and grocery
   * list is built from, and the one the clinical rules (withheld surplus,
   * pregnancy, kidney staging) are applied to. An existing row keeps whatever
   * goal it has; a row created here still needs one, and takes the body goal's
   * as its starting point because that is the only intent on record at that
   * moment.
   */
  async syncNutrition(userId: string) {
    const p = await this.getProfile(userId);
    const program = computeBodyProgram({
      age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg,
      activity: await this.activityFor(userId), bodyGoal: p.bodyGoal,
    });
    const body = { heightCm: p.heightCm ?? undefined, weightKg: p.weightKg ?? undefined, age: p.age, sex: p.sex === 'other' ? undefined : p.sex };
    const existing = await this.prisma.foodPref.findUnique({ where: { userId } });
    await this.prisma.foodPref.upsert({
      where: { userId },
      update: body,
      create: { userId, goal: program.nutrition.goal, ...body },
    });
    return {
      synced: true,
      nutritionGoal: existing?.goal ?? program.nutrition.goal,
      goalWritten: !existing,
      proteinTarget: program.nutrition.proteinTarget,
    };
  }

  /** Conditions the user carries in their Medical records (kind=condition) mapped to fitness keys. */
  private async recordConditions(userId: string): Promise<string[]> {
    // unbounded: clinical completeness — a truncated condition list tailors a program wrongly
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
      entries: rows.map((r) => ({ id: r.id, focus: r.focus, minutes: r.minutes, intensity: r.intensity, style: r.style, note: r.note, doneAt: r.doneAt.toISOString() })),
      weekMinutes: week.reduce((s, r) => s + r.minutes, 0),
      weekSessions: week.length,
    };
  }

  async addLog(userId: string, dto: LogWorkoutDto) {
    await this.prisma.workoutLog.create({
      data: {
        userId, focus: dto.focus, minutes: dto.minutes, intensity: dto.intensity,
        // `?? null` and not a default: empty means nobody was asked, and the
        // rows written before 17 Aug have to keep meaning that.
        style: dto.style ?? null,
        note: dto.note ?? null,
      },
    });
    return this.log(userId);
  }

  /**
   * ── AN ENTRY IS ITS OWNER'S TO CHANGE, AND NOBODY ELSE'S ──────────────────
   *
   * `updateMany`/`deleteMany` with the userId IN THE WHERE, rather than a
   * findUnique-then-check: the scope is part of the query the database runs, so
   * there is no window between reading a row and deciding about it, and no
   * branch a later edit can forget to keep. It is also why the COUNT is the
   * authorisation answer - 0 means "no row of yours has that id", and that is
   * the same reply whether the id is fictional or belongs to another citizen.
   * A 404 that distinguishes the two is a membership oracle.
   */
  async editLog(userId: string, id: string, dto: EditWorkoutDto) {
    const { count } = await this.prisma.workoutLog.updateMany({
      where: { id, userId },
      // Only the keys the caller actually sent. Spreading the whole dto would
      // write `undefined` over fields nobody mentioned, which is how an edit to
      // the duration silently erases a note.
      data: {
        ...(dto.focus !== undefined ? { focus: dto.focus } : {}),
        ...(dto.minutes !== undefined ? { minutes: dto.minutes } : {}),
        ...(dto.intensity !== undefined ? { intensity: dto.intensity } : {}),
        ...(dto.style !== undefined ? { style: dto.style } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    if (count === 0) throw new NotFoundException('No workout of yours with that id');
    return this.log(userId);
  }

  async removeLog(userId: string, id: string) {
    const { count } = await this.prisma.workoutLog.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('No workout of yours with that id');
    return this.log(userId);
  }
}

/** The city's day — India's, not the server's. A session logged at 11 pm in
 *  Bengaluru belongs to that day, not to the next one in Greenwich. */
function cityDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The library's pattern a catalogue muscle answers to, for the session's rows. */
function patternOfMuscle(m: Muscle): Pattern {
  if (m === 'pectorals' || m === 'delts' || m === 'triceps') return 'push';
  if (m === 'lats' || m === 'upper back' || m === 'biceps' || m === 'traps' || m === 'forearms') return 'pull';
  if (m === 'quads' || m === 'calves') return 'squat';
  if (m === 'hamstrings' || m === 'glutes') return 'hinge';
  return 'core';
}
