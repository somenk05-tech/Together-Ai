import { FREE_NEW_THREADS_PER_DAY, gateLifted, type Tier } from './trust';

/**
 * FIVE NEW NEIGHBOURS A DAY, AND WHAT HAPPENS TO THE SIXTH.
 *
 * The owner's rule, made precise. An unverified listing is given five NEW
 * conversations a day; the rest wait. This file is the whole rule, as pure
 * functions over counts and dates — the service does the reading and the
 * writing, this decides.
 *
 * WHAT IS COUNTED IS NEW THREADS, NOT MESSAGES. Counting messages would eat
 * the allowance on a back-and-forth and charge a business for answering the
 * neighbour it already has, which is the opposite of what the cap is for. A
 * conversation already open is never touched by any of this.
 *
 * AND IT IS A QUEUE, NOT A WALL. The sixth citizen sends normally and is told
 * nothing; the thread exists, the message is stored, and it is the BUSINESS
 * that carries the cost — no thread in the inbox, no notification, and a count
 * of people waiting on its verification tab. Held threads are released
 * oldest-first into the following day's allowance, so nothing is refused and
 * nothing is lost. Verifying releases all of them at once, which is the entire
 * incentive.
 *
 * THE COST OF THIS SHAPE, NAMED HERE SO IT IS NOT DISCOVERED LATER: the sixth
 * citizen writes into a room nobody is in and hears nothing back. They will
 * conclude the business ignored them. That is a real cost paid by a neighbour
 * for a decision the business made, and the alternative — refusing them at the
 * door — is worse. If it is ever softened, the line belongs in the thread and
 * it must not say "unverified" out loud.
 */

/**
 * A CALENDAR DAY, IN UTC — the same boundary Daily Offers uses, which puts the
 * reset at 5:30am IST. Nobody's midnight, and one rule in this codebase rather
 * than two. A per-business timezone would be the honest version and it needs a
 * timezone column that does not exist.
 */
export const dayStartUtc = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** How many more new threads this listing may be given today. */
export function allowanceLeft(tier: Tier, openedToday: number): number {
  if (gateLifted(tier)) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_NEW_THREADS_PER_DAY - openedToday);
}

/**
 * Is this new thread handed over, or held?
 *
 * Note it is only ever asked about a NEW thread. An existing one has already
 * been given away and cannot be taken back — a room that was open on Monday
 * and gone on Tuesday is worse than one that was never opened.
 */
export const shouldHold = (tier: Tier, openedToday: number): boolean =>
  allowanceLeft(tier, openedToday) <= 0;

/**
 * WHICH HELD THREADS COME OUT NOW, OLDEST FIRST.
 *
 * Oldest first is the only defensible order: the neighbour who has waited
 * longest is the one owed the answer, and any other order lets a busy day bury
 * somebody indefinitely. Called lazily when the owner opens their inbox, so
 * there is no scheduler to run, nothing to drift, and the whole thing is one
 * pure function with a test.
 */
export function releasable<T extends { id: string; createdAt: Date }>(
  held: T[], tier: Tier, openedToday: number,
): T[] {
  const room = allowanceLeft(tier, openedToday);
  if (room <= 0) return [];
  const queue = [...held].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return Number.isFinite(room) ? queue.slice(0, room) : queue;
}

/**
 * The sentence the owner reads. Said as people waiting, not as a limit
 * consumed: "3 neighbours are waiting" is a fact about somebody who wants
 * something from them, and "you have used 5 of 5" is a fact about a policy.
 * Only one of those gets a form filled in.
 */
export function waitingSentence(waiting: number, freePerDay = FREE_NEW_THREADS_PER_DAY): string {
  if (waiting <= 0) return `${freePerDay} new neighbours a day until you verify.`;
  return waiting === 1
    ? '1 neighbour is waiting to reach you.'
    : `${waiting} neighbours are waiting to reach you.`;
}
