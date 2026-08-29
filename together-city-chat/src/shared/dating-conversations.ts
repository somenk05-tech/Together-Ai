import { swallowed } from '../shared/swallow';
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

type MatchRow = { conversationId: string | null; userOneId: string; userTwoId: string; revealByOne: boolean; revealByTwo: boolean };

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
  // unbounded: isolation safety — the dating id set must be complete or a dating chat leaks into main Chats
  const rows = await datingMatch(prisma)
    .findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], conversationId: { not: null } },
      select: { conversationId: true },
    })
    .catch(swallowed('shared.datingConversationIds', [] as MatchRow[]));
  const out = new Set<string>();
  for (const r of rows) if (r.conversationId) out.add(r.conversationId);
  return out;
}

/**
 * Of these conversations, the dating ones whose match is OVER.
 *
 * The socket layer's room list is what typing, presence and read receipts are
 * gated by, and `unmatch` left both people in it: the live event below empties
 * the room at the moment it happens, and this is the half that survives a
 * reconnection, when the list is built again from scratch.
 *
 * Anything but `matched` counts — passed, rejected, whatever a later status is
 * called — because the question this answers is "may these two still see each
 * other in real time", and only one answer to it is yes.
 */
export async function endedDatingConversationIds(
  prisma: PrismaService,
  conversationIds: string[],
): Promise<Set<string>> {
  if (!conversationIds.length) return new Set();
  // unbounded: `in:` a room list that `conversationIdsFor` has already capped
  const rows = await datingMatch(prisma)
    .findMany({
      where: { conversationId: { in: conversationIds }, NOT: { status: 'matched' } },
      select: { conversationId: true },
    })
    .catch(swallowed('shared.endedDatingConversationIds', [] as MatchRow[]));
  const out = new Set<string>();
  for (const r of rows) if (r.conversationId) out.add(r.conversationId);
  return out;
}

export interface DatingContext {
  /** Does this conversation belong to the Dating Hub at all? */
  dating: boolean;
  /** Have BOTH people chosen to chat under their real name? */
  revealed: boolean;
  /**
   * Has the person asked about chosen to show THEIR name?
   *
   * This is the one that decides what a notification may say. Identity in a
   * dating chat is each person's own choice — showing your name reveals you and
   * nobody else — so a notification about a message from X may use X's real
   * name exactly when X has chosen to use it. Using the mutual flag here would
   * keep a citizen who had already chosen to be themselves hidden behind a
   * pseudonym until their match happened to decide too.
   *
   * False whenever no subject was named, which is the safe default.
   */
  senderRevealed: boolean;
}

/** What a conversation is, and how `subjectUserId` has chosen to appear in it. */
export async function datingContext(
  prisma: PrismaService,
  conversationId: string,
  subjectUserId?: string,
): Promise<DatingContext> {
  const row = await datingMatch(prisma)
    .findFirst({
      where: { conversationId },
      select: { revealByOne: true, revealByTwo: true, conversationId: true, userOneId: true, userTwoId: true },
    })
    .catch(swallowed('shared.datingContext', null));
  if (!row) return { dating: false, revealed: false, senderRevealed: false };

  const revealed = Boolean(row.revealByOne && row.revealByTwo);
  const senderRevealed = subjectUserId === row.userOneId ? Boolean(row.revealByOne)
    : subjectUserId === row.userTwoId ? Boolean(row.revealByTwo)
    : false;
  return { dating: true, revealed, senderRevealed };
}
