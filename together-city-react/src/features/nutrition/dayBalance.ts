/**
 * "Great balance of protein, carbs & healthy fats!"
 *
 * The plan page printed that sentence whenever the WEEK's overall compliance
 * score cleared 80. Three problems in one line.
 *
 *  1. The score is one number over many dimensions. A week badly short on
 *     protein still cleared 80 if carbs and fat carried the average — and the
 *     sentence names protein first.
 *  2. It is a WEEKLY score, and it was rendered in the panel for ONE DAY. The
 *     day beside it could be nothing like the week it came from.
 *  3. When it did not clear 80 the fallback was the week's worst concern, which
 *     has the same problem in reverse: a note about Tuesday shown on Friday.
 *
 * The owner's ruling: a sentence that names three things has to be true of all
 * three. So this compares THIS day's macros against the prescription, each on
 * its own, and when one is off it says which — that is the useful message
 * anyway, and it is the one thing the old code could never produce.
 *
 * THE BANDS ARE NOT SYMMETRIC, ON PURPOSE. Protein only has to clear the floor:
 * eating more protein than the target is not a balance problem and calling it
 * one would be nagging. Carbs and fat are banded on both sides, because "great
 * balance" is a claim about proportion and a day at 160% of its fat target is
 * not balanced however good the protein looks.
 *
 * A target nobody's body was measured for is not a target. When the
 * prescription carries an `assumed` list — computeTargets filled in a reference
 * body because height, weight, age or sex is missing — this refuses to grade
 * the day at all rather than scoring it against a stranger.
 */

export interface DayMacros { protein: number; carbs: number; fat: number }
export interface MacroTargets { protein: number; carb: number; fat: number }

/** Floor for every macro: below this share of target it is short. */
export const UNDER = 0.8;
/** Ceiling for the two that can be over-eaten into imbalance. */
export const OVER = 1.2;

export type BalanceVerdict =
  | { kind: 'balanced' }
  | { kind: 'off'; short: string[]; over: string[] }
  /** No honest target to compare against. */
  | { kind: 'ungraded'; reason: 'assumed' | 'missing' };

const LABEL = { protein: 'protein', carb: 'carbs', fat: 'fat' } as const;

export function dayBalance(
  totals: DayMacros | null | undefined,
  targets: MacroTargets | null | undefined,
  assumed?: readonly string[] | null,
): BalanceVerdict {
  if (assumed && assumed.length > 0) return { kind: 'ungraded', reason: 'assumed' };
  if (!totals || !targets) return { kind: 'ungraded', reason: 'missing' };
  if (!(targets.protein > 0) || !(targets.carb > 0) || !(targets.fat > 0)) {
    return { kind: 'ungraded', reason: 'missing' };
  }

  const short: string[] = [];
  const over: string[] = [];
  const check = (key: keyof typeof LABEL, got: number, target: number, banded: boolean) => {
    const ratio = got / target;
    if (ratio < UNDER) short.push(LABEL[key]);
    else if (banded && ratio > OVER) over.push(LABEL[key]);
  };
  check('protein', totals.protein, targets.protein, false);
  check('carb', totals.carbs, targets.carb, true);
  check('fat', totals.fat, targets.fat, true);

  return short.length === 0 && over.length === 0 ? { kind: 'balanced' } : { kind: 'off', short, over };
}

/** Join a list the way a person would say it. */
const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * What the panel says. Never a bare score — the citizen cannot act on "78".
 */
export function balanceNote(v: BalanceVerdict): string {
  if (v.kind === 'balanced') return 'Protein, carbs and fat all land where they should today.';
  if (v.kind === 'ungraded') {
    return v.reason === 'assumed'
      ? 'These targets assume an average body, because we don’t have yours yet — so there’s nothing here worth grading the day against.'
      : 'No targets to compare today against yet.';
  }
  const parts: string[] = [];
  if (v.short.length) parts.push(`light on ${list(v.short)}`);
  if (v.over.length) parts.push(`heavy on ${list(v.over)}`);
  // Only promise the remainder is fine when there IS a remainder. Three macros
  // are graded; if all three are off, "the rest lands where it should" is the
  // same species of untrue sentence this module was written to remove.
  const allThree = v.short.length + v.over.length >= 3;
  return allThree ? `Today is ${list(parts)}.` : `Today is ${list(parts)} — the rest lands where it should.`;
}

/**
 * THE SAME VERDICT, CUT TO WHAT A DISPLAY LINE CAN CARRY.
 *
 * The menu sheet sets the day's reading twice: once large, as the page's
 * display line, and once beneath it at reading size. Both come from THIS
 * object, not from slicing the sentence above — a display line built by cutting
 * `balanceNote` at its em-dash is a parser for prose that this file controls,
 * and it produces "Today is light on carbs and heavy on fat" the day somebody
 * rewords the note.
 *
 * So it is not a second field and there is nothing for it to drift from: one
 * verdict, two renderings, both computed here.
 */
export function balanceHead(v: BalanceVerdict): string {
  if (v.kind === 'balanced') return 'all where it should be';
  if (v.kind === 'ungraded') {
    return v.reason === 'assumed' ? 'nothing here worth grading' : 'no targets yet';
  }
  const parts: string[] = [];
  if (v.short.length) parts.push(`light on ${list(v.short)}`);
  if (v.over.length) parts.push(`heavy on ${list(v.over)}`);
  return list(parts);
}
