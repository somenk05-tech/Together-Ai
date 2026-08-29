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

  it('degrades to "ordinary" if the lookup fails, which is a known trade-off', async () => {
    // Documented rather than asserted-as-good, and now MUCH narrower than it
    // was. This trade-off used to govern the main Chats list as well, where it
    // was indefensible — one broken read put every anonymous thread on screen
    // under both people's real names. That half is a column now.
    //
    // What is left is the notification path, where the two options are both bad
    // and neither is a disclosure of the whole list: treat it as ordinary (this
    // — a real name could reach one push during an outage) or treat every
    // conversation as anonymous (every normal chat notification loses its
    // sender name during the same outage). The first fails for one message on
    // one broken read; the second fails for everyone. If this trade-off is ever
    // revisited, revisit it here.
    const broken = {
      datingMatch: {
        findMany: jest.fn(async () => { throw new Error('db down'); }),
        findFirst: jest.fn(async () => { throw new Error('db down'); }),
      },
    } as never;
    await expect(datingContext(broken, 'c1', 'one')).resolves.toEqual({ dating: false, revealed: false, senderRevealed: false });
  });
});
