/**
 * What "blocked" means, in one place (BE-13.3).
 *
 * The city had two of them, and they did not know about each other.
 *
 *   - `Block` (blockerId → blockedId) is what the Social hub writes when a
 *     citizen taps Block on someone's profile. It hid their posts and dropped
 *     the follow edges between them.
 *   - `Connection.status = BLOCKED` is what the connection record carries, and
 *     it is the one THE GATE consulted — the gate every message, every call and
 *     every new conversation passes through.
 *
 * So a citizen who blocked someone from the Social hub had their posts hidden
 * and went on receiving their messages. The block did the visible half of the
 * job and none of the half that matters. Nobody would have found this by using
 * the app: it looks exactly like a working block right up until a message
 * arrives.
 *
 * This module is the single answer to "are these two blocked", and it is pure:
 * rows in, decision out, no database. The service beside it does the reading.
 *
 * A note on the connection-level block: the row records that the pair is
 * blocked but not by whom, so there is nothing to recover a direction from. It
 * therefore counts in both directions. Guessing would be worse than admitting
 * it, and treating an unknown as "not blocked" is the one answer a safety
 * check must never give.
 */

export interface BlockRow {
  blockerId: string;
  blockedId: string;
}

export interface ConnectionBlockRow {
  userOneId: string;
  userTwoId: string;
  status: string;
}

export const BLOCKED_STATUS = 'BLOCKED';

/**
 * Which way the block runs, from `me`'s point of view. This exists so the app
 * can tell someone "you blocked them" without telling anyone "they blocked
 * you" — a block nobody is told about is the only kind that is safe to have.
 */
export type BlockDirection = 'none' | 'i-blocked-them' | 'they-blocked-me' | 'both';

export function blockDirection(
  me: string,
  them: string,
  blocks: readonly BlockRow[],
  connections: readonly ConnectionBlockRow[] = [],
): BlockDirection {
  if (!me || !them || me === them) return 'none';

  let mine = false;
  let theirs = false;

  for (const b of blocks) {
    if (b.blockerId === me && b.blockedId === them) mine = true;
    if (b.blockerId === them && b.blockedId === me) theirs = true;
  }

  for (const c of connections) {
    if (c.status !== BLOCKED_STATUS) continue;
    const pair = (c.userOneId === me && c.userTwoId === them) || (c.userOneId === them && c.userTwoId === me);
    if (pair) { mine = true; theirs = true; }   // directionless: counts both ways
  }

  if (mine && theirs) return 'both';
  if (mine) return 'i-blocked-them';
  if (theirs) return 'they-blocked-me';
  return 'none';
}

/** True if the pair may not reach each other, whichever of them did it. */
export function isBlockedPair(
  a: string,
  b: string,
  blocks: readonly BlockRow[],
  connections: readonly ConnectionBlockRow[] = [],
): boolean {
  return blockDirection(a, b, blocks, connections) !== 'none';
}

/**
 * Everyone this user is blocked with, either direction, from both sources.
 * The set a feed, a match list or a search subtracts before it shows anything.
 */
export function blockedWith(
  userId: string,
  blocks: readonly BlockRow[],
  connections: readonly ConnectionBlockRow[] = [],
): Set<string> {
  const out = new Set<string>();
  if (!userId) return out;
  for (const b of blocks) {
    if (b.blockerId === userId) out.add(b.blockedId);
    else if (b.blockedId === userId) out.add(b.blockerId);
  }
  for (const c of connections) {
    if (c.status !== BLOCKED_STATUS) continue;
    if (c.userOneId === userId) out.add(c.userTwoId);
    else if (c.userTwoId === userId) out.add(c.userOneId);
  }
  out.delete(userId);
  return out;
}

/**
 * What to say when the gate closes.
 *
 * Only one of these two sentences may name a block, and it is the one said to
 * the person who made it. The other has to be true without being informative:
 * "not accepting" covers a block, and it covers half a dozen other things, and
 * that ambiguity is the point. A message that says "they blocked you" turns the
 * block into a notification and hands over the one fact its owner was trying
 * not to give.
 */
export function blockedMessage(direction: BlockDirection): string {
  if (direction === 'i-blocked-them' || direction === 'both') {
    return 'You have blocked this citizen. Unblock them from their profile if you would like to reach them again.';
  }
  return 'This citizen is not accepting messages right now.';
}
