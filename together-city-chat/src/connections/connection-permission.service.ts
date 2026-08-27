import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { BlockingService } from './blocking.service';

/**
 * THE GATE.
 * Every message send/edit/delete and every conversation start passes through here.
 * Rule: two users may communicate only if they share at least one ACCEPTED,
 * non-blocked connection. Anything else → 403 Forbidden. No exceptions.
 */
@Injectable()
export class ConnectionPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocking: BlockingService,
  ) {}

  /**
   * True iff an ACCEPTED connection exists AND neither has blocked the other.
   *
   * The block half used to be missing, and the consequence was not small: a
   * citizen who blocked someone from the Social hub had their posts hidden and
   * carried on receiving their messages, because this gate only ever looked at
   * the connection record and the Social hub writes to a different table. See
   * blocking.ts. Every message, call and new conversation comes through here,
   * so this one line is where the block becomes real everywhere at once.
   */
  async canCommunicate(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    if (await this.blocking.isBlocked(a, b)) return false;
    const { userOneId, userTwoId } = orderPair(a, b);
    const conn = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED },
      select: { id: true },
    });
    return conn !== null;
  }

  /**
   * Throws 403 unless the two may communicate. A block and a missing connection
   * are refused separately so the wording can differ: only the person who made
   * a block is told a block exists.
   */
  async assertCanCommunicate(a: string, b: string): Promise<void> {
    await this.blocking.assertNotBlocked(a, b);
    if (!(await this.canCommunicate(a, b))) {
      throw new ForbiddenException('You can only message connected members.');
    }
  }

  /** True if either user has blocked the other, by any of the ways to do it. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    return this.blocking.isBlocked(a, b);
  }

  /**
   * Gate for group/direct conversations: the sender must be a member AND, for
   * DIRECT conversations, be connected to the other member. For GROUP, membership
   * is sufficient (group creation itself checks connections of invitees).
   *
   * A group is left alone on purpose. Ejecting somebody from a shared group the
   * moment one member blocks them would tell every other person in that group
   * that a block had happened, which is the one thing a block must not
   * broadcast. A block stops the direct line; it is not a way to remove
   * somebody from a room full of other people.
   */
  async assertCanPostToConversation(userId: string, conversationId: string): Promise<void> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!convo) throw new ForbiddenException('Conversation not found');
    const memberIds = convo.members.map((m) => m.userId);
    if (!memberIds.includes(userId)) {
      throw new ForbiddenException('You are not a member of this conversation.');
    }
    if (convo.type === 'DIRECT') {
      const other = memberIds.find((id) => id !== userId);
      if (!other) throw new ForbiddenException('Invalid direct conversation.');
      // AND THE OTHER PERSON MUST STILL BE HERE (27 Aug, third pass).
      //
      // Deletion is a tombstone for thirty days and never touches a match row,
      // so `assertMatchStillStands` below read `matched` and opened the line to
      // somebody who had gone. An ACTIVITY chat is worse: it has no match row
      // at all, so that method returns early by design and nothing else asked.
      // A citizen could type into a departed person's thread for a month.
      //
      // Placed HERE rather than in the dating branch because it is true of
      // every direct line. It happens to be redundant for ordinary city chats
      // — `deleteAccount` deletes a departing citizen's connections, so
      // `assertCanCommunicate` already refuses — and a guard that only holds
      // where somebody remembered to put it is exactly what produced three
      // passes over this finding. The same wording as an ended match: what
      // the sender needs to know is that the line is shut.
      const stillThere = await this.prisma.user.findUnique({
        where: { id: other }, select: { deletedAt: true },
      });
      if (!stillThere || (stillThere as { deletedAt?: Date | null }).deletedAt != null) {
        throw new ForbiddenException('This conversation has ended.');
      }
      // Dating-match chats (anonymousTrust set) are authorised by the match
      // itself — the two people aren't a connection until they become friends —
      // but a block still holds. This branch used to return before any check at
      // all, so blocking somebody you had matched with hid them from Discover
      // and left the chat you already had with them wide open: the one line
      // where they were still certain to be able to reach you.
      await this.blocking.assertNotBlocked(userId, other);
      if ((convo as { anonymousTrust?: number | null }).anonymousTrust != null) {
        await this.assertMatchStillStands(userId, conversationId);
        return;
      }
      await this.assertCanCommunicate(userId, other);
    }
  }

  /**
   * UNMATCHING HAS TO ACTUALLY END CONTACT (27 Aug, launch audit).
   *
   * Unmatch archives the conversation for both members and flips the match to
   * `passed`. This gate read membership and blocks and NEVER read match status
   * — and archiving is a per-member flag the member can reverse themselves, in
   * one tap, from their own archive. So an unmatched person could unarchive the
   * thread and carry on messaging. Only Block actually stopped anybody, while
   * the interface offered Unmatch as the gentler option and meant it.
   *
   * A DATING conversation with a match row must have a LIVE match behind it.
   *
   * NOT EVERY ANONYMOUS CONVERSATION HAS ONE, and that is why this looks up the
   * match rather than demanding it. A real-estate enquiry opens a conversation
   * with `anonymousTrust` set and no match row behind it, so an absent row here
   * means "not a dating conversation" and the block check above stands on its
   * own. THAT ONLY HOLDS BECAUSE NOTHING DELETES A ROW THAT CARRIES A
   * CONVERSATION — it was not true until 27 Aug, when declining a People
   * request still deleted the match and turned this early return into a way to
   * unlock a dating chat permanently by destroying its row. The rule is pinned
   * by `a-row-that-carries-a-chat-is-never-deleted.spec.ts`; if that test ever
   * goes red, this branch is a hole again.
   *
   * Fail-CLOSED where a match does exist. If the row says anything other than
   * `matched`, the line is shut. This is a contact gate rather than an
   * availability gate: the cost of wrongly refusing a message is an error the
   * sender sees and retries, and the cost of wrongly allowing one is a person
   * who thought they had ended something being messaged anyway.
   */
  private async assertMatchStillStands(userId: string, conversationId: string): Promise<void> {
    const match = await (this.prisma as unknown as {
      datingMatch?: { findFirst(a: unknown): Promise<{ status: string } | null> };
    }).datingMatch?.findFirst({ where: { conversationId }, select: { status: true } });
    // No row: not a dating match conversation (a real-estate enquiry). See above.
    if (!match) return;
    if (match.status !== 'matched') {
      throw new ForbiddenException('This conversation has ended.');
    }
  }
}
