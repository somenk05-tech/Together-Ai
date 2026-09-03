import { datingContext } from '../shared/dating-conversations';

/**
 * Dating chats stay in the Dating Hub.
 *
 * Two promises live in this rule, and both were being broken outside the
 * conversation list — the only place that enforced it:
 *
 *   1. A dating conversation never appears in the main Chats surface. Search
 *      ran over every membership, so searching in Chats returned messages from
 *      an anonymous dating thread.
 *   2. Until BOTH people reveal, the other person is a pseudonym. Every message
 *      notification carried the sender's real name and photo, and pushed them
 *      to a lock screen.
 */

type MatchRow = { conversationId: string | null; userOneId: string; userTwoId: string; revealByOne: boolean; revealByTwo: boolean };

function prismaWith(rows: MatchRow[]) {
  return {
    // WHICH HUB IS A COLUMN, so the stub answers it from one: a conversation a
    // match points at is a dating one, anything else is an ordinary city chat.
    conversation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        ({ kind: rows.some((r) => r.conversationId === where.id) ? 'dating' : 'city' })),
    },
    datingMatch: {
      findMany: jest.fn(async () => rows.filter((r) => r.conversationId)),
      findFirst: jest.fn(async ({ where }: { where: { conversationId: string } }) => rows.find((r) => r.conversationId === where.conversationId) ?? null),
    },
  } as never;
}

const row = (id: string, one = false, two = false): MatchRow =>
  ({ conversationId: id, userOneId: 'one', userTwoId: 'two', revealByOne: one, revealByTwo: two });

describe('dating conversations are identifiable everywhere', () => {
  /*
   * WHICH conversations belong to the Dating Hub is no longer answered here.
   * It is `Conversation.kind`, and it is held by
   * `conversations/a-dating-chat-says-so-on-its-own-row.spec.ts`. What is left
   * in this file is the other half — how a person may be NAMED inside one —
   * which is a live question about two reveal flags and cannot be a column.
   */

  it('never claims an ordinary conversation is a dating one', async () => {
    const ctx = await datingContext(prismaWith([row('c1')]), 'ordinary-conversation');
    expect(ctx).toEqual({ dating: false, revealed: false, senderRevealed: false });
  });

  it('reports "both revealed" only when both have chosen their real name', async () => {
    const both = async (a: boolean, b: boolean) => (await datingContext(prismaWith([row('c1', a, b)]), 'c1')).revealed;
    expect(await both(false, false)).toBe(false);
    expect(await both(true, false)).toBe(false);
    expect(await both(false, true)).toBe(false);
    expect(await both(true, true)).toBe(true);
  });

  it('names a sender by THEIR own choice, not by a mutual one', async () => {
    // The point of the whole feature: choosing to be yourself works immediately
    // and does not wait for the other person to decide the same.
    const ctx = await datingContext(prismaWith([row('c1', true, false)]), 'c1', 'one');
    expect(ctx.senderRevealed).toBe(true);
    expect(ctx.revealed).toBe(false); // ...while the pair is still not mutual
  });

  it('keeps a sender anonymous while they have not chosen', async () => {
    const ctx = await datingContext(prismaWith([row('c1', true, false)]), 'c1', 'two');
    expect(ctx.senderRevealed).toBe(false);
  });

  it('never reveals a sender it was not asked about', async () => {
    // No subject named → the safe answer, not a guess.
    const ctx = await datingContext(prismaWith([row('c1', true, true)]), 'c1');
    expect(ctx.senderRevealed).toBe(false);
    const stranger = await datingContext(prismaWith([row('c1', true, true)]), 'c1', 'somebody-else');
    expect(stranger.senderRevealed).toBe(false);
  });

  it('treats an unreadable conversation as a dating one, not an ordinary one', async () => {
    /*
     * FAIL SHUT (3 Sep). This used to resolve to `{ dating: false }` and the
     * comment beside it called the trade-off narrow: one real name on one push
     * during an outage. It was not narrow. `dating: false` is also the answer
     * that sends the sender's city PHOTO, the message BODY (the preview gate
     * hangs off the same flag) and a `/chats?c=` link — the whole reveal, on a
     * lock screen, from one failed read.
     *
     * The other direction costs an ordinary chat its sender name for as long as
     * the database is down, which is a worse notification and not a disclosure.
     */
    const broken = {
      conversation: { findUnique: jest.fn(async () => { throw new Error('db down'); }) },
      datingMatch: {
        findMany: jest.fn(async () => { throw new Error('db down'); }),
        findFirst: jest.fn(async () => { throw new Error('db down'); }),
      },
    } as never;
    await expect(datingContext(broken, 'c1', 'one')).resolves.toEqual({ dating: true, revealed: false, senderRevealed: false });
  });

  it('a dating conversation whose match was never linked is still a dating one', async () => {
    // `dating.service.ts` creates the conversation and links the match second,
    // so a failed link leaves a `kind:'dating'` row with both members and no
    // match. Asking DatingMatch called that an ordinary chat for ever — no
    // outage required, and nothing to notice.
    const unlinked = {
      conversation: { findUnique: jest.fn(async () => ({ kind: 'dating' })) },
      datingMatch: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    } as never;
    await expect(datingContext(unlinked, 'c1', 'one')).resolves.toEqual({ dating: true, revealed: false, senderRevealed: false });
  });

});
