/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';

/**
 * ── A TAP DOES NOT WAIT FOR THE FAN-OUT ─────────────────────────────────────
 *
 * Every heart tap, comment, post, share and delete AWAITED `postRecipients`
 * before replying to the citizen. That read is the author's connections plus up
 * to FANOUT_MAX followers plus their block set — two or three queries and up to
 * two thousand rows — in front of a write that is one delete and one count.
 *
 * And it is for a websocket frame nobody receives. The docblock on
 * `postRecipients` recorded that on 30 Aug; I checked it again rather than
 * trusting it, because "nothing listens" is exactly the kind of claim this
 * project has been wrong about before. The web app subscribes to sixteen
 * socket events — messages, typing, presence, calls, notifications,
 * connections — and not one is a social post, like or comment.
 *
 * So the broadcasts stay (the day the feed listens, this is what it listens
 * to) and they happen AFTER the answer goes out.
 *
 * ── HOW THIS IS ASSERTED, AND WHY NOT BY STUBBING THE METHOD ────────────────
 *
 * The obvious test replaces `postRecipients` with a spy and checks it was not
 * awaited. That proves something about one private method and nothing about
 * the request. This makes the GRAPH READS HANG — a promise that never settles,
 * which is the honest model of a slow database — and asserts the citizen still
 * gets their answer. It fails if anybody puts an await back, wherever they put
 * it, and it fails for the reason a citizen would notice.
 */

const ME = 'me-0000';
const AUTHOR = 'them-1111';

/** A prisma whose FAN-OUT reads never settle, and whose write path is instant. */
function rig() {
  const started: string[] = [];
  const hang = () => new Promise<never>(() => { /* never settles: a database that has stopped answering */ });
  const prisma = {
    post: {
      findUnique: async () => ({ id: 'p1', authorId: AUTHOR, audience: 'public' }),
    },
    like: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 1 }),
      count: async () => 7,
    },
    // The two reads postRecipients makes. Neither ever answers.
    connection: { findMany: async () => { started.push('connections'); return hang(); } },
    follow: { findMany: async () => { started.push('follows'); return hang(); } },
    user: { findUnique: async () => ({ name: 'Someone' }) },
  } as any;

  const gateway = { likeChanged: jest.fn() } as any;
  const notifications = { create: jest.fn(async () => undefined) } as any;
  const blocking = { blockedWith: async () => new Set<string>() } as any;
  const svc = new SocialService(
    prisma, gateway, notifications, {} as never, {} as never, blocking, {} as never,
  );
  return { svc, gateway, started };
}

describe('a heart tap answers before the fan-out does', () => {
  it('returns the new like count while the graph reads are still hanging', async () => {
    const { svc } = rig();
    // No timeout, no race: if the fan-out is awaited this simply never
    // resolves and the test fails as a timeout, which is precisely what the
    // citizen experiences.
    await expect(svc.toggleLike(ME, 'p1')).resolves.toEqual({ postId: 'p1', liked: true, likes: 7 });
  });

  it('has not broadcast yet, because there is nobody to broadcast to yet', async () => {
    // The frame is sent when the recipients arrive. It is not sent from the
    // request, and the request does not care.
    const { svc, gateway } = rig();
    await svc.toggleLike(ME, 'p1');
    expect(gateway.likeChanged).not.toHaveBeenCalled();
  });

  it('still STARTS the fan-out — deferred is not dropped', async () => {
    // The distinction that matters: this is not "the broadcast was removed".
    // The day the feed listens to these frames, they have to be sent.
    const { svc, started } = rig();
    await svc.toggleLike(ME, 'p1');
    await Promise.resolve();
    expect(started).toContain('connections');
  });

  it('sends the frame once the recipients do arrive', async () => {
    const gateway = { likeChanged: jest.fn() } as any;
    const prisma = {
      post: { findUnique: async () => ({ id: 'p1', authorId: AUTHOR, audience: 'public' }) },
      like: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }), count: async () => 3 },
      connection: { findMany: async () => [] },
      follow: { findMany: async () => [{ followerId: 'f1' }] },
      user: { findUnique: async () => ({ name: 'Someone' }) },
    } as any;
    const svc = new SocialService(
      prisma, gateway, { create: jest.fn(async () => undefined) } as any, {} as never, {} as never,
      { blockedWith: async () => new Set<string>() } as any, {} as never,
    );
    await svc.toggleLike(ME, 'p1');
    // Let the deferred chain run.
    await new Promise((r) => setTimeout(r, 0));
    expect(gateway.likeChanged).toHaveBeenCalledTimes(1);
    expect(gateway.likeChanged.mock.calls[0][0]).toEqual({ postId: 'p1', liked: true, likes: 3 });
  });
});
