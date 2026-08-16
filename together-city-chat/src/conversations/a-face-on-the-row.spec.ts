import { ForbiddenException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

/**
 * ── A FACE ON THE ROW ───────────────────────────────────────────────────────
 *
 * The owner, 16 Aug: real pictures in the chats list, not initials — and a way
 * to change the picture there that does not touch anybody's platform profile.
 *
 * The photos were ALREADY BEING LOADED for these rows. `listForUser` selects
 * `profileImage` for every member and `shape()` drops it on the floor, so the
 * list has been drawing initials over data it already had. What this pins is
 * not that the photo exists — it is the four rules about WHOSE face is sent,
 * because each of them is a way to leak or to lie:
 *
 *   1. the reader's own chosen picture wins, always;
 *   2. otherwise a direct chat shows the other person's account photo;
 *   3. a GROUP gets nothing — there is no group photo in this schema, and
 *      borrowing one member's face for a room of six invents a fact;
 *   4. an ANONYMOUS match gets nothing, ever. That conversation's whole promise
 *      is that the face is not shown yet, and sending it "for the client to
 *      hide" puts the identity on the wire anyway.
 *
 * And the picture is per-READER. It lives on ConversationMember beside
 * markedUnread and clearedAt, which are the other things one person decides
 * about a conversation without the other one finding out.
 */

type Member = {
  conversationId: string;
  userId: string;
  photo?: string | null;
  archived?: boolean;
};
type Conv = {
  id: string;
  type?: 'DIRECT' | 'GROUP';
  anonymousTrust?: number | null;
  members: Array<{ userId: string; profileImage?: string | null }>;
};

const MINE = 'data:image/jpeg;base64,MINE';
const THEIRS = 'data:image/jpeg;base64,THEIRS';

function serviceWith(members: Member[], convs: Conv[]) {
  const updates: Array<{ where: any; data: any }> = [];
  const prisma = {
    conversationMember: {
      findMany: jest.fn(async ({ where }: any) =>
        members
          .filter((m) => m.userId === where.userId && (m.archived ?? false) === where.archived)
          .map((m) => {
            const c = convs.find((x) => x.id === m.conversationId)!;
            return {
              ...m,
              conversation: {
                id: c.id,
                type: c.type ?? 'DIRECT',
                anonymousTrust: c.anonymousTrust ?? null,
                members: c.members.map((u) => ({ userId: u.userId, user: { profileImage: u.profileImage ?? null } })),
              },
            };
          })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        updates.push({ where, data });
        const hit = members.filter((m) => m.conversationId === where.conversationId && m.userId === where.userId);
        for (const m of hit) m.photo = data.photo;
        return { count: hit.length };
      }),
    },
  };

  // Same construction the other conversation specs use: the service is
  // exercised directly against a stubbed Prisma, because what matters here is
  // which rows are read, which are written, and which faces come back.
  return { svc: new ConversationsService(prisma as never, {} as never), updates };
}

describe('a face on the row', () => {
  it('sends the other person’s own photo for a direct chat', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'me' }],
      [{ id: 'c1', members: [{ userId: 'me', profileImage: 'data:image/jpeg;base64,ME' }, { userId: 'them', profileImage: THEIRS }] }],
    );
    expect(await svc.roster('me')).toEqual([{ id: 'c1', photo: THEIRS, mine: false }]);
  });

  it('prefers the picture this reader chose, and says it is theirs', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'me', photo: MINE }],
      [{ id: 'c1', members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] }],
    );
    // `mine` is what lets the row offer to put it back rather than guess
    // whether there is anything to put back to.
    expect(await svc.roster('me')).toEqual([{ id: 'c1', photo: MINE, mine: true }]);
  });

  it('gives a group no face unless one was chosen', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'g1', userId: 'me' }, { conversationId: 'g2', userId: 'me', photo: MINE }],
      [
        { id: 'g1', type: 'GROUP', members: [{ userId: 'me' }, { userId: 'a', profileImage: THEIRS }, { userId: 'b', profileImage: THEIRS }] },
        { id: 'g2', type: 'GROUP', members: [{ userId: 'me' }, { userId: 'a', profileImage: THEIRS }] },
      ],
    );
    const rows = await svc.roster('me');
    // No borrowed face: the initials of the group's name are the honest answer.
    expect(rows.find((r) => r.id === 'g1')).toEqual({ id: 'g1', photo: null, mine: false });
    // …but a picture the reader put there is theirs to have.
    expect(rows.find((r) => r.id === 'g2')).toEqual({ id: 'g2', photo: MINE, mine: true });
  });

  it('never sends an anonymous match’s face, and still sends the reader’s own', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'd1', userId: 'me' }, { conversationId: 'd2', userId: 'me', photo: MINE }],
      [
        { id: 'd1', anonymousTrust: 1, members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] },
        { id: 'd2', anonymousTrust: 1, members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] },
      ],
    );
    const rows = await svc.roster('me');
    // THE DISCLOSURE. Below trust 2 the hub shows a mask; a photo on the wire
    // is the identity disclosed whatever the client then draws.
    expect(rows.find((r) => r.id === 'd1')).toEqual({ id: 'd1', photo: null, mine: false });
    // A picture the reader chose is not a disclosure — it is their own note —
    // and somebody who set one should not find it gone.
    expect(rows.find((r) => r.id === 'd2')).toEqual({ id: 'd2', photo: MINE, mine: true });
  });

  it('reveals the face once the match is no longer anonymous', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'd1', userId: 'me' }],
      [{ id: 'd1', anonymousTrust: 2, members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] }],
    );
    expect(await svc.roster('me')).toEqual([{ id: 'd1', photo: THEIRS, mine: false }]);
  });

  it('writes the picture on MY membership row and nobody else’s', async () => {
    const { svc, updates } = serviceWith(
      [{ conversationId: 'c1', userId: 'me' }, { conversationId: 'c1', userId: 'them' }],
      [{ id: 'c1', members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] }],
    );
    await svc.setPhoto('me', 'c1', MINE);
    expect(updates).toEqual([{ where: { conversationId: 'c1', userId: 'me' }, data: { photo: MINE } }]);
    // The other side's row is untouched, which is the whole promise: their list
    // does not change and their account photo is not involved at all.
    expect(await svc.roster('them')).toEqual([{ id: 'c1', photo: null, mine: false }]);
  });

  it('takes the picture off again with null', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'me', photo: MINE }],
      [{ id: 'c1', members: [{ userId: 'me' }, { userId: 'them', profileImage: THEIRS }] }],
    );
    expect(await svc.setPhoto('me', 'c1', null)).toEqual({ ok: true, photo: null, mine: false });
    // …and the row goes back to their own photo rather than to nothing.
    expect(await svc.roster('me')).toEqual([{ id: 'c1', photo: THEIRS, mine: false }]);
  });

  it('refuses a conversation the citizen is not in, without confirming it exists', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'me' }],
      [{ id: 'c1', members: [{ userId: 'me' }, { userId: 'them' }] }],
    );
    // The membership row IS the authorisation: an updateMany scoped to
    // (conversation, user) writes nothing for a stranger, and the count says so.
    await expect(svc.setPhoto('stranger', 'c1', MINE)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
