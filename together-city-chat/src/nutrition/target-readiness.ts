/**
 * Do we know enough about this person to compute a target at all? (BE-7.4)
 *
 * The ticket's words are "refuse to compute (and say so) when height/weight/DOB/
 * sex are missing". Today the service does the opposite: `computeTargets` falls
 * back to REFERENCE_BODY — a 70 kg, 172 cm, 30-year-old man — and reports which
 * fields it substituted in `assumed[]`.
 *
 * That flag was an improvement on saying nothing, and it is still not enough.
 * A calorie target computed from a stranger's body is not an approximation of
 * this person's requirement; it is a number about somebody else, rendered on
 * their screen, in the same typeface as the numbers that are about them. A
 * 52 kg woman is shown a man's maintenance energy and told it is hers. The
 * honest answer is to say what is missing and ask for it.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. The refusal is one decision made in one
 * place; the hard part of BE-7.4 is everything downstream — every hub that reads
 * a target has to render "we need two more things from you" instead of a plan.
 * Getting the decision right and tested first means that change is mechanical
 * rather than a judgement call repeated in eight components.
 *
 * The list is deliberately the ticket's four and no more. Activity level and
 * goal have defensible defaults (sedentary, maintain) that are true of a real
 * population and do not fabricate a body. Height, weight, age and sex do not:
 * there is no honest default for how much somebody weighs.
 */

/**
 * What the energy equation cannot be run without.
 *
 * `age` rather than the ticket's `dateOfBirth` because age is what this app
 * currently stores and asks for. DB-3.1 wants date of birth stored with age
 * derived from it — a stored age is wrong for up to a year and drifts quietly —
 * and when that lands, this key and its label change together.
 */
export type RequiredField = 'heightCm' | 'weightKg' | 'age' | 'sexAtBirth';

export interface MissingField {
  field: RequiredField;
  /** What to call it on screen. */
  label: string;
  /** Why it is needed, in one line, because being asked without a reason reads as nosiness. */
  why: string;
  /** Where to send them. FE-7.1: "links straight to the profile field". */
  href: string;
}

/**
 * The Master Profile screen, which is now where these four are owned.
 *
 * This link has moved twice and the history is the point. It began at
 * /profile#body and /profile#identity — anchors that did not exist, on a page
 * that does not hold these fields at all, so it would have sent somebody
 * somewhere they could not answer. It then pointed at /nutrition/preferences,
 * which was truthful and ugly: a nutrition page owning a citizen's sex and date
 * of birth is precisely the thing §3 is about.
 *
 * FE-3.1 built the screen the master profile API had been missing, so the link
 * finally points at the place that owns the field. One constant, so the next
 * move is one line.
 */
const EDIT_HREF = '/profile/master';
const anchorFor = (section: 'identity' | 'body') => `${EDIT_HREF}#${section}`;

const FIELDS: Record<RequiredField, Omit<MissingField, 'field'>> = {
  heightCm: {
    label: 'Height',
    why: 'The energy equation uses it directly — without it there is no resting-energy figure to start from.',
    href: anchorFor('body'),
  },
  weightKg: {
    label: 'Weight',
    why: 'Everything scales from it: your energy, your protein, and how much water to aim for.',
    href: anchorFor('body'),
  },
  age: {
    label: 'Age',
    why: 'Energy needs fall with age, and several nutrient targets are set by age band.',
    href: anchorFor('identity'),
  },
  sexAtBirth: {
    label: 'Sex at birth',
    why: 'It changes the equation by a fixed amount and sets the lowest safe calorie floor. Asked separately from how you identify.',
    href: anchorFor('identity'),
  },
};

export interface ReadinessInput {
  heightCm?: number | null;
  weightKg?: number | null;
  /** Age. DB-3.1 wants this derived from a stored date of birth, not stored. */
  age?: number | null;
  /** male | female | intersex | preferNotToSay. Only the first two drive the equation. */
  sexAtBirth?: string | null;
}

export type Readiness =
  | { ok: true }
  | { ok: false; missing: MissingField[]; headline: string; body: string };

const PLAUSIBLE = {
  heightCm: { min: 60, max: 260 },
  weightKg: { min: 15, max: 400 },
  age: { min: 1, max: 120 },
};

/**
 * `intersex` and `preferNotToSay` are ANSWERED, and they are answers the
 * Mifflin–St Jeor constant cannot use — it has two values and no third.
 *
 * Treating them as missing would tell somebody who filled the field in honestly
 * that they left it blank, which is worse than useless. They are handled as
 * their own case: the profile is complete, the equation still cannot run, and
 * the copy says so rather than asking again.
 */
export function clinicalSexUsable(sexAtBirth?: string | null): boolean {
  const s = (sexAtBirth ?? '').toLowerCase();
  return s === 'male' || s === 'female';
}

function present(v: number | null | undefined, range: { min: number; max: number }): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= range.min && v <= range.max;
}

/**
 * Can a target be computed, and if not, what exactly is missing?
 *
 * Implausible values count as missing rather than being clamped. A 3 cm height
 * is a typo, and silently treating it as 3 cm produces a confident, absurd
 * number; silently clamping it to 60 cm produces a confident, wrong one.
 */
export function targetReadiness(inp: ReadinessInput): Readiness {
  const missing: MissingField[] = [];
  const need = (field: RequiredField) => missing.push({ field, ...FIELDS[field] });

  if (!present(inp.heightCm, PLAUSIBLE.heightCm)) need('heightCm');
  if (!present(inp.weightKg, PLAUSIBLE.weightKg)) need('weightKg');
  if (!present(inp.age, PLAUSIBLE.age)) need('age');

  const sexAnswered = Boolean((inp.sexAtBirth ?? '').trim());
  if (!sexAnswered) need('sexAtBirth');

  if (missing.length === 0 && clinicalSexUsable(inp.sexAtBirth)) return { ok: true };

  // Answered, and unusable. A different sentence from "you have not told us".
  if (missing.length === 0) {
    return {
      ok: false,
      missing: [],
      headline: 'We can’t work out your daily targets from what the equation needs.',
      body: 'The calculation this app uses only has two settings for sex at birth, and yours is not one of them. '
        + 'Rather than pick one for you and present the result as yours, we would rather not guess. '
        + 'Your food preferences, allergies and medical conditions still shape everything else.',
    };
  }

  const names = missing.map((m) => m.label.toLowerCase());
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return {
    ok: false,
    missing,
    headline: `Add your ${list} and we’ll work out your daily targets.`,
    body: 'We would rather ask than guess. A calorie or protein figure worked out from someone else’s body '
      + 'is not an estimate of yours — it is a number about a different person, and it would sit on this '
      + 'screen looking exactly like the ones that are about you.',
  };
}

/** Just the field names, for logging and for the `assumed[]` bridge. */
export const requiredFields = (r: Readiness): RequiredField[] =>
  r.ok ? [] : r.missing.map((m) => m.field);
