import { datingContext, datingConversationIds } from '../shared/dating-conversations';

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

type MatchRow = { conversationId: string | null; revealByOne: boolean; revealByTwo: boolean };

function prismaWith(rows: MatchRow[]) {
  return {
    datingMatch: {
      findMany: jest.fn(async () => rows.filter((r) => r.conversationId)),
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => r.conversationId === where.conversationId) ?? null),
    },
  } as never;
}

const row = (id: string, one = false, two = false): MatchRow => ({ conversationId: id, revealByOne: one, revealByTwo: two });

describe('dating conversations are identifiable everywhere', () => {
  it('lists every dating conversation for a citizen', async () => {
    const ids = await datingConversationIds(prismaWith([row('c1'), row('c2')]), 'me');
    expect([...ids].sort()).toEqual(['c1', 'c2']);
  });

  it('ignores matches that never opened a chat', async () => {
    const ids = await datingConversationIds(prismaWith([{ conversationId: null, revealByOne: false, revealByTwo: false }]), 'me');
    expect(ids.size).toBe(0);
  });

  it('never claims an ordinary conversation is a dating one', async () => {
    const ctx = await datingContext(prismaWith([row('c1')]), 'ordinary-conversation');
    expect(ctx).toEqual({ dating: false, revealed: false });
  });

  it('treats a dating chat as anonymous until BOTH sides reveal', async () => {
    // One-sided reveal is not consent from the other person.
    expect(await datingContext(prismaWith([row('c1', false, false)]), 'c1')).toEqual({ dating: true, revealed: false });
    expect(await datingContext(prismaWith([row('c1', true, false)]), 'c1')).toEqual({ dating: true, revealed: false });
    expect(await datingContext(prismaWith([row('c1', false, true)]), 'c1')).toEqual({ dating: true, revealed: false });
  });

  it('drops anonymity only when both have agreed', async () => {
    expect(await datingContext(prismaWith([row('c1', true, true)]), 'c1')).toEqual({ dating: true, revealed: true });
  });

  it('degrades to "ordinary" if the lookup fails, which is a known trade-off', async () => {
    // Documented rather than asserted-as-good. On a database error we cannot
    // know whether a conversation is a dating one, and the two options are both
    // bad: treat it as ordinary (this — a real name could reach one push
    // notification during an outage) or treat every conversation as anonymous
    // (every normal chat notification loses its sender name during the same
    // outage). The first fails for one message on one broken read; the second
    // fails for everyone. If this trade-off is ever revisited, revisit it here.
    const broken = {
      datingMatch: {
        findMany: jest.fn(async () => { throw new Error('db down'); }),
        findFirst: jest.fn(async () => { throw new Error('db down'); }),
      },
    } as never;
    await expect(datingContext(broken, 'c1')).resolves.toEqual({ dating: false, revealed: false });
    await expect(datingConversationIds(broken, 'me')).resolves.toEqual(new Set());
  });
});
