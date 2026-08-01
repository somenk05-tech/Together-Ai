import { swallowed } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatEventBus } from '../shared/events/chat-events';
import {
  afterJoin, afterLeave, afterTimeout, durationSeconds, mayEndForAll, ringExpired,
  type CallView, type Transition,
} from './call-state';
import { buildIceConfig, type IceConfig } from './ice-config';
import type { ListCallsDto, StartCallDto } from './dto/calls.dto';

interface ParticipantRow {
  id: string; callId: string; userId: string;
  joinedAt: Date | null; leftAt: Date | null; role: string;
}

interface CallRow {
  id: string; conversationId: string; createdById: string;
  type: string; status: string; avatarId: string | null;
  startedAt: Date | null; endedAt: Date | null; endedReason: string | null;
  createdAt: Date;
  participants?: ParticipantRow[];
}

/**
 * Calls.
 *
 * The rule that matters, and the one every method below is arranged around:
 * **chat membership decides who may be in a call, never possession of the call
 * id.** A call id is a uuid that travels through push notifications, socket
 * frames and browser history; treating it as a credential would mean anyone who
 * ever saw one could rejoin the conversation later. So `join`, `get`, `leave`
 * and every signalling frame re-ask the same question the chat asks — is this
 * person a member of that conversation — and the participant row is a record of
 * what happened, not a permission.
 *
 * Media never touches this server. What lives here is the roster, the state
 * machine (call-state.ts) and a relay for the handshake. The audio goes
 * peer-to-peer, which is why the ICE config (ice-config.ts) is honest about
 * needing a TURN server it may not have.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
    private readonly notifications: NotificationsService,
    private readonly bus: ChatEventBus,
  ) {}

  /** The generated client lags new models until `prisma generate` runs. */
  private get callSession() {
    return (this.prisma as unknown as {
      callSession: {
        create(a: unknown): Promise<CallRow>;
        findFirst(a: unknown): Promise<CallRow | null>;
        findUnique(a: unknown): Promise<CallRow | null>;
        findMany(a: unknown): Promise<CallRow[]>;
        update(a: unknown): Promise<CallRow>;
        updateMany(a: unknown): Promise<{ count: number }>;
      };
    }).callSession;
  }

  private get callParticipant() {
    return (this.prisma as unknown as {
      callParticipant: {
        createMany(a: unknown): Promise<{ count: number }>;
        upsert(a: unknown): Promise<ParticipantRow>;
        updateMany(a: unknown): Promise<{ count: number }>;
        findFirst(a: unknown): Promise<ParticipantRow | null>;
      };
    }).callParticipant;
  }

  private get avatarTable() {
    return (this.prisma as unknown as {
      avatar: { findFirst(a: unknown): Promise<{ id: string } | null> };
    }).avatar;
  }

  // ── reading ────────────────────────────────────────────

  /** The ICE list, rebuilt per request so a rotated TURN credential takes effect. */
  ice(): IceConfig {
    return buildIceConfig(process.env);
  }

  private view(row: CallRow): CallView {
    return {
      status: row.status as CallView['status'],
      createdById: row.createdById,
      participants: (row.participants ?? []).map((p) => ({
        userId: p.userId,
        role: p.role === 'caller' ? 'caller' : 'callee',
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
    };
  }

  private shape(row: CallRow) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      createdById: row.createdById,
      type: row.type,
      status: row.status,
      avatarId: row.avatarId,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      endedReason: row.endedReason,
      durationSeconds: durationSeconds(row.startedAt, row.endedAt),
      createdAt: row.createdAt.toISOString(),
      participants: (row.participants ?? []).map((p) => ({
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt?.toISOString() ?? null,
        leftAt: p.leftAt?.toISOString() ?? null,
        present: p.joinedAt !== null && p.leftAt === null,
      })),
    };
  }

  /**
   * Load a call and prove the asker belongs in its conversation.
   *
   * Both halves matter. Without the load there is nothing to authorise against;
   * without the membership check the call id would be the permission. A call
   * whose conversation the asker has left answers 403 from the permission
   * service, and a call id that does not exist answers 404 — those are
   * different facts and it is fine for them to look different, because knowing
   * a uuid exists tells a stranger nothing they can use.
   */
  private async loadAuthorised(userId: string, callId: string): Promise<CallRow> {
    const row = await this.callSession.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!row) throw new NotFoundException('Call not found');
    await this.permission.assertCanPostToConversation(userId, row.conversationId);
    return row;
  }

  async get(userId: string, callId: string) {
    return this.shape(await this.loadAuthorised(userId, callId));
  }

  /** Call history — only calls in conversations the citizen was part of. */
  async list(userId: string, dto: ListCallsDto) {
    const rows = await this.callSession.findMany({
      where: {
        ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
        participants: { some: { userId } },
      },
      include: { participants: true },
      orderBy: { createdAt: 'desc' },
      take: dto.limit ?? 20,
    });
    return rows.map((r) => this.shape(r));
  }

  // ── starting ───────────────────────────────────────────

  /**
   * Ring a conversation.
   *
   * Idempotent by design: pressing call twice, or two people calling each other
   * in the same second, joins the one live call rather than creating a second.
   * A conversation has at most one call that is not ended, and that invariant is
   * what stops two halves of a pair negotiating against different sessions.
   */
  async start(userId: string, dto: StartCallDto) {
    await this.permission.assertCanPostToConversation(userId, dto.conversationId);

    if (dto.type === 'avatar') {
      const owned = await this.avatarTable
        .findFirst({ where: { id: dto.avatarId, userId, status: 'ready' }, select: { id: true } })
        .catch(swallowed('calls.start', null));
      if (!owned) throw new BadRequestException('That avatar is not ready, or is not yours.');
    }

    const live = await this.callSession.findFirst({
      where: { conversationId: dto.conversationId, status: { in: ['ringing', 'active'] } },
      include: { participants: true },
      orderBy: { createdAt: 'desc' },
    });
    if (live) {
      // Someone is already calling. Join that instead of starting a rival call.
      const expired = live.status === 'ringing' && ringExpired(live.createdAt, new Date());
      if (!expired) return this.join(userId, live.id);
      const done = await this.close(live, afterTimeout(this.view(live)));
      if (done.closed) this.emitUpdated(done.row, 'ended');
    }

    // unbounded: one conversation's members — group-sized
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: dto.conversationId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length < 2) throw new BadRequestException('There is nobody to call.');

    const now = new Date();
    const call = await this.callSession.create({
      data: {
        conversationId: dto.conversationId,
        createdById: userId,
        type: dto.type,
        status: 'ringing',
        avatarId: dto.type === 'avatar' ? dto.avatarId ?? null : null,
      },
    });

    // The whole roster exists from the first second, so signalling can be
    // authorised against it before anyone has answered.
    await this.callParticipant.createMany({
      data: memberIds.map((id) => ({
        callId: call.id,
        userId: id,
        role: id === userId ? 'caller' : 'callee',
        joinedAt: id === userId ? now : null,
      })),
      skipDuplicates: true,
    });

    const fresh = await this.reload(call.id);
    const recipientIds = memberIds.filter((id) => id !== userId);
    this.bus.publish({
      kind: 'call.ringing',
      callId: call.id,
      conversationId: call.conversationId,
      recipientIds,
      call: this.shape(fresh),
    });
    void this.notifications.notifyIncomingCall({
      conversationId: call.conversationId,
      callerId: userId,
      recipientIds,
      callId: call.id,
      type: call.type,
    });
    return this.shape(fresh);
  }

  // ── joining and leaving ────────────────────────────────

  async join(userId: string, callId: string) {
    const row = await this.loadAuthorised(userId, callId);
    if (row.status === 'ended') throw new BadRequestException('That call has ended.');
    if (row.status === 'ringing' && ringExpired(row.createdAt, new Date())) {
      const done = await this.close(row, afterTimeout(this.view(row)));
      if (done.closed) this.emitUpdated(done.row, 'ended');
      throw new BadRequestException(
        done.row.endedReason === 'missed' ? 'That call was not answered.' : 'That call has ended.',
      );
    }

    const now = new Date();
    // Unique(callId, userId) makes this idempotent: rejoining after a dropped
    // socket clears leftAt rather than adding a second seat at the table.
    await this.callParticipant.upsert({
      where: { callId_userId: { callId, userId } },
      create: { callId, userId, role: userId === row.createdById ? 'caller' : 'callee', joinedAt: now },
      update: { joinedAt: now, leftAt: null },
    });

    const after = await this.reload(callId);
    const move = afterJoin(this.view(after), userId);
    if (move.started) {
      await this.callSession.update({ where: { id: callId }, data: { status: 'active', startedAt: now } });
    }
    return this.emitUpdated(await this.reload(callId), 'joined');
  }

  /** Hang up, or decline. Which of the two it was, the rows already know. */
  async leave(userId: string, callId: string) {
    const row = await this.loadAuthorised(userId, callId);
    if (row.status === 'ended') return this.shape(row);

    await this.callParticipant.updateMany({
      where: { callId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });

    const after = await this.reload(callId);
    const move = afterLeave(this.view(row), userId);
    if (move.status === 'ended') {
      const done = await this.close(after, move);
      // The other hang-up got there first; its broadcast already carries the
      // final state, including this leave.
      return done.closed ? this.emitUpdated(done.row, 'ended') : this.shape(done.row);
    }
    return this.emitUpdated(after, 'left');
  }

  /** End it for everyone. The person who started the call may; nobody else. */
  async end(userId: string, callId: string) {
    const row = await this.loadAuthorised(userId, callId);
    if (row.status === 'ended') return this.shape(row);
    if (!mayEndForAll(this.view(row), userId)) {
      throw new ForbiddenException('Only the person who started the call can end it for everyone.');
    }
    const move: Transition = {
      status: 'ended',
      endedReason: row.status === 'active' ? 'completed' : 'cancelled',
      started: false,
    };
    const done = await this.close(row, move);
    return done.closed ? this.emitUpdated(done.row, 'ended') : this.shape(done.row);
  }

  // ── signalling ─────────────────────────────────────────

  /**
   * May `from` send `to` a piece of the WebRTC handshake?
   *
   * Three things have to hold, and each has been a bug in somebody's call
   * implementation: the call must be live, the sender must still belong to the
   * conversation, and the *recipient* must be on this call's roster. Skipping
   * the last one turns the signalling channel into an unsolicited-message
   * channel addressed by user id.
   */
  async assertMaySignal(from: string, callId: string, to: string): Promise<void> {
    if (from === to) throw new BadRequestException('You cannot signal yourself.');
    const row = await this.loadAuthorised(from, callId);
    if (row.status === 'ended') throw new BadRequestException('That call has ended.');
    const roster = (row.participants ?? []).map((p) => p.userId);
    if (!roster.includes(from) || !roster.includes(to)) {
      throw new ForbiddenException('That person is not on this call.');
    }
  }

  // ── the sweep ──────────────────────────────────────────

  /**
   * Calls nobody answered.
   *
   * Without this a call rings forever: the caller closes the tab, no leave ever
   * arrives, and the conversation is left holding a live call that blocks the
   * next one (see the invariant in `start`). Runs from a cron, spans every
   * citizen because that is what a sweep is, and writes only by ids it has just
   * read.
   */
  async sweepStale(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 60_000);
    const stale = await this.callSession.findMany({
      where: { status: { in: ['ringing', 'active'] }, createdAt: { lt: cutoff } },
      include: { participants: true },
      take: 200,
    });
    let closed = 0;
    for (const row of stale) {
      // An active call with people still in it is not stale, however long it runs.
      const someonePresent = (row.participants ?? []).some((p) => p.joinedAt && !p.leftAt);
      if (row.status === 'active' && someonePresent) continue;
      if (row.status === 'ringing' && !ringExpired(row.createdAt, now)) continue;
      try {
        const done = await this.close(row, afterTimeout(this.view(row)));
        if (!done.closed) continue;
        this.emitUpdated(done.row, 'ended');
        closed++;
      } catch (e) {
        this.logger.warn(`could not close stale call ${row.id}: ${(e as Error).message}`);
      }
    }
    return closed;
  }

  // ── internals ──────────────────────────────────────────

  private async reload(callId: string): Promise<CallRow> {
    const row = await this.callSession.findUnique({ where: { id: callId }, include: { participants: true } });
    if (!row) throw new NotFoundException('Call not found');
    return row;
  }

  /**
   * Write the end, once.
   *
   * The update is guarded on the call still being live, so when both people hang
   * up in the same moment exactly one of them ends it. `closed` reports which
   * one that was — and the callers use it to broadcast once too, because a
   * second 'call ended' arriving after the first is how a UI ends up showing a
   * call that already finished finishing again.
   */
  private async close(row: CallRow, move: Transition): Promise<{ row: CallRow; closed: boolean }> {
    const now = new Date();
    const res = await this.callSession.updateMany({
      where: { id: row.id, status: { in: ['ringing', 'active'] } },
      data: { status: 'ended', endedAt: now, endedReason: move.endedReason ?? 'completed' },
    });
    if (res.count) {
      await this.callParticipant.updateMany({ where: { callId: row.id, leftAt: null }, data: { leftAt: now } });
    }
    return { row: await this.reload(row.id), closed: res.count > 0 };
  }

  private emitUpdated(row: CallRow, event: 'joined' | 'left' | 'ended') {
    const shaped = this.shape(row);
    this.bus.publish({
      kind: 'call.updated',
      callId: row.id,
      conversationId: row.conversationId,
      recipientIds: (row.participants ?? []).map((p) => p.userId),
      event,
      call: shaped,
    });
    return shaped;
  }
}
