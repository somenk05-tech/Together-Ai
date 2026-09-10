/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';

/**
 * Owner, 10 Sep: "fix the share button — let the user sharing write on top
 * what they feel about the video they are sharing." The note is the share
 * row's own text; the feed prints it above the post the share carries.
 */
const ME = 'me-0000';
const THEM = 'them-0000';

function rig(existing: { id: string } | null) {
  const created: any[] = [];
  const updated: any[] = [];
  const prisma = {
    post: {
      findFirst: jest.fn(async (a: any) => (a.where.repostOfId ? existing : { id: 'p1', authorId: THEM, audience: 'public', moderation: 'visible', repostOfId: null })),
      create: jest.fn(async (a: any) => { created.push(a); return { id: 'r1', ...a.data, author: { name: 'somen', handle: 'somen' }, likes: [], repostOf: null }; }),
      updateMany: jest.fn(async (a: any) => { updated.push(a); return { count: 1 }; }),
    },
  } as any;
  const svc = new SocialService(prisma, { postNew: jest.fn() } as any, { create: jest.fn(async () => undefined) } as any, {} as never, {} as never, {} as never, {} as never);
  (svc as any).assertCanView = async () => undefined;
  (svc as any).signMediaOf = async () => new Map();
  (svc as any).shapeFeedRow = (r: any) => r;
  (svc as any).broadcast = () => undefined;
  (svc as any).actorName = async () => 'somen';
  return { svc, created, updated };
}

describe('a share says what you feel', () => {
  it('writes the note onto the share row, cleaned like any caption', async () => {
    const { svc, created } = rig(null);
    await svc.repost(ME, 'p1', '  <b>this</b> made my day  ');
    expect(created[0].data).toMatchObject({ authorId: ME, repostOfId: 'p1', text: 'this made my day' });
  });

  it('shares without a note when nothing was written', async () => {
    const { svc, created } = rig(null);
    await svc.repost(ME, 'p1');
    expect(created[0].data.text).toBeNull();
  });

  it('rewrites the note on a second share rather than sharing twice', async () => {
    const { svc, created, updated } = rig({ id: 'r1' });
    await svc.repost(ME, 'p1', 'second thoughts');
    expect(created).toEqual([]);
    expect(updated[0]).toEqual({ where: { id: 'r1', authorId: ME }, data: { text: 'second thoughts' } });
  });

  it('prints the note on the feed row, above the post it carries', () => {
    const svc = new SocialService({} as any, {} as any, {} as any, {} as never, {} as never, {} as never, {} as never);
    (svc as any).shapePost = (o: any) => ({ id: o.id });
    const row = svc['shapeFeedRow']({ id: 'r1', createdAt: new Date('2026-09-10T00:00:00Z'), repostOfId: 'p1', text: 'look at this', author: { name: 'somen', handle: 'somen' }, likes: [], repostOf: { id: 'p1', likes: [] } } as any);
    expect(row).toMatchObject({ id: 'p1', key: 'r1', shareNote: 'look at this', repostedBy: { name: 'somen', handle: 'somen' } });
  });
});
