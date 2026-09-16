/* eslint-disable @typescript-eslint/no-explicit-any */
import { SocialService } from './social.service';

/**
 * "The tag is not working" (owner, 16 Sep). A tag names only the author's own
 * connections, under their real names, and the people tagged or @mentioned
 * are told — only if they can open the post.
 */
const ME = 'me';

function rig(opts: { conns?: string[]; blocked?: string[]; recipients?: string[] } = {}) {
  const told: any[] = [];
  const prisma = {
    connection: {
      findMany: jest.fn(async () => (opts.conns ?? []).map((id) => ({ userOneId: ME, userTwoId: id }))),
    },
    user: {
      findMany: jest.fn(async (a: any) => {
        const all = [
          { id: 'u1', name: 'Together City Nutrition', handle: 'tc.nutrition' },
          { id: 'u2', name: 'Priya Mandal', handle: 'priya' },
          { id: 'u3', name: 'Stranger', handle: 'togethercity' },
        ];
        if (a.where.id) return all.filter((u) => a.where.id.in.includes(u.id));
        return all.filter((u) => a.where.handle.in.includes(u.handle)).map((u) => ({ id: u.id }));
      }),
    },
  } as any;
  const svc = new SocialService(prisma, {} as any, { create: jest.fn(async (n: any) => { told.push(n); }) } as any,
    {} as never, {} as never, {} as never, {} as never);
  (svc as any).blockedWith = async () => new Set(opts.blocked ?? []);
  (svc as any).postRecipients = async () => opts.recipients ?? [ME];
  (svc as any).actorName = async () => 'Somen';
  return { svc: svc as any, told };
}

describe('who a post can tag', () => {
  it('only the author’s connections, named by their own accounts', async () => {
    const { svc } = rig({ conns: ['u1'] });
    const got = await svc.checkedTags(ME, [{ id: 'u1', name: 'Anything' }, { id: 'u2', name: 'Not a connection' }, { id: ME }]);
    expect(got).toEqual([{ id: 'u1', name: 'Together City Nutrition', handle: 'tc.nutrition' }]);
  });

  it('nobody blocked', async () => {
    const { svc } = rig({ conns: ['u1'], blocked: ['u1'] });
    expect(await svc.checkedTags(ME, [{ id: 'u1' }])).toEqual([]);
  });
});

describe('who is told', () => {
  it('on a public post: the tagged and the @mentioned, once each', async () => {
    const { svc, told } = rig();
    await svc.tellTagged(ME, 'p1', 'thanks @togethercity and @TC.Nutrition', 'public', [{ id: 'u1' }]);
    expect(told.map((n) => [n.userId, n.title])).toEqual([
      ['u1', 'Somen tagged you in a post'],
      ['u3', 'Somen mentioned you in a post'],
    ]);
    expect(told[0]).toMatchObject({ kind: 'mention', href: '/social/p/p1', entityId: 'p1', actorId: ME });
  });

  it('never somebody blocked, and nobody on an only-me post', async () => {
    const a = rig({ blocked: ['u3'] });
    await a.svc.tellTagged(ME, 'p1', '@togethercity', 'public', []);
    expect(a.told).toEqual([]);
    const b = rig();
    await b.svc.tellTagged(ME, 'p1', '@togethercity', 'private', [{ id: 'u1' }]);
    expect(b.told).toEqual([]);
  });

  it('on a friends post: only those the audience admits', async () => {
    const { svc, told } = rig({ recipients: [ME, 'u1'] });
    await svc.tellTagged(ME, 'p1', '@togethercity', 'friends', [{ id: 'u1' }]);
    expect(told.map((n) => n.userId)).toEqual(['u1']);
  });
});
