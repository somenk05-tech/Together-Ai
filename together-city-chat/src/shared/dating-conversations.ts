import type { PrismaService } from './prisma/prisma.service';

/**
 * Where a conversation belongs, and who the citizen is allowed to see.
 *
 * Dating chats live ONLY in the Dating Hub. They never appear in the main Chats
 * list, and — until both people choose to reveal — the person on the other end
 * is a pseudonym, not a name and face.
 *
 * That rule was written down in connect()'s comment and enforced in exactly one
 * place: the conversation list. Every other surface that reads a conversation
 * had its own idea. This is the one implementation they now share, so the rule
 * holds wherever it is asked rather than wherever someone remembered to ask.
 *
 * Deliberately a plain function over a Prisma client rather than a Nest service:
 * messages and notifications would otherwise both need ConversationsModule
 * injected, and ConversationsModule already depends on parts of both.
 */

type MatchRow = { conversationId: string | null; revealByOne: boolean; revealByTwo: boolean };

function datingMatch(prisma: PrismaService) {
  return (prisma as unknown as {
    datingMatch: {
      findMany(a: unknown): Promise<MatchRow[]>;
      findFirst(a: unknown): Promise<MatchRow | null>;
    };
  }).datingMatch;
}

/** Every conversation id that belongs to the Dating Hub for this citizen. */
export async function datingConversationIds(prisma: PrismaService, userId: string): Promise<Set<string>> {
  const rows = await datingMatch(prisma)
    .findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], conversationId: { not: null } },
      select: { conversationId: true },
    })
    .catch(() => [] as MatchRow[]);
  const out = new Set<string>();
  for (const r of rows) if (r.conversationId) out.add(r.conversationId);
  return out;
}

export interface DatingContext {
  /** Does this conversation belong to the Dating Hub at all? */
  dating: boolean;
  /** Have BOTH people agreed to drop anonymity? One side is not enough. */
  revealed: boolean;
}

/** What a conversation is, from its id alone. */
export async function datingContext(prisma: PrismaService, conversationId: string): Promise<DatingContext> {
  const row = await datingMatch(prisma)
    .findFirst({ where: { conversationId }, select: { revealByOne: true, revealByTwo: true, conversationId: true } })
    .catch(() => null);
  if (!row) return { dating: false, revealed: false };
  return { dating: true, revealed: Boolean(row.revealByOne && row.revealByTwo) };
}
