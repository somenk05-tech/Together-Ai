import { UsersService } from './users.service';

/**
 * What the users service decides today. (P0-2, the thin one.)
 *
 * Ninety lines of orchestration, but two behaviours worth writing down:
 * lookupByHandle's privacy rules (no directory; yourself is nobody; the
 * relationship label drives the button the UI shows) and onlineContacts'
 * presence filter. Recorded over stubs, as they are.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function build(opts: {
  target?: { id: string; handle: string; name: string; profileImage: string | null } | null;
  conn?: { status: string; requestedById: string } | null;
  conns?: Array<{ userOneId: string; userTwoId: string }>;
  online?: string[];
} = {}) {
  const s: any = Object.create(UsersService.prototype);
  s.prisma = {
    user: { findUnique: async () => opts.target ?? null },
    connection: {
      findFirst: async () => opts.conn ?? null,
      findMany: async () => opts.conns ?? [],
    },
  };
  s.presence = { isOnline: async (id: string) => (opts.online ?? []).includes(id) };
  return s;
}
const rhea = { id: 'u2', handle: 'rhea', name: 'Rhea', profileImage: null };

describe('what handle lookup decides today', () => {
  it('the relationship labels, exactly as the UI receives them', async () => {
    const cases: Record<string, unknown> = {};
    cases.stranger = await build({ target: rhea }).lookupByHandle('u1', '@Rhea');
    cases.accepted = await build({ target: rhea, conn: { status: 'ACCEPTED', requestedById: 'u1' } }).lookupByHandle('u1', 'rhea');
    cases.blocked = await build({ target: rhea, conn: { status: 'BLOCKED', requestedById: 'u2' } }).lookupByHandle('u1', 'rhea');
    cases.iAsked = await build({ target: rhea, conn: { status: 'PENDING', requestedById: 'u1' } }).lookupByHandle('u1', 'rhea');
    cases.theyAsked = await build({ target: rhea, conn: { status: 'PENDING', requestedById: 'u2' } }).lookupByHandle('u1', 'rhea');
    expect(cases).toMatchSnapshot();
  });

  it('yourself, a blank handle and a miss are all the same nothing', async () => {
    expect(await build({ target: { ...rhea, id: 'u1' } }).lookupByHandle('u1', 'rhea')).toBeNull();
    expect(await build({ target: rhea }).lookupByHandle('u1', '   ')).toBeNull();
    expect(await build({ target: null }).lookupByHandle('u1', 'ghost')).toBeNull();
  });
});

describe('online contacts', () => {
  it('only accepted connections, only the online ones, from either side of the pair', async () => {
    const s = build({
      conns: [
        { userOneId: 'u1', userTwoId: 'a' },
        { userOneId: 'b', userTwoId: 'u1' },
        { userOneId: 'u1', userTwoId: 'c' },
      ],
      online: ['b', 'c', 'stranger'],
    });
    expect(await s.onlineContacts('u1')).toEqual(['b', 'c']);
  });
});
