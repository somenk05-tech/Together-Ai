import { swallowed } from '../shared/swallow';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { directKeyOf } from './conversation.util';
import { datingConversationIds } from '../shared/dating-conversations';
import { nickname } from '../shared/nickname';
import { CreateGroupDto } from './dto/conversations.dto';

export interface Summary { lastMessageAt: string; lastText: string | null; lastSenderId: string | null; unread: number }

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
  ) {}

  /**
   * People you can start a chat / group with = your ACCEPTED connections only.
   * There is no global city directory — discovery happens by exact handle
   * (see GET /users/lookup), and messaging is gated on an accepted connection.
   */
  async contacts(userId: string) {
    // unbounded: contacts = the accepted friend graph — socially bounded
    const conns = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        connectionType: 'FRIEND',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      include: { userOne: true, userTwo: true },
      orderBy: { updatedAt: 'desc' },
    });
    return conns.map((c) => {
      const u = c.userOneId === userId ? c.userTwo : c.userOne;
      return { id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage };
    });
  }

  /** Idempotently get-or-create the DIRECT conversation with a member by handle. */
  async startDirect(userId: string, handleRaw: string) {
    const handle = handleRaw.trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findUnique({ where: { handle }, select: { id: true } });
    if (!target) throw new ForbiddenException('No citizen with that handle.');
    const targetUserId = target.id;
    await this.permission.assertCanCommunicate(userId, targetUserId);
    const directKey = directKeyOf(userId, targetUserId);
    const existing = await this.prisma.conversation.findUnique({ where: { directKey } });
    const conv =
      existing ??
      (await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          members: { create: [{ userId }, { userId: targetUserId }] },
        },
      }));
    return this.toDto(conv.id, userId);
  }

  /** Create a GROUP. Every invitee must be connected to the creator. */
  async createGroup(userId: string, dto: CreateGroupDto) {
    for (const memberId of dto.memberIds) {
      if (memberId === userId) continue;
      if (!(await this.permission.canCommunicate(userId, memberId))) {
        throw new ForbiddenException(`You are not connected to ${memberId}`);
      }
    }
    const memberIds = Array.from(new Set([userId, ...dto.memberIds]));
    const created = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: dto.title,
        members: {
          create: memberIds.map((id) => ({ userId: id, role: id === userId ? 'OWNER' : 'MEMBER' })),
        },
      },
    });
    return this.toDto(created.id, userId);
  }

  /** Conversation ids that belong to the Dating Hub (anonymous match chats).
   *  These live ONLY in the Dating Hub's own chat tab and are hidden from the
   *  main Chats list. Shared with messages + notifications so all three agree. */
  private datingConversationIds(userId: string): Promise<Set<string>> {
    return datingConversationIds(this.prisma, userId);
  }

  /** Conversation list — newest first, each as the flat DTO the frontend consumes.
   *  Dating Hub match chats are excluded — they surface only in the Dating Hub. */
  async listForUser(userId: string) {
    const datingIds = await this.datingConversationIds(userId);
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, archived: false },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const visible = memberships.filter((m) => {
      if (datingIds.has(m.conversationId)) return false;
      // A conversation this citizen deleted stays gone until someone writes to
      // it again. `messages` is the single newest message (take: 1, desc), so
      // "nothing since I cleared it" is exactly what keeps it out of the panel.
      if (m.clearedAt) {
        const newest = m.conversation.messages[0];
        if (!newest || newest.createdAt <= m.clearedAt) return false;
      }
      return true;
    });
    /* The counts run CONCURRENTLY. This was one awaited count per conversation
       in series — a panel of forty chats was forty round-trips end to end, and
       every open client polls this endpoint every fifteen seconds. Same
       queries, one wait. */
    const unreads = await Promise.all(
      visible.map((m) => {
        // Unread counts from whichever came later: the last read, or the clear.
        // Without this a cleared thread reappears claiming every old message is
        // unread.
        const since = this.laterOf(m.lastReadAt, m.clearedAt);
        return this.prisma.message.count({
          where: {
            conversationId: m.conversationId,
            deleted: false,
            senderId: { not: userId },
            ...(since ? { createdAt: { gt: since } } : {}),
          },
        });
      }),
    );
    /* A flagged chat counts at least one. MAX rather than a fixed 1, so a
       conversation with three real unread messages that is ALSO flagged still
       says three — the flag raises the floor, it does not replace the count. */
    return visible.map((m, i) =>
      this.shape(m.conversation, userId, m.markedUnread ? Math.max(1, unreads[i]) : unreads[i]));
  }

  /**
   * ── THE FACE ON EVERY ROW ─────────────────────────────────────────────────
   *
   * The chats list drew initials because the list payload has never carried a
   * picture — the photos were already being loaded for these rows and thrown
   * away in `shape()`. They are here now, in a call of their own.
   *
   * TWO CALLS, ONE LIST, AND THE SPLIT IS THE POINT. `profileImage` is a
   * `data:` URL — tens of kilobytes each — and /chat/conversations is polled
   * every fifteen seconds by every open client. Faces in that payload would be
   * re-downloaded four times a minute for something that changes about twice a
   * year. This endpoint is cheap to cache because nothing in it is
   * time-sensitive: ids and pictures.
   *
   * WHOSE FACE, IN ORDER:
   *   1. the picture this reader put on the row themselves, if any;
   *   2. otherwise, for a direct chat, the other person's own account photo;
   *   3. otherwise nothing, and the row keeps its initials.
   *
   * A GROUP GETS NO FACE UNLESS ONE WAS CHOSEN. There is no group photo in
   * this schema, and borrowing one member's face for a room of six would be
   * inventing a fact — the initials of the group's name are the honest answer.
   *
   * AND AN ANONYMOUS MATCH GETS NOTHING, EVER. A dating conversation below
   * trust 2 renders a mask, and its whole promise is that the face is not shown
   * yet; sending it and letting a client decide would put an identity on the
   * wire that the wire is supposed to be withholding. The reader's OWN chosen
   * picture is still returned — it is theirs, it is not a disclosure, and
   * somebody who has put a picture on a row should not find it gone.
   */
  async roster(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, archived: false },
      // unbounded: one row per conversation this citizen is in — a truncated
      // roster is a list where some faces silently fall back to initials.
      include: {
        conversation: {
          select: {
            id: true, type: true, anonymousTrust: true,
            members: { select: { userId: true, user: { select: { profileImage: true } } } },
          },
        },
      },
    });
    return memberships.map((m) => {
      const c = m.conversation;
      const isGroup = c.type === 'GROUP';
      const anonymous = !isGroup && c.anonymousTrust != null && c.anonymousTrust < 2;
      const theirs = isGroup || anonymous
        ? null
        : c.members.find((x) => x.userId !== userId)?.user?.profileImage ?? null;
      return {
        id: c.id,
        photo: m.photo ?? theirs,
        /** True when the picture is one this reader chose. The row says so, and
         *  it is what makes "put it back" an offer rather than a guess. */
        mine: m.photo != null,
      };
    });
  }

  /**
   * Put a picture on one of my rows, or take it off.
   *
   * The membership row is the authorisation: `updateMany` scoped to
   * (conversationId, userId) writes nothing at all for somebody who is not in
   * the conversation, and the count tells us which happened. A non-member gets
   * the same 404 the rest of this controller gives, so ids cannot be probed.
   */
  async setPhoto(userId: string, conversationId: string, photo: string | null) {
    const { count } = await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { photo },
    });
    if (count === 0) throw new ForbiddenException('Conversation not found');
    return { ok: true, photo, mine: photo != null };
  }

  /** The later of two optional instants — null only when both are null. */
  private laterOf(a: Date | null | undefined, b: Date | null | undefined): Date | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return a > b ? a : b;
  }

  /** Load one conversation (with members + last message + unread) as the flat DTO. */
  private async toDto(conversationId: string, userId: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!c) throw new ForbiddenException('Conversation not found');
    const me = c.members.find((m) => m.userId === userId);
    const unread = await this.prisma.message.count({
      where: {
        conversationId,
        deleted: false,
        senderId: { not: userId },
        ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
      },
    });
    return this.shape(c, userId, unread);
  }

  /** Flat conversation DTO: { id, title, isGroup, participantIds, lastMessageAt, unread }. */
  private shape(
    c: {
      id: string;
      type: string;
      title: string | null;
      updatedAt: Date;
      anonymousTrust?: number | null;
      members: Array<{ userId: string; user?: { name: string } | null }>;
      messages?: Array<{ createdAt: Date }>;
    },
    userId: string,
    unread: number,
  ) {
    const isGroup = c.type === 'GROUP';
    const others = c.members.filter((m) => m.userId !== userId);
    // One identity across the city: the dating pseudonym is retired. The
    // Matches page always showed the profile's real name, so a different name
    // here read as the person changing names between screens. `anonymous`
    // still marks a dating conversation's trust level for the surfaces that
    // key other behaviour off it; it no longer changes anybody's name.
    const anonymous = !isGroup && c.anonymousTrust != null && c.anonymousTrust < 2;
    const title = isGroup
      ? c.title ?? 'Group'
      : others[0]?.user?.name ?? 'Conversation';
    const lastAt = c.messages?.[0]?.createdAt ?? c.updatedAt;
    return {
      id: c.id,
      title,
      isGroup,
      anonymous,
      participantIds: c.members.map((m) => m.userId),
      lastMessageAt: lastAt.toISOString(),
      unread,
    };
  }

  /** Get-or-create a DIRECT conversation between two ids (used by dating matches,
   *  which authorise the chat without a prior connection). */
  async getOrCreateDirectByIds(aId: string, bId: string, anonymousTrust?: number): Promise<string> {
    const directKey = directKeyOf(aId, bId);
    const existing = await this.prisma.conversation.findUnique({ where: { directKey } });
    if (existing) {
      if (anonymousTrust != null && (existing as { anonymousTrust?: number | null }).anonymousTrust == null) {
        await this.prisma.conversation.update({ where: { id: existing.id }, data: { anonymousTrust } });
      }
      return existing.id;
    }
    const conv = await this.prisma.conversation.create({
      data: { type: 'DIRECT', directKey, anonymousTrust: anonymousTrust ?? null, members: { create: [{ userId: aId }, { userId: bId }] } },
    });
    return conv.id;
  }

  /**
   * The same summary for MANY conversations, in three queries rather than three
   * per conversation.
   *
   * `summaryFor` was called in a loop by the Dating Hub chat list, which the
   * front end polls every fifteen seconds. The comment justifying that loop
   * said "the chat cap means at most three rows have one" — the cap was
   * removed on 27 Aug, and nothing went back to the loop it was the whole
   * argument for.
   *
   * The unread count is the only part that resists a plain `groupBy`, because
   * each conversation is unread SINCE ITS OWN `lastReadAt`. One `OR` of
   * per-conversation conditions expresses exactly that in a single query.
   */
  async summariesFor(conversationIds: string[], userId: string): Promise<Map<string, Summary>> {
    const out = new Map<string, Summary>();
    if (!conversationIds.length) return out;
    const ids = [...new Set(conversationIds)];

    // unbounded: one row per conversation asked for, and the caller bounds those
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: ids }, userId }, select: { conversationId: true, lastReadAt: true },
    }).catch(swallowed('conversations.summariesFor members', [] as Array<{ conversationId: string; lastReadAt: Date | null }>));
    const readAt = new Map(members.map((m) => [m.conversationId, m.lastReadAt]));

    // `distinct` after `orderBy` keeps the first row per conversation, which is
    // the newest — the same row `findFirst` returned one at a time.
    // unbounded: one row per conversation asked for
    const lasts = await this.prisma.message.findMany({
      where: { conversationId: { in: ids }, deleted: false },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      select: { conversationId: true, createdAt: true, text: true, senderId: true },
    }).catch(swallowed('conversations.summariesFor last', [] as Array<{ conversationId: string; createdAt: Date; text: string | null; senderId: string | null }>));
    const lastOf = new Map(lasts.map((l) => [l.conversationId, l]));

    let counts: Array<{ conversationId: string; _count: { _all: number } }> = [];
    try {
      counts = await (this.prisma as unknown as { message: { groupBy(a: unknown): Promise<Array<{ conversationId: string; _count: { _all: number } }>> } })
        .message.groupBy({
          by: ['conversationId'],
          where: {
            deleted: false, senderId: { not: userId },
            OR: ids.map((id) => {
              const at = readAt.get(id);
              return at ? { conversationId: id, createdAt: { gt: at } } : { conversationId: id };
            }),
          },
          _count: { _all: true },
        });
    } catch { /* no count is zero unread, the same answer summaryFor gave on error */ }
    const unreadOf = new Map(counts.map((c) => [c.conversationId, c._count._all]));

    for (const id of ids) {
      const last = lastOf.get(id);
      out.set(id, {
        lastMessageAt: (last?.createdAt ?? new Date(0)).toISOString(),
        lastText: last?.text ?? null,
        lastSenderId: last?.senderId ?? null,
        unread: unreadOf.get(id) ?? 0,
      });
    }
    return out;
  }

  /** Last-message + unread summary for one conversation (used by the Dating Hub
   *  chat list, which surfaces dating conversations outside the main chat list). */
  async summaryFor(conversationId: string, userId: string): Promise<Summary> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    }).catch(swallowed('conversations.summaryFor', null));
    const last = await this.prisma.message.findFirst({
      where: { conversationId, deleted: false },
      orderBy: { createdAt: 'desc' },
    }).catch(swallowed('conversations.summaryFor', null));
    const unread = await this.prisma.message.count({
      where: {
        conversationId, deleted: false, senderId: { not: userId },
        ...(member?.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
      },
    }).catch(() => 0);
    return {
      lastMessageAt: (last?.createdAt ?? new Date(0)).toISOString(),
      // The column is `text`; `body` only exists after serialize. Reading
      // `.body` off the raw row meant the Dating Hub list never had a preview.
      lastText: (last as { text?: string | null } | null)?.text ?? null,
      lastSenderId: (last as { senderId?: string | null } | null)?.senderId ?? null,
      unread,
    };
  }

  /** Archive a conversation for every member (used when a dating match is
   *  unmatched — the chat leaves both people's lists). */
  async archiveForAll(conversationId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({ where: { conversationId }, data: { archived: true } }).catch(swallowed('conversations.archiveForAll', undefined));
  }

  /** Advance/clear a dating conversation's anonymity (reveal at ≥2). */
  async setAnonymousTrust(conversationId: string, trust: number | null): Promise<void> {
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { anonymousTrust: trust } }).catch(swallowed('conversations.setAnonymousTrust', undefined));
  }

  /**
   * Membership check that answers 404 rather than 403.
   *
   * assertMember() below says "you are not a member", which confirms the
   * conversation exists to anyone holding an id. For the panel operations a
   * non-participant should not be able to tell an id apart from a typo, so
   * these answer NotFound. Existing callers keep the 403 they were written
   * against.
   */
  private async assertParticipant(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new NotFoundException('No such conversation.');
  }

  /**
   * Delete a conversation from THIS citizen's left panel.
   *
   * Never removes the conversation or its messages: the other participants
   * still have their copy, and in a group one person leaving the thread behind
   * cannot be allowed to erase everyone's history. It records the instant the
   * citizen cleared it — everything up to that point stops being theirs to see,
   * and the thread leaves their list until somebody writes to it again.
   */
  async clearForUser(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      // archived is cleared deliberately: deleting a chat that was archived
      // should not leave it sitting in the archive.
      data: { clearedAt: new Date(), archived: false },
    });
    return { ok: true };
  }

  /** Move a conversation in or out of this citizen's archive. Reversible. */
  async setArchived(userId: string, conversationId: string, archived: boolean): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { archived },
    });
    return { ok: true };
  }

  async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
  }

  /* ── A GROUP'S ROSTER IS NOT FROZEN AT CREATION ────────────────────────
     MemberRole has carried OWNER, ADMIN and MEMBER since the schema was
     written and nothing ever read the column. Everything below reads it. */

  /** The group + my own membership, proving I may change it. */
  private async assertGroupAdmin(userId: string, conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    // 404, not 403 — the same reasoning assertParticipant carries: somebody
    // who is not in the group must not be able to tell an id from a typo.
    if (!convo) throw new NotFoundException('No such conversation.');
    const me = convo.members.find((m) => m.userId === userId);
    if (!me) throw new NotFoundException('No such conversation.');
    if (convo.type !== 'GROUP') throw new ForbiddenException('That is not a group.');
    if (me.role !== 'OWNER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only a group admin can change this group.');
    }
    return { convo, me };
  }

  /** Who is in this group, and what they are. Any member may ask. */
  async members(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    // AN ANONYMOUS DATING CHAT LEAKS NOTHING HERE EITHER (27 Aug, second audit,
    // blocker 03). This endpoint returned the real handle, name and city photo
    // to any member — so a match who had deliberately NOT revealed was unmasked
    // by one GET, and roster() masking the same photo forty lines up meant
    // nothing. A DIRECT conversation still marked anonymous (anonymousTrust set
    // and below the reveal threshold) gets the pseudonym and nulls for everyone
    // but the caller; groups and revealed chats are unchanged.
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, select: { type: true, anonymousTrust: true },
    });
    const at = (convo as { anonymousTrust?: number | null } | null)?.anonymousTrust;
    const anonymous = convo?.type === 'DIRECT' && at != null && at < 2;
    // unbounded: one conversation's members — group-sized
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => {
      const masked = anonymous && r.userId !== userId;
      return {
        userId: r.userId,
        name: masked ? nickname(r.userId) : (r.user?.name ?? 'Someone'),
        handle: masked ? null : (r.user?.handle ?? null),
        profileImage: masked ? null : (r.user?.profileImage ?? null),
        role: r.role,
      };
    });
  }

  /**
   * Add people. Each one must be connected to the person adding them — the
   * same gate createGroup applies, and for the same reason: a group is not a
   * way to put a stranger in front of somebody who never accepted them.
   */
  async addMembers(userId: string, conversationId: string, memberIds: string[]) {
    const { convo } = await this.assertGroupAdmin(userId, conversationId);
    const already = new Set(convo.members.map((m) => m.userId));
    const fresh = memberIds.filter((id) => !already.has(id));
    for (const id of fresh) {
      if (!(await this.permission.canCommunicate(userId, id))) {
        throw new ForbiddenException('You can only add members you are connected to.');
      }
    }
    if (fresh.length) {
      await this.prisma.conversationMember.createMany({
        data: fresh.map((id) => ({ conversationId, userId: id, role: 'MEMBER' as const })),
        skipDuplicates: true,
      });
    }
    return { ok: true as const, added: fresh.length };
  }

  /** Remove somebody else. The owner cannot be removed by anybody. */
  async removeMember(userId: string, conversationId: string, targetId: string) {
    const { convo } = await this.assertGroupAdmin(userId, conversationId);
    if (targetId === userId) throw new ForbiddenException('Use leave to remove yourself.');
    const target = convo.members.find((m) => m.userId === targetId);
    if (!target) throw new NotFoundException('They are not in this group.');
    if (target.role === 'OWNER') throw new ForbiddenException('The group owner cannot be removed.');
    await this.prisma.conversationMember.deleteMany({ where: { conversationId, userId: targetId } });
    return { ok: true as const };
  }

  /** Promote or demote. Only the OWNER may, and never to OWNER. */
  async setMemberRole(userId: string, conversationId: string, targetId: string, role: 'ADMIN' | 'MEMBER') {
    const { convo, me } = await this.assertGroupAdmin(userId, conversationId);
    if (me.role !== 'OWNER') throw new ForbiddenException('Only the group owner can change what somebody is.');
    if (targetId === userId) throw new ForbiddenException('You cannot change your own role.');
    const target = convo.members.find((m) => m.userId === targetId);
    if (!target) throw new NotFoundException('They are not in this group.');
    if (target.role === 'OWNER') throw new ForbiddenException('There is one owner.');
    await this.prisma.conversationMember.updateMany({ where: { conversationId, userId: targetId }, data: { role } });
    return { ok: true as const };
  }

  /** Rename. Admins and the owner; the name is what everybody sees. */
  async renameGroup(userId: string, conversationId: string, title: string) {
    await this.assertGroupAdmin(userId, conversationId);
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { title } });
    return { ok: true as const };
  }

  /**
   * Leave.
   *
   * The row is DELETED, not archived: recipientIds is computed from members, so
   * anything short of removing it leaves somebody receiving a group they left.
   *
   * An owner may leave, and ownership moves rather than blocking them —
   * longest-standing admin first, then longest-standing member. Requiring a
   * hand-over before the door opens sounds tidy and is a trap: the owner is the
   * one person with no way out of it.
   */
  async leaveConversation(userId: string, conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { orderBy: { joinedAt: 'asc' } } },
    });
    if (!convo) throw new NotFoundException('No such conversation.');
    const me = convo.members.find((m) => m.userId === userId);
    if (!me) throw new NotFoundException('No such conversation.');
    if (convo.type !== 'GROUP') throw new ForbiddenException('You can only leave a group.');

    const others = convo.members.filter((m) => m.userId !== userId);
    if (me.role === 'OWNER' && others.length) {
      const heir = others.find((m) => m.role === 'ADMIN') ?? others[0];
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, userId: heir.userId }, data: { role: 'OWNER' },
      });
    }
    await this.prisma.conversationMember.deleteMany({ where: { conversationId, userId } });
    return { ok: true as const };
  }

  /**
   * Leave a conversation unread on purpose.
   *
   * Not a rewind of lastReadAt: that field is a high-water mark with a `lt`
   * guard on every write, precisely so a late receipt cannot re-open messages
   * already cleared, and rewinding it would re-open EVERY message after the
   * new point rather than flagging the one conversation.
   */
  async markUnread(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { markedUnread: true },
    });
    return { ok: true };
  }

  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */
  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertMember(userId, conversationId);
    // LAST-READ IS A MESSAGE'S TIMESTAMP, NOT A CLOCK READING — the same rule
    // messages.service.markRead documents. Stamping `now` counted a message
    // that arrived mid-write as read by somebody who never saw it. The newest
    // message's own timestamp is the most this reader can honestly claim, and
    // the mark never moves backwards.
    const newest = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (newest) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: newest.createdAt } }] },
        data: { lastReadAt: newest.createdAt },
      });
    }
    /* Cleared SEPARATELY and unconditionally. The write above is guarded on
       lastReadAt actually moving, and the commonest way to open a flagged chat
       is one where it does not move at all — everything was already read, which
       is exactly why the citizen flagged it by hand. Folding the flag into that
       update would leave it set in precisely that case. */
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { markedUnread: false },
    });
    return { ok: true };
  }
}
