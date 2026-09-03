import { swallowed } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatEventBus } from '../shared/events/chat-events';
import { RedisService } from '../shared/redis/redis.service';
import {
  afterJoin, afterLeave, afterTimeout, durationSeconds, mayEndForAll, ringExpired,
  type CallView, type Transition,
} from './call-state';
import { buildIceConfig, type IceConfig } from './ice-config';
import { reachOf, type Reach } from './reach';
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
    // Presence, for the one question the participant rows cannot answer:
    // is anybody on this call still connected? See sweepStale.
    private readonly redis: RedisService,
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

  /**
   * The call ringing FOR this citizen right now, if any — or null.
   *
   * The CALL_RINGING socket frame only reaches tabs that exist when it is
   * emitted. A receiver who opens the app from the push notification, reloads,
   * or whose phone wakes a suspended tab arrives AFTER that instant — and a
   * phone that is still ringing must still be answerable. The client asks this
   * on load, on socket reconnect, and when its tab becomes visible.
   *
   * Their own outgoing ring is not an incoming call, and a ring past its
   * window is a missed call, not a ringing one — both answer null.
   */
  async ringingFor(userId: string, now: Date = new Date()) {
    // unbounded: one citizen's simultaneously-ringing calls — one, in practice
    const rows = await this.callSession.findMany({
      where: { status: 'ringing', participants: { some: { userId } } },
      include: { participants: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const live = rows.find((r) => r.createdById !== userId && !ringExpired(r.createdAt, now));
    return live ? this.shape(live) : null;
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

  /**
   * How to reach the other person in this conversation when the app is not the
   * answer — the dialler, or their WhatsApp thread.
   *
   * The membership check is the same one `start` makes, and for the same
   * reason: a conversation id travels, and it must not be the permission.
   * Everything after it is `reachOf`, which is where the rules live. Note that
   * the query excludes the asker, so this can never hand somebody their own
   * number back and call it a peer's.
   */
  async reach(userId: string, conversationId: string): Promise<Reach> {
    await this.permission.assertCanPostToConversation(userId, conversationId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, kind: true, anonymousTrust: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // unbounded: one conversation's members, less the asker — group-sized
    const others = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { user: { select: { phoneE164: true, phoneVerifiedAt: true, deletedAt: true } } },
    });

    return reachOf(conversation, others.map((m) => m.user));
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

    /* A BLOCK STOPS A PHONE RINGING — IN A GROUP TOO.
       The gate above only applies block rules to DIRECT conversations, and for
       a good reason: a block "is not a way to remove somebody from a room full
       of other people". But "still in the room" was read as "may be made to
       ring", so anybody sharing any group with somebody who had blocked them
       could put a full-screen ringing call on their phone, once a minute, for
       as long as they liked. They stay in the room, on the roster and in the
       history; they are simply not rung.
       Fails CLOSED, deliberately: if this read cannot be made, the cost of
       guessing wrong is the harassment this exists to stop. */
    const blocked = await this.permission.blockedWith(userId);
    const recipientIds = memberIds.filter((id) => id !== userId && !blocked.has(id));
    if (!recipientIds.length) throw new BadRequestException('There is nobody to call.');

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

    /* GLARE — TWO PEOPLE PRESS CALL IN THE SAME SECOND.
       The lookup above is a read and the create is a write, so both requests
       can pass the read and the conversation ends up holding two live calls:
       the one thing the invariant in this docblock says never happens, and the
       reason it matters is that each half of the pair then negotiates against a
       different session and neither of them hears anything. Nothing in the
       schema catches it — the partial unique index that would is not there — so
       the race is settled after the fact, and settled the SAME WAY BY BOTH
       REQUESTS: re-read this conversation's live calls and keep the oldest.
       The loser closes its own row and joins the winner, which is exactly what
       it would have done had it seen that row a millisecond earlier. */
    const oldest = await this.oldestLive(dto.conversationId, now);
    if (oldest && oldest.id !== call.id) {
      await this.close(await this.reload(call.id), { status: 'ended', endedReason: 'cancelled', started: false });
      // Nothing was ever broadcast about the losing row, so nothing has to be
      // taken back — the citizen simply lands in the call that won.
      return this.join(userId, oldest.id);
    }

    const fresh = await this.reload(call.id);
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
    // The state AFTER this leave, not the snapshot taken before it. Reading
    // `row` here made two simultaneous declines each see the other person as
    // still being rung, so neither ended the call and a group call was left
    // ringing at nobody until the sweep.
    const move = afterLeave(this.view(after), userId);
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
   * Four things have to hold, and each has been a bug in somebody's call
   * implementation: the call must be live, the sender must still belong to the
   * conversation, the *recipient* must be on this call's roster, and the
   * recipient must still belong to the conversation too. Skipping the third
   * turns the signalling channel into an unsolicited-message channel addressed
   * by user id; skipping the fourth leaves it open to somebody the room has
   * since removed, or who has since blocked the sender.
   */
  async assertMaySignal(from: string, callId: string, to: string): Promise<void> {
    if (from === to) throw new BadRequestException('You cannot signal yourself.');
    const row = await this.loadAuthorised(from, callId);
    if (row.status === 'ended') throw new BadRequestException('That call has ended.');
    const roster = (row.participants ?? []).map((p) => p.userId);
    if (!roster.includes(from) || !roster.includes(to)) {
      throw new ForbiddenException('That person is not on this call.');
    }
    /* AND THE ROSTER IS A RECORD, NOT A PERMISSION — FOR THE RECIPIENT TOO.
       The roster is frozen at `start`, and the only membership re-checked per
       frame was the SENDER's, because that is what `loadAuthorised` asks. So
       somebody removed from a group, or who blocked the caller after the call
       began, stayed addressable at 16 KB a frame for as long as the call was
       left open — and `assertCanPostToConversation` cannot close that hole for
       them, because it applies block and unmatch rules to DIRECT conversations
       only. One membership read and one block read, per frame, on the same
       principle as the sender's: authorise every frame or authorise nothing.
       All three refusals say the same thing, so this never reports that a
       block exists. */
    const stillAMember = await this.prisma.conversationMember.findFirst({
      where: { conversationId: row.conversationId, userId: to },
      select: { userId: true },
    });
    if (!stillAMember) throw new ForbiddenException('That person is not on this call.');
    if (await this.permission.isBlocked(from, to)) {
      throw new ForbiddenException('That person is not on this call.');
    }
  }

  // ── the sweep ──────────────────────────────────────────

  /**
   * Calls nobody answered, and calls everybody walked away from.
   *
   * Without this a call rings forever: the caller closes the tab, no leave ever
   * arrives, and the conversation is left holding a live call that blocks the
   * next one (see the invariant in `start`). Runs from a cron, spans every
   * citizen because that is what a sweep is, and writes only by ids it has just
   * read.
   *
   * The second half of that sentence is newer, and it is the one that had no
   * backstop: an ACTIVE call was skipped forever on the strength of two columns
   * that nobody had written a leave into. `stillConnected` is what makes the
   * skip mean what it says.
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
      // An active call with people still ON it is not stale, however long it runs.
      if (row.status === 'active' && (await this.stillConnected(row))) continue;
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

  /**
   * Somebody who closed the laptop leaves the call they were on.
   *
   * Called when a citizen's LAST socket has gone and stayed gone (see
   * ChatGateway.handleDisconnect for the grace period, which is what keeps a
   * reload and a wifi blip from hanging up a healthy call). Without it the only
   * way an abandoned call ended was the sweep, a minute of "Connecting…" later.
   *
   * A call that is merely RINGING for them is left alone: a phone ringing on
   * three devices is not three people in a call, and closing one tab is not a
   * decline. Only a seat somebody actually took is given up.
   */
  async leaveAbandoned(userId: string): Promise<number> {
    // unbounded: one citizen's live calls — one, in practice
    const rows = await this.callSession.findMany({
      where: { status: { in: ['ringing', 'active'] }, participants: { some: { userId } } },
      include: { participants: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    let left = 0;
    for (const row of rows) {
      const mine = (row.participants ?? []).find((p) => p.userId === userId);
      if (!mine?.joinedAt || mine.leftAt) continue;
      try {
        await this.leave(userId, row.id);
        left++;
      } catch (e) {
        this.logger.warn(`could not leave abandoned call ${row.id}: ${(e as Error).message}`);
      }
    }
    return left;
  }

  // ── internals ──────────────────────────────────────────

  /**
   * Is anybody on this call still connected?
   *
   * NOT "is anybody present": present is two columns — joinedAt set, leftAt
   * null — written by a request that arrives only when somebody presses a
   * button. Both people closing their laptops writes nothing, so the row stayed
   * `active` with a full house forever, the sweep skipped it every minute for
   * the rest of time, and the next `start` in that conversation joined the
   * corpse instead of ringing anyone: the caller sat on "Connecting…" with the
   * microphone open and nobody's phone made a sound.
   *
   * Presence is the liveness signal because it is the only one in this system
   * that expires on its own: a Redis key the client's heartbeat refreshes every
   * 30 seconds and that dies 90 seconds after the browser does. It survives a
   * reload and a wifi blip — which is why an abandoned call is not closed the
   * instant a socket drops — and it does not survive a closed lid.
   */
  private async stillConnected(row: CallRow): Promise<boolean> {
    const present = (row.participants ?? []).filter((p) => p.joinedAt && !p.leftAt);
    for (const p of present) {
      if (await this.redis.isOnline(p.userId)) return true;
    }
    return false;
  }

  /**
   * This conversation's live call, oldest first — the tie-break that settles
   * glare. Both rival requests read the same rows and sort them the same way,
   * so both name the same winner without talking to each other. The id breaks a
   * tie on the timestamp, because two creates can land in one millisecond.
   */
  private async oldestLive(conversationId: string, now: Date): Promise<CallRow | null> {
    const rows = await this.callSession.findMany({
      where: { conversationId, status: { in: ['ringing', 'active'] } },
      include: { participants: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    const live = rows
      .filter((r) => !(r.status === 'ringing' && ringExpired(r.createdAt, now)))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    return live[0] ?? null;
  }

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
    const after = await this.reload(row.id);
    /* AND THE RING COMES OFF THE LOCK SCREEN.
       `notifyIncomingCall` puts a notification up under the tag `call-<id>` and
       nothing ever took it down, so a call nobody answered sat there reading
       "Incoming call — Asha is calling you" in the present tense for as long as
       the phone stayed locked, and tapping it hours later opened a thread for a
       call `join` refuses. This is the one chokepoint every ending goes
       through — cancel, decline, hang up, the sweep — so it is the only place
       that has to remember. Only people who were RUNG and never joined are
       told: the person who hung up does not need to be told they hung up.
       Swallowed, and deliberately: a notification that fails to be corrected is
       worse than a call that fails to end. */
    if (res.count && after) {
      const rung = (after.participants ?? [])
        .filter((p) => p.userId !== after.createdById && !p.joinedAt)
        .map((p) => p.userId);
      if (rung.length) {
        void this.notifications.notifyCallEnded({
          conversationId: after.conversationId,
          callerId: after.createdById,
          recipientIds: rung,
          callId: after.id,
          type: after.type,
          missed: after.endedReason === 'missed' || after.endedReason === 'cancelled',
        }).catch(swallowed('calls: taking the ring off the lock screen', undefined));
      }
    }
    return { row: after, closed: res.count > 0 };
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
