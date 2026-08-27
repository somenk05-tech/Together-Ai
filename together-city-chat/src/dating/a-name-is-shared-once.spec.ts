/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── A NAME IS SHARED ONCE, AND AN EMPTY LIST COSTS ONE QUERY ──
 *
 * Two things the launch audit found in the same corner, both about work done on
 * every request rather than on every change.
 *
 * REVEAL. The push sat outside any comparison with the flag's previous value,
 * so re-POSTing { show: true } re-sent "Your match shared their name 👀" every
 * time. `like` had exactly this bug and was fixed the same morning; reveal was
 * not looked at, and unlike `like` it costs no daily allowance and carried no
 * throttle of its own — a free notification channel pointed at somebody you had
 * matched with.
 *
 * THE CHATS LIST. The dashboard polls /dating/chats for every signed-in citizen
 * four times a minute, whether or not they have ever opened the hub, and six
 * reads ran regardless — each an `IN ()` over an empty list. Somebody with no
 * matches has no chats, and that answer is one query.
 */
function build(state: any) {
  const notifications = { create: jest.fn(async () => ({})) };
  const conversations = { setAnonymousTrust: jest.fn(async () => undefined), summariesFor: jest.fn(async () => new Map()) };
  const prisma: any = {
    datingMatch: {
      findFirst: jest.fn(async () => state),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: any) => ({ ...state, ...data })),
    },
    datingProfile: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    compatibilityScore: { findMany: jest.fn(async () => []) },
  };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
    notifications as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: jest.fn(() => undefined) } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  (svc as any).assertMayReach = async () => undefined;
  (svc as any).assertWritable = async () => undefined;
  return { svc, prisma, notifications, conversations };
}

const match = (over: any = {}) => ({
  id: 'm1', userOneId: 'me', userTwoId: 'them', conversationId: 'c1',
  revealByOne: false, revealByTwo: false, ...over,
});

describe('sharing your name', () => {
  it('tells them, the first time', async () => {
    const { svc, notifications } = build(match());
    await svc.reveal('me', 'them', 'romantic', true);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('says nothing on a re-POST of the same choice', async () => {
    const { svc, notifications } = build(match({ revealByOne: true }));
    await svc.reveal('me', 'them', 'romantic', true);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('says nothing when hiding your name again', async () => {
    const { svc, notifications } = build(match({ revealByOne: true }));
    await svc.reveal('me', 'them', 'romantic', false);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('says nothing when they had already revealed — that is a match, not an announcement', async () => {
    const { svc, notifications } = build(match({ revealByTwo: true }));
    await svc.reveal('me', 'them', 'romantic', true);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('the dating chats list for somebody with no matches', () => {
  it('is empty, and costs exactly one query', async () => {
    const { svc, prisma, conversations } = build(match());
    expect(await svc.datingChats('nobody')).toEqual([]);
    expect(prisma.datingMatch.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.datingProfile.findMany).not.toHaveBeenCalled();
    expect(prisma.compatibilityScore.findMany).not.toHaveBeenCalled();
    expect(conversations.summariesFor).not.toHaveBeenCalled();
  });
});
