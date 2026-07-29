/**
 * What a call is, as rules rather than as writes.
 *
 * Every transition a call can make is decided here, from a plain snapshot, with
 * no database and no clock of its own. The service reads rows, asks this file
 * what should happen, and writes the answer down. That split exists because the
 * interesting cases in a call are the ones nobody wants to reproduce by hand:
 * both people hang up in the same second, a callee declines while a second
 * callee is still ringing, the caller cancels after the callee has answered.
 * Those are three lines of test here and an afternoon of tapping phones there.
 *
 * "Present" means joined and not since left. A participant who was invited but
 * never answered is not present; neither is one who hung up.
 */
export type CallStatus = 'ringing' | 'active' | 'ended';

/** Why a call stopped. Shown to citizens, so the words are the product. */
export type EndedReason = 'completed' | 'declined' | 'missed' | 'cancelled';

export interface ParticipantView {
  userId: string;
  role: 'caller' | 'callee';
  joinedAt: Date | null;
  leftAt: Date | null;
}

export interface CallView {
  status: CallStatus;
  createdById: string;
  participants: ParticipantView[];
}

export interface Transition {
  status: CallStatus;
  endedReason: EndedReason | null;
  /** True when this transition is the moment the call became active. */
  started: boolean;
}

const present = (p: ParticipantView): boolean => p.joinedAt !== null && p.leftAt === null;

/**
 * A call rings for this long before it is a missed call.
 *
 * 45 seconds is roughly where a phone stops being hopeful. Longer and a missed
 * call sits in the recipient's UI as though it were still live; shorter and a
 * person walking back to their desk loses it.
 */
export const RING_TIMEOUT_MS = 45_000;

export function ringExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= RING_TIMEOUT_MS;
}

/**
 * What the call becomes when `userId` joins.
 *
 * A call goes active on the second person, not on the first — the caller is
 * already "in" the moment they dial, and a call with one person in it is a
 * phone ringing, not a conversation.
 */
export function afterJoin(call: CallView, userId: string): Transition {
  if (call.status === 'ended') {
    return { status: 'ended', endedReason: null, started: false };
  }
  const others = call.participants.filter((p) => p.userId !== userId && present(p));
  const active = others.length >= 1;
  return {
    status: active ? 'active' : 'ringing',
    endedReason: null,
    started: active && call.status === 'ringing',
  };
}

/**
 * What the call becomes when `userId` leaves — hang up, decline, or close the tab.
 *
 * The four outcomes read the way a citizen would describe them:
 *
 *   • the caller backs out while it is still ringing → cancelled
 *   • the last person who was being rung says no → declined
 *   • a call that connected loses its second-to-last person → completed
 *   • nobody answers in time → missed (that one comes from the sweep, below)
 *
 * A group call survives a leave as long as two people are still present, which
 * is why this counts rather than special-casing "1:1".
 */
export function afterLeave(call: CallView, userId: string): Transition {
  if (call.status === 'ended') return { status: 'ended', endedReason: null, started: false };

  const others = call.participants.filter((p) => p.userId !== userId);

  if (call.status === 'ringing') {
    if (userId === call.createdById) {
      return { status: 'ended', endedReason: 'cancelled', started: false };
    }
    // Somebody who was being rung declined. If anyone else is still being rung,
    // the call keeps ringing for them.
    const stillRinging = others.some((p) => p.role === 'callee' && p.leftAt === null);
    return stillRinging
      ? { status: 'ringing', endedReason: null, started: false }
      : { status: 'ended', endedReason: 'declined', started: false };
  }

  const stillPresent = others.filter(present);
  return stillPresent.length >= 2
    ? { status: 'active', endedReason: null, started: false }
    : { status: 'ended', endedReason: 'completed', started: false };
}

/**
 * What the call becomes when the ring times out.
 *
 * A call that connected and was then abandoned without anyone hanging up (both
 * tabs closed, say) reads as completed, not missed — it did happen.
 */
export function afterTimeout(call: CallView): Transition {
  if (call.status === 'ended') return { status: 'ended', endedReason: null, started: false };
  return {
    status: 'ended',
    endedReason: call.status === 'active' ? 'completed' : 'missed',
    started: false,
  };
}

/**
 * Whether `userId` may hang the call up for everybody rather than just for
 * themselves. Only the person who started it may; anyone else leaves, and the
 * call ends only if that leave happens to empty it.
 */
export function mayEndForAll(call: CallView, userId: string): boolean {
  return call.createdById === userId;
}

/** Seconds of connected time, or null for a call that never connected. */
export function durationSeconds(startedAt: Date | null, endedAt: Date | null): number | null {
  if (!startedAt || !endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}
