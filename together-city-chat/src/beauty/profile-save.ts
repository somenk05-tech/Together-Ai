import { z } from 'zod';

/**
 * THE SAVE THAT NEVER LANDED.
 *
 * Every save of the Beauty profile after a photo analysis was being thrown
 * away, and nothing said so. Here is the chain:
 *
 *   1. analyzePhotos() fills in a "Don't know" answer from what the photos
 *      show, and records WHICH answers it guessed in `extras.aiEstimated`
 *      (`{ skinType: true }`) so the form can say "AI-estimated — review and
 *      edit anytime". That is right: a guess must be labelled as one.
 *   2. GET /beauty/profile returns `extras` whole, and the form is
 *      `{ ...EMPTY, ...saved }` — so `aiEstimated` becomes a form field.
 *   3. Save PUTs the whole form. The controller's schema allowed strings,
 *      numbers, booleans, null and string lists — an OBJECT was a 400.
 *   4. The page rendered `save.isSuccess` and nothing else. The button said
 *      "Save profile", the citizen edited, tapped, and saw the old answers
 *      again on the next visit.
 *
 * So the one honest thing the analysis did — labelling its own guesses —
 * locked the record against every later edit. This module is the schema and
 * the merge, kept apart from the service (which drags in sharp via medical)
 * so the rule can be tested directly.
 */

export const MAX_PROFILE_FIELDS = 80;

/** One questionnaire answer: a primitive or a list of strings. */
const Answer = z.union([
  z.string().max(2000), z.number(), z.boolean(), z.null(),
  z.array(z.string().max(300)).max(50),
]);

/** The flags the analysis wrote. Accepted on the wire so an old client that
 *  echoes them back is not rejected; never trusted — see carryEstimates(). */
const Estimates = z.record(z.string().max(64), z.boolean()).refine((o) => Object.keys(o).length <= 20, 'too many estimates');

export const BeautyProfileSchema = z.object({
  aiEstimated: Estimates.optional(),
}).catchall(Answer).refine((o) => Object.keys(o).length <= MAX_PROFILE_FIELDS, 'too many fields');

export const AI_ESTIMATED = 'aiEstimated';

/**
 * What goes into `extras` on save.
 *
 * The client's copy of `aiEstimated` is discarded — the flags belong to the
 * analysis, not to the form. The flags already on file are carried over,
 * except for any answer the citizen has now CHANGED: once a person has
 * corrected the skin type, it is their answer, not the model's guess, and the
 * "AI-estimated" label must come off it. An answer left exactly as the model
 * set it keeps its label.
 */
export function carryEstimates(
  previous: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const { [AI_ESTIMATED]: _dropped, ...answers } = incoming;
  void _dropped;
  const prevFlags = previous?.[AI_ESTIMATED];
  if (!prevFlags || typeof prevFlags !== 'object') return answers;
  const kept: Record<string, boolean> = {};
  for (const [field, on] of Object.entries(prevFlags as Record<string, unknown>)) {
    if (on !== true) continue;
    if (same(previous?.[field], answers[field])) kept[field] = true;
  }
  return Object.keys(kept).length ? { ...answers, [AI_ESTIMATED]: kept } : answers;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}
