import {
  afterJoin, afterLeave, afterTimeout, durationSeconds, mayEndForAll, ringExpired,
  RING_TIMEOUT_MS, type CallView, type ParticipantView,
} from './call-state';

/**
 * The cases nobody wants to reproduce by tapping two phones.
 *
 * Each of these is a real way a call goes wrong: both people hang up at once,
 * one of three declines, the caller changes their mind mid-ring. They are cheap
 * here and expensive anywhere else, which is why the rules live in a file with
 * no database in it.
 */
const NOW = new Date('2026-07-29T12:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

const p = (over: Partial<ParticipantView> & { userId: string }): ParticipantView => ({
  role: 'callee', joinedAt: null, leftAt: null, ...over,
});

const call = (over: Partial<CallView> = {}): CallView => ({
  status: 'ringing',
  createdById: 'caller',
  participants: [p({ userId: 'caller', role: 'caller', joinedAt: NOW }), p({ userId: 'callee' })],
  ...over,
});

describe('a call becomes active on the second person', () => {
  it('stays ringing while only the caller is present', () => {
    const solo = call({ participants: [p({ userId: 'caller', role: 'caller', joinedAt: NOW })] });
    expect(afterJoin(solo, 'caller').status).toBe('ringing');
  });

  it('goes active when the callee answers, and says that was the start', () => {
    const move = afterJoin(call(), 'callee');
    expect(move.status).toBe('active');
    expect(move.started).toBe(true);
  });

  it('does not re-start a call that is already active', () => {
    const live = call({
      status: 'active',
      participants: [
        p({ userId: 'caller', role: 'caller', joinedAt: NOW }),
        p({ userId: 'callee', joinedAt: NOW }),
        p({ userId: 'third' }),
      ],
    });
    // startedAt must not be rewritten by a latecomer — the duration is measured
    // from when the call connected, not from the last person to walk in.
    expect(afterJoin(live, 'third')).toEqual({ status: 'active', endedReason: null, started: false });
  });

  it('refuses to revive an ended call', () => {
    expect(afterJoin(call({ status: 'ended' }), 'callee').status).toBe('ended');
  });
});

describe('how a call ends says what happened', () => {
  it('caller backing out mid-ring is cancelled, not declined', () => {
    expect(afterLeave(call(), 'caller')).toMatchObject({ status: 'ended', endedReason: 'cancelled' });
  });

  it('the callee saying no is declined', () => {
    expect(afterLeave(call(), 'callee')).toMatchObject({ status: 'ended', endedReason: 'declined' });
  });

  it('keeps ringing when one of two callees declines', () => {
    const group = call({
      participants: [
        p({ userId: 'caller', role: 'caller', joinedAt: NOW }),
        p({ userId: 'a' }),
        p({ userId: 'b' }),
      ],
    });
    expect(afterLeave(group, 'a').status).toBe('ringing');
  });

  it('ends as declined when the last callee declines', () => {
    const group = call({
      participants: [
        p({ userId: 'caller', role: 'caller', joinedAt: NOW }),
        p({ userId: 'a', leftAt: NOW }),
        p({ userId: 'b' }),
      ],
    });
    expect(afterLeave(group, 'b')).toMatchObject({ status: 'ended', endedReason: 'declined' });
  });

  it('a connected call that loses its second person is completed', () => {
    const live = call({
      status: 'active',
      participants: [
        p({ userId: 'caller', role: 'caller', joinedAt: NOW }),
        p({ userId: 'callee', joinedAt: NOW }),
      ],
    });
    expect(afterLeave(live, 'callee')).toMatchObject({ status: 'ended', endedReason: 'completed' });
  });

  it('a group call survives one person leaving while two remain', () => {
    const live = call({
      status: 'active',
      participants: [
        p({ userId: 'caller', role: 'caller', joinedAt: NOW }),
        p({ userId: 'a', joinedAt: NOW }),
        p({ userId: 'b', joinedAt: NOW }),
      ],
    });
    expect(afterLeave(live, 'b').status).toBe('active');
  });

  it('is a no-op on a call that already ended, so two hang-ups do not fight', () => {
    expect(afterLeave(call({ status: 'ended' }), 'caller').endedReason).toBeNull();
  });
});

describe('the ring has a limit', () => {
  it('is not expired a second early', () => {
    expect(ringExpired(NOW, at(RING_TIMEOUT_MS - 1000))).toBe(false);
    expect(ringExpired(NOW, at(RING_TIMEOUT_MS))).toBe(true);
  });

  it('an unanswered call is missed', () => {
    expect(afterTimeout(call())).toMatchObject({ status: 'ended', endedReason: 'missed' });
  });

  it('an abandoned call that DID connect is completed, not missed', () => {
    // Both tabs closed without a hang-up. It still happened; calling it missed
    // would tell a citizen they never spoke to someone they spoke to.
    expect(afterTimeout(call({ status: 'active' }))).toMatchObject({ endedReason: 'completed' });
  });
});

describe('who may end it for everyone', () => {
  it('is the person who started it, and nobody else', () => {
    expect(mayEndForAll(call(), 'caller')).toBe(true);
    expect(mayEndForAll(call(), 'callee')).toBe(false);
  });
});

describe('duration', () => {
  it('is null for a call that never connected', () => {
    expect(durationSeconds(null, NOW)).toBeNull();
  });

  it('rounds to whole seconds and never goes negative', () => {
    expect(durationSeconds(NOW, at(90_400))).toBe(90);
    expect(durationSeconds(at(1000), NOW)).toBe(0);
  });
});
