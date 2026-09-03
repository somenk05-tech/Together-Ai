/**
 * WHAT A SUSPENSION HIDES, IN ONE PLACE.
 *
 * `suspendedAt` was written by the console and read in four files, every one of
 * them at the door: jwt.strategy, token.service, auth.service and the console
 * itself. NO CONTENT READ NAMED IT. So suspending an account reported five
 * times for harassment in matchmaking closed the login and nothing else: the
 * DatingProfile was still `visible: true, moderation: 'approved'`, so the
 * account stayed in every citizen's Discover pool, went on being scored, went
 * on being served its signed photographs, and went on being MATCHED with —
 * firing "you have a new match" at the people who reported it, from an account
 * that can never answer. Its posts stayed in the feed.
 *
 * A filter copied into nine `where` clauses is a filter somebody forgets at
 * exactly one of them, and that one is the breach. So it is a VALUE, the same
 * way `VISIBLE_ONLY` is one for a removed post: spread it, and a read that does
 * not spread it is a thing you can see in a diff rather than in a report six
 * weeks later.
 *
 * DELETED AND SUSPENDED TOGETHER. They are not the same event — deletion is the
 * citizen's and reversible for thirty days, suspension is ours and reversible
 * by an admin — and they have the same answer to the only question a content
 * read is asking: may a citizen still reach this person? Splitting them would
 * mean every caller remembering the second one, which is the mistake this file
 * exists to stop.
 *
 * THE MODERATOR'S OWN READS ARE THE EXCEPTION, and they are exceptions on
 * purpose: `reportSubjects` must still show a suspended account, or a queue
 * hides the very thing it was opened to decide about.
 */

/** Spread into a `where` on User itself. */
export const REACHABLE_ACCOUNT = { deletedAt: null, suspendedAt: null } as const;

/** Spread into a relation filter — `user: REACHABLE_USER`, `author: REACHABLE_USER`. */
export const REACHABLE_USER = { is: REACHABLE_ACCOUNT } as const;

/** The same question, asked of a row that has already been read. */
export function accountReachable(
  u: { deletedAt?: Date | null; suspendedAt?: Date | null } | null | undefined,
): boolean {
  if (!u) return false;
  return u.deletedAt == null && u.suspendedAt == null;
}
