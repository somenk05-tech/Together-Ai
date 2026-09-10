/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';
import { HIDDEN, REMOVED, VISIBLE, VISIBLE_ONLY, visibleToViewer } from './post-visibility';

/**
 * ── A POST YOU CAN PUT AWAY ─────────────────────────────────────────────────
 *
 * Owner, 10 Sep: "let users hide posts — photos, videos and thoughts — along
 * with edit and delete post tabs."
 *
 * Hidden is a third value of Post.moderation, so every read that already
 * spreads VISIBLE_ONLY drops it with no new filter; the author's own grid,
 * which does not filter on moderation, keeps it. What these hold is the
 * transition: the author moves a post between visible and hidden, nobody else
 * can, and a moderator's removal is never undone or laundered by it.
 */
const ME = 'me-0000';
const THEM = 'them-0000';

function rig(row: { authorId: string; moderation: string } | null) {
  const writes: any[] = [];
  const prisma = {
    post: {
      findUnique: jest.fn(async () => row),
      updateMany: jest.fn(async (a: any) => { writes.push(a); return { count: 1 }; }),
    },
  } as any;
  const svc = new SocialService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, writes };
}

describe('hiding a post', () => {
  it('moves the author’s visible post to hidden, scoped to the state it leaves', async () => {
    const { svc, writes } = rig({ authorId: ME, moderation: VISIBLE });
    await expect(svc.setHidden(ME, 'p1', true)).resolves.toEqual({ id: 'p1', hidden: true });
    expect(writes[0]).toEqual({ where: { id: 'p1', authorId: ME, moderation: VISIBLE }, data: { moderation: HIDDEN } });
  });

  it('brings a hidden post back', async () => {
    const { svc, writes } = rig({ authorId: ME, moderation: HIDDEN });
    await expect(svc.setHidden(ME, 'p1', false)).resolves.toEqual({ id: 'p1', hidden: false });
    expect(writes[0].data).toEqual({ moderation: VISIBLE });
  });

  it('is the author’s alone', async () => {
    const { svc, writes } = rig({ authorId: THEM, moderation: VISIBLE });
    await expect(svc.setHidden(ME, 'p1', true)).rejects.toThrow('not your post');
    expect(writes).toEqual([]);
  });

  it('never touches a post a moderator removed — in either direction', async () => {
    for (const hidden of [true, false]) {
      const { svc, writes } = rig({ authorId: ME, moderation: REMOVED });
      await expect(svc.setHidden(ME, 'p1', hidden)).rejects.toThrow(/moderator removed/);
      expect(writes).toEqual([]);
    }
  });

  it('says what is true when asked for what is already so, and writes nothing', async () => {
    const { svc, writes } = rig({ authorId: ME, moderation: HIDDEN });
    await expect(svc.setHidden(ME, 'p1', true)).resolves.toEqual({ id: 'p1', hidden: true });
    expect(writes).toEqual([]);
  });
});

describe('what hidden means to everybody else', () => {
  it('is not visible — the filter every list read spreads does not match it', () => {
    expect(VISIBLE_ONLY.moderation).not.toBe(HIDDEN);
    expect(visibleToViewer({ authorId: ME, moderation: HIDDEN }, THEM)).toBe(false);
  });

  it('is still there for the author', () => {
    expect(visibleToViewer({ authorId: ME, moderation: HIDDEN }, ME)).toBe(true);
  });
});
