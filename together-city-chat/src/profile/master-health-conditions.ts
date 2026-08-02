/**
 * THE ONLY THING ALLOWED TO DECIDE WHAT REACHES THE THREE HEALTH COLUMNS.
 *
 * `shared/health-conditions.ts` says what the words mean. This says how they
 * are stored, and it is deliberately the one place that knows, because the
 * three columns are not independent: a trimester without a pregnancy is not a
 * fact about anybody, and unticking pregnancy has to CLEAR it rather than
 * leave it behind for a later re-tick to resurrect.
 *
 * TWO ASYMMETRIES, both on purpose:
 *
 * · THE WRITE REFUSES AN UNKNOWN KEY. THE READ DROPS IT. A write carrying a
 *   key this app does not know is a bug in the caller, and storing it would
 *   put a clinical label in a citizen's record that nothing can interpret. A
 *   read carrying one is a row written before the vocabulary changed, and
 *   throwing there would make an old row unopenable — the citizen would lose
 *   the profile page, not just the key.
 * · NULL AND 'none' ARE DIFFERENT ANSWERS. Nobody asked, versus asked and
 *   ticked nothing. The empty string is never written: mergeShared() skips ''
 *   as a gap to be filled from a hub source, so an empty answer stored that
 *   way would disappear on the next read and reappear as "not asked".
 */
import {
  HEALTH_CONDITIONS,
  healthConditionFrom,
  kidneyStageFrom,
  trimesterFrom,
  type HealthCondition,
  type KidneyStage,
  type Trimester,
} from '../shared/health-conditions';

/** Asked, and nothing ticked. A value, not an absence. */
export const NONE_DECLARED = 'none';

/** The three columns, exactly as they sit on MasterProfile. */
export interface HealthConditionColumns {
  healthConditions: string | null;
  pregnancyTrimester: string | null;
  kidneyStage: string | null;
}

/** What a row says, once the columns have been read together. */
export interface DeclaredHealth {
  /** False means nobody has asked. It does NOT mean the citizen has nothing. */
  asked: boolean;
  keys: HealthCondition[];
  /** Present only when `pregnancy` is declared. Absent = not answered;
   *  'unstated' = answered, would rather not say. */
  trimester?: Trimester;
  /** Present only when `kidney` is declared. Absent = not answered;
   *  'unstated' = answered, does not know the stage. */
  kidneyStage?: KidneyStage;
}

export interface DeclaredHealthInput {
  keys: readonly string[];
  trimester?: string | null;
  kidneyStage?: string | null;
}

/**
 * The citizen's answer, as three column values.
 *
 * Throws on a key or qualifier this app does not know rather than dropping it —
 * see the asymmetry note above.
 */
export function serialiseDeclaredHealth(input: DeclaredHealthInput): HealthConditionColumns {
  const seen = new Set<HealthCondition>();
  for (const raw of input.keys) {
    const key = healthConditionFrom(raw);
    if (!key) throw new Error(`not a health condition: ${JSON.stringify(raw)}`);
    seen.add(key);
  }
  // Canonical order, so two citizens who ticked the same boxes hold identical
  // strings and a diff of the audit trail means something.
  const keys = HEALTH_CONDITIONS.filter((k) => seen.has(k));

  let trimester: string | null = null;
  if (seen.has('pregnancy') && input.trimester != null && input.trimester !== '') {
    const t = trimesterFrom(input.trimester);
    if (!t) throw new Error(`not a trimester: ${JSON.stringify(input.trimester)}`);
    trimester = t;
  }

  let stage: string | null = null;
  if (seen.has('kidney') && input.kidneyStage != null && input.kidneyStage !== '') {
    const s = kidneyStageFrom(input.kidneyStage);
    if (!s) throw new Error(`not a kidney stage: ${JSON.stringify(input.kidneyStage)}`);
    stage = s;
  }

  return {
    healthConditions: keys.length ? keys.join(',') : NONE_DECLARED,
    pregnancyTrimester: trimester,
    kidneyStage: stage,
  };
}

/**
 * What a stored row says. Never throws: a row written before the vocabulary
 * changed still has to open.
 */
export function readDeclaredHealth(
  row: Partial<HealthConditionColumns> | null | undefined,
): DeclaredHealth {
  const raw = row?.healthConditions;
  if (raw == null || raw.trim() === '') return { asked: false, keys: [] };
  if (raw.trim() === NONE_DECLARED) return { asked: true, keys: [] };

  const seen = new Set<HealthCondition>();
  for (const part of raw.split(',')) {
    const key = healthConditionFrom(part);
    if (key) seen.add(key);
  }
  const keys = HEALTH_CONDITIONS.filter((k) => seen.has(k));

  const out: DeclaredHealth = { asked: true, keys };
  // A qualifier is surfaced only alongside its condition, even if the column
  // still holds one. Belt and braces with the clearing serialise() does: a row
  // written by an older build, or by hand, must not put a trimester on
  // somebody who is not pregnant.
  if (seen.has('pregnancy')) {
    const t = trimesterFrom(row?.pregnancyTrimester);
    if (t) out.trimester = t;
  }
  if (seen.has('kidney')) {
    const s = kidneyStageFrom(row?.kidneyStage);
    if (s) out.kidneyStage = s;
  }
  return out;
}

/**
 * The columns a Master Profile PATCH body implies, or `{}` when the body does
 * not mention them at all.
 *
 * Exported so the controller has no branch of its own. The three columns move
 * TOGETHER: a body that sends only a trimester changes nothing, because a
 * trimester on its own is not an answer to anything.
 */
export function declaredHealthPatch(
  body: Record<string, unknown>,
): Partial<HealthConditionColumns> {
  // Explicit undefineds, not an empty object: the caller spreads this OVER the
  // request body, and syncShared drops undefined. Returning {} would let a
  // stray `pregnancyTrimester` in the body reach the column on its own.
  const untouched = {
    healthConditions: undefined,
    pregnancyTrimester: undefined,
    kidneyStage: undefined,
  };
  if (!('healthConditions' in body)) return untouched;
  const raw = body.healthConditions;
  // An explicit null is "forget what I told you", and it takes the qualifiers
  // with it — the whole answer goes back to never-asked.
  if (raw == null) return { healthConditions: null, pregnancyTrimester: null, kidneyStage: null };
  return serialiseDeclaredHealth({
    keys: raw as readonly string[],
    trimester: (body.pregnancyTrimester as string | null | undefined) ?? null,
    kidneyStage: (body.kidneyStage as string | null | undefined) ?? null,
  });
}
