import { z } from 'zod';
import { UNDER_AGE_MESSAGE, isAdult } from '../../shared/age';
import { HANDLE_MESSAGE, handleProblem, normaliseHandle } from '../dating-handle';

export const MatchKindSchema = z.enum(['romantic', 'platonic']);
export type MatchKind = z.infer<typeof MatchKindSchema>;

/**
 * Create/update the dating profile. Birth details power the astrology-first
 * scoring — and gate the whole hub.
 *
 * THE 18+ RULE LIVES HERE NOW, and where it lives is the fix (owner, 27 Aug,
 * after the launch audit). It used to be a `severity: 'hard'` check inside
 * `moderateProfile`, which runs THIRTY-FIVE LINES AFTER the row is written —
 * and the row is written `visible`, with `moderation` defaulting to approved.
 * For the length of one AI moderation call, a child's profile was in every
 * adult's pool with their photographs on it.
 *
 * A refinement on the DTO throws a 400 before anything is written at all. No
 * row, no window, no rejected-but-still-readable state to clean up afterwards.
 * The special-category consent check already worked this way and was the model:
 * the thing you must not get wrong is the thing you refuse at the door.
 *
 * The moderation check STAYS as well, deliberately — it is what catches a date
 * of birth that arrived by some other path, and a rule enforced in one place
 * is a rule with one place to forget it.
 */
export const UpsertDatingProfileSchema = z.object({
  /**
   * THE NAME THEY DATE UNDER, refused at the door like the age is.
   *
   * Shape only — whether somebody already holds it, and whether the city holds
   * it, are database questions and live in the service. What is settled here
   * is that a save without a usable handle never becomes a row.
   */
  handle: z.string().transform(normaliseHandle).superRefine((h, ctx) => {
    const problem = handleProblem(h);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: HANDLE_MESSAGE[problem] });
  }),
  gender: z.enum(['male', 'female', 'nonbinary']),
  seeking: z.enum(['male', 'female', 'nonbinary', 'any']),
  bio: z.string().max(600).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  birthPlace: z.string().max(120).optional(),
  interests: z.array(z.string().min(1).max(40)).max(20).optional(),
  extras: z.string().max(2_000_000).optional(), // JSON blob (incl. photos as data URLs)
  visible: z.boolean().optional(),
}).refine((v) => isAdult(v.birthDate), {
  message: UNDER_AGE_MESSAGE,
  path: ['birthDate'],
});
export type UpsertDatingProfileDto = z.infer<typeof UpsertDatingProfileSchema>;

export const MatchesQuerySchema = z.object({
  kind: MatchKindSchema.default('romantic'),
  /** The best N, after ranking. Absent: the whole list, as before. */
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type MatchesQueryDto = z.infer<typeof MatchesQuerySchema>;

/** Report a match. The reason is the reporter's own words — kept, never edited,
 *  and read only by a moderator. Optional: "this person" is often the report. */
export const ReportMatchSchema = z.object({
  kind: MatchKindSchema.default('romantic'),
  reason: z.string().max(500).optional(),
});
export type ReportMatchDto = z.infer<typeof ReportMatchSchema>;


/**
 * A moderator's decision on a dating profile. 'approved' puts it back in the
 * pool, 'rejected' takes it out for good; 'review' is the state the automatic
 * pass can leave a profile in, and until now nothing could move a profile out
 * of it — `adminStats` counted the queue and no endpoint could drain it.
 */
export const ModerationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  // Required, since the decision is recorded through the console's act().
  reason: z.string().trim().min(3, 'Say why, in a sentence.').max(500),
});
export type ModerationDecisionDto = z.infer<typeof ModerationDecisionSchema>;

export const PhotoDecisionSchema = z.object({
  key: z.string().min(1).max(300),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(3, 'Say why, in a sentence.').max(500),
});

export const AppealSchema = z.object({
  kind: z.enum(['dating_profile', 'dating_photo']),
  targetId: z.string().max(300).optional(),
  text: z.string().trim().min(10, 'Tell us what you think we got wrong.').max(2000),
});

export const AppealDecisionSchema = z.object({
  decision: z.enum(['upheld', 'overturned']),
  reason: z.string().trim().min(3, 'Say why, in a sentence.').max(500),
});

export const FunnelQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
