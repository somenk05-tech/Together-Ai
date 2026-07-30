/**
 * `answeredAt` — the difference between "we made a row" and "they told us".
 *
 * Registration creates FoodPref, BeautyProfile and FitnessProfile before the
 * citizen has answered anything, and their column defaults read exactly like
 * answers: "everything", "maintain", "normal", "straight", "beginner", and an
 * age of 35. The profile summary reported those as the citizen's own, which is
 * what the review photographed on p1 — a brand-new account describing a person
 * who did not exist.
 *
 * The column cannot be inferred from the values, because "everything" and
 * "maintain" are also perfectly good real answers. So it is stamped explicitly,
 * by the flows where a citizen actually saves something.
 *
 * ON MISSING A CALL SITE: the failure is one-directional and safe. A save that
 * forgets to stamp leaves the hub reading as unanswered, so the summary omits
 * it — under-reporting, which is the direction this whole section is pushing.
 * It can never cause the opposite, which is the bug being fixed. That is why
 * this is a helper applied at known save points rather than a Prisma extension
 * intercepting every write: an extension that silently failed to attach would
 * hide every hub from every citizen, and would do it quietly.
 */

/** Merge `answeredAt` into a write payload. Use on the flows a citizen drives. */
export function answeredNow<T extends object>(data: T, now = new Date()): T & { answeredAt: Date } {
  return { ...data, answeredAt: now };
}
