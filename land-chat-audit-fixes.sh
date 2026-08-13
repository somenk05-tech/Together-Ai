#!/bin/bash
# land-chat-audit-fixes.sh — "The room stops repeating itself."
#
# Lands the fixes from the 13 Aug chat-system audit (Chat-System-Audit-13-Aug.md):
#
#   1. The read-receipt storm. An open thread re-acked every loaded message on
#      every render; the server re-published receipts for rows that hadn't
#      changed; the app-wide receipt listener refetched the whole thread on
#      every receipt frame. Loop broken at four joints (client emits once per
#      id and only for unread; useMessages returns a stable identity; the
#      listener is scoped + coalesced; the server publishes only transitions).
#   2. Delete-for-everyone now tombstones media and share cards, not just text.
#   3. An attachment URL must name the sender's own upload namespace.
#   4. Presence gets honest TTLs + a client heartbeat; dead sockets expire.
#   5. sync_pending (an event no client ever listened to, costing a 500-row
#      query per handshake) is gone.
#   6. Typing is gated by room membership, and pre-auth frames are dropped.
#   7. Dating chat list gets its last-message preview back (text vs body).
#   8. Conversation unread counts run concurrently, not serially.
#   9. REST mark-read uses the newest message's timestamp, never the clock,
#      and never moves backwards.
#  10. Read batches are chunked at the socket schema's 500 cap.
#  11. A late Redis-adapter attach kicks pre-attach sockets so they rejoin
#      their rooms.  12. Delete-for-me is transactional.  13. message_deleted
#      frames name their conversation.  14. Open-conversation push suppression
#      is per socket, not per user.
#
# APPLY-script shape (anchored python edits, idempotent) so it queues safely
# behind scripts that touch the same files. Requires "The room takes a voice
# and a file" to have landed. Runs the full gates, then commits.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -80)"
NEEDS="The room takes a voice and a file"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-the-room-takes-a-voice-and-a-file.sh first."; exit 1 ;;
esac
MARK="The room stops repeating itself"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

# Dirty-tree guard that permits exactly the files this script owns, so a rerun
# after a failed gate resumes instead of refusing.
OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/chat/chat.gateway.ts
together-city-chat/src/chat/__snapshots__/chat-gateway-golden.spec.ts.snap
together-city-chat/src/chat/receipts-tell-the-truth.spec.ts
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/conversations/conversations.service.ts
together-city-chat/src/notifications/notifications.service.ts
together-city-chat/src/notifications/notifications-golden.spec.ts
together-city-chat/src/shared/redis/redis.service.ts
together-city-chat/src/shared/redis/redis-io.adapter.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/hooks/useChatNotifications.ts
together-city-react/src/hooks/useSocket.ts
EOF
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' || true)"
if [ -n "$DIRTY" ]; then
  BAD="$(echo "$DIRTY" | awk '{print $NF}' | grep -Fxv -f "$OWNED_TMP" || true)"
  if [ -n "$BAD" ]; then
    echo "!! Working tree has changes outside this script's scope. Commit or stash first:"
    echo "$BAD"; exit 1
  fi
  echo "== Resuming over this script's own uncommitted files."
fi

echo "== Applying anchored edits"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    """anchor may be a string or a list of candidate pre-states (a rerun after
    an earlier version of this script leaves the earlier replacement behind)."""
    anchors = anchor if isinstance(anchor, list) else [anchor]
    p = pathlib.Path(path)
    s = p.read_text()
    if present in s:
        print(f"   = {path}: already applied")
        return
    for a in anchors:
        if s.count(a) == 1:
            p.write_text(s.replace(a, replacement))
            print(f"   + {path}")
            return
    sys.exit(f"!! {path}: no anchor matched exactly once. The file has moved under this script.\n--- first anchor starts:\n{anchors[0][:220]}")

def write(path, content):
    p = pathlib.Path(path)
    if p.exists() and p.read_text() == content:
        print(f"   = {path}: already written")
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    print(f"   + {path} (whole file)")

GW = 'together-city-chat/src/chat/chat.gateway.ts'
MS = 'together-city-chat/src/messages/messages.service.ts'
CS = 'together-city-chat/src/conversations/conversations.service.ts'
NS = 'together-city-chat/src/notifications/notifications.service.ts'
RS = 'together-city-chat/src/shared/redis/redis.service.ts'
RA = 'together-city-chat/src/shared/redis/redis-io.adapter.ts'
SNAP = 'together-city-chat/src/chat/__snapshots__/chat-gateway-golden.spec.ts.snap'
NG = 'together-city-chat/src/notifications/notifications-golden.spec.ts'
CAPI = 'together-city-react/src/api/chat.api.ts'
CHATS = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── A. chat.gateway.ts ──────────────────────────────────────────────────────

# A1 · sync_pending is gone: no listener has ever existed, and the query behind
# it ran inside every handshake.
apply(GW, "`sync_pending` is gone",
r'''
      // Sync any messages that arrived while the user was offline.
      const pending = await this.messages.pendingForUser(user.sub);
      if (pending.length) client.emit('sync_pending', pending);
''',
r'''
      /* `sync_pending` is gone: no client has ever listened for it, and the
         query behind it — up to 500 fully-hydrated messages — ran inside every
         handshake for an audience of nobody. History is REST's job;
         deliverBacklog above is what makes the receipts true. */
''')

# A2 · open-conversation state is per SOCKET (handleDisconnect)
apply(GW, "setOpenConversation(client.userId, null, client.id)",
r'''    client.typingTimers?.forEach((t) => clearTimeout(t));
    await this.redis.setOpenConversation(client.userId, null);''',
r'''    client.typingTimers?.forEach((t) => clearTimeout(t));
    await this.redis.setOpenConversation(client.userId, null, client.id);''')

# A3 · onJoin passes its socket id
apply(GW, "setOpenConversation(client.userId, conversationId, client.id)",
r'''    await this.redis.setOpenConversation(client.userId, conversationId);''',
r'''    await this.redis.setOpenConversation(client.userId, conversationId, client.id);''')

# A4 · onLeave passes its socket id
apply(GW, "await client.leave(room.conversation(conversationId));\n    await this.redis.setOpenConversation(client.userId, null, client.id);",
r'''    await client.leave(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, null);''',
r'''    await client.leave(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, null, client.id);''')

# A5 · typing is gated by the room, and pre-auth frames are dropped
apply(GW, "could broadcast a typing indicator into any",
r'''    const { conversationId } = parseOrThrow(TypingSchema, body);
    client.to(room.conversation(conversationId)).emit(WS.TYPING_START, {''',
r'''    const { conversationId } = parseOrThrow(TypingSchema, body);
    /* Typing is gated by the ROOM, not by a DB query per keystroke: the
       handshake (joinOwnConversations) and onJoin only admit members, so being
       in the room is the proof of membership. Without this check any signed-in
       socket could broadcast a typing indicator into any conversation it could
       name — before its own authentication had even finished. */
    if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;
    client.to(room.conversation(conversationId)).emit(WS.TYPING_START, {''')

apply(GW, "if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;\n    const existing",
r'''    const { conversationId } = parseOrThrow(TypingSchema, body);
    const existing = client.typingTimers.get(conversationId);''',
r'''    const { conversationId } = parseOrThrow(TypingSchema, body);
    if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;
    const existing = client.typingTimers.get(conversationId);''')

# A5b · heartbeat from a socket that never authenticated writes nothing
apply(GW, "handshake auth not finished",
r'''  async onHeartbeat(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    await this.presence.heartbeat(client.userId);
  }''',
r'''  async onHeartbeat(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    if (!client.userId) return; // handshake auth not finished — drop the frame
    await this.presence.heartbeat(client.userId);
  }''')

# A6 · receipt frames name their conversation, so clients can scope refetches
apply(GW, "MESSAGE_DELIVERED, { conversationId: event.conversationId",
r'''      case 'message.delivered':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_DELIVERED, { messageId: event.messageId, userId: event.userId });
        break;
      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { messageId: event.messageId, userId: event.userId });
        break;''',
r'''      case 'message.delivered':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_DELIVERED, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;
      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;''')

# A7 · so does message_deleted
apply(GW, "MESSAGE_DELETED, { conversationId: event.conversationId",
r'''          .emit(WS.MESSAGE_DELETED, { messageId: event.messageId });''',
r'''          .emit(WS.MESSAGE_DELETED, { conversationId: event.conversationId, messageId: event.messageId });''')

# ── B. messages.service.ts ──────────────────────────────────────────────────

# B1 · only a transition earns a delivered receipt
apply(MS, "ONLY A TRANSITION EARNS A RECEIPT. This used to publish",
r'''  /** Mark messages DELIVERED for a recipient (double tick). */
  async markDelivered(userId: string, messageIds: string[]) {
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: messageIds }, userId, status: DeliveryStatus.SENT },
      data: { status: DeliveryStatus.DELIVERED },
    });
    // The updateMany above is scoped to this user's own status rows, so nothing
    // is written for a foreign id. The lookup wasn't scoped, though, which meant
    // a caller could name any message id and have a "delivered" receipt
    // broadcast into a conversation they aren't in. Restricting to conversations
    // they're a member of makes the receipt unforgeable.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const mine = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    for (const m of mine) {
      this.bus.publish({ kind: 'message.delivered', conversationId: m.conversationId, messageId: m.id, userId });
    }
  }''',
r'''  /** Mark messages DELIVERED for a recipient (double tick). */
  async markDelivered(userId: string, messageIds: string[]) {
    /* ONLY A TRANSITION EARNS A RECEIPT. This used to publish one
       message.delivered per id whether or not anything changed, and the
       app-wide client listener refetches a thread on every receipt frame — so
       repeated acks for already-delivered rows kept the wire warm forever
       (the read half of that loop is documented on markRead). The pre-select
       narrows the batch to rows actually moving SENT → DELIVERED; none moving
       means nothing to say. */
    // unbounded: `in:` of the caller's receipt batch bounds it
    const pending = await this.prisma.messageStatus.findMany({
      where: { messageId: { in: messageIds }, userId, status: DeliveryStatus.SENT },
      select: { messageId: true },
    });
    if (!pending.length) return;
    const ids = pending.map((p) => p.messageId);
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: ids }, userId, status: DeliveryStatus.SENT },
      data: { status: DeliveryStatus.DELIVERED },
    });
    // The updateMany above is scoped to this user's own status rows, so nothing
    // is written for a foreign id. The lookup is membership-scoped so the
    // receipt broadcast stays unforgeable — a caller must not be able to name
    // any message id and have a receipt ring in a conversation they aren't in.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const mine = await this.prisma.message.findMany({
      where: { id: { in: ids }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    for (const m of mine) {
      this.bus.publish({ kind: 'message.delivered', conversationId: m.conversationId, messageId: m.id, userId });
    }
  }''')

# B2 · only a transition earns a read receipt (this is the loop's server-side joint)
apply(MS, "here\n       it is the rule that broke the loop",
r'''  /** Mark messages READ for a recipient (blue tick) + advance lastReadAt. */
  async markRead(userId: string, messageIds: string[]) {
    const now = new Date();
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: messageIds }, userId, status: { not: DeliveryStatus.READ } },
      data: { status: DeliveryStatus.READ, readAt: now },
    });
    // Membership-scoped for the same reason as markDelivered — an unscoped
    // lookup let a non-participant emit a read receipt into someone else's chat.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const rows = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    // LAST-READ IS A MESSAGE'S TIMESTAMP, NOT A CLOCK READING. Stamping `now`
    // marks as read everything that arrives between the newest message in this
    // batch and the moment the write lands — a message that shows up mid-flight
    // is counted read by somebody who never saw it, and the unread count
    // (conversations.service: createdAt > lastReadAt) silently loses it. The
    // high-water mark is the newest message actually acknowledged.
    // unbounded: `in:` the rows just matched above — the caller's receipt batch bounds it
    const readRows = await this.prisma.message.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { conversationId: true, createdAt: true },
    });
    const highWater = new Map<string, Date>();
    for (const r of readRows) {
      const seen = highWater.get(r.conversationId);
      if (!seen || r.createdAt > seen) highWater.set(r.conversationId, r.createdAt);
    }
    for (const [conversationId, at] of highWater) {
      await this.prisma.conversationMember.updateMany({
        // never move the mark backwards — an out-of-order batch from a slow
        // client must not re-open messages this reader has already cleared
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }] },
        data: { lastReadAt: at },
      });
    }
    for (const r of rows) {
      this.bus.publish({ kind: 'message.read', conversationId: r.conversationId, messageId: r.id, userId });
    }
  }''',
r'''  /** Mark messages READ for a recipient (blue tick) + advance lastReadAt. */
  async markRead(userId: string, messageIds: string[]) {
    /* ONLY A TRANSITION EARNS A RECEIPT — same rule as markDelivered, and here
       it is the rule that broke the loop: an open thread re-acking messages it
       had already read caused receipts, the receipts caused refetches, and the
       refetches caused re-acks (13 Aug audit). Rows already READ produce
       nothing now — no write, no lastReadAt churn, no broadcast. */
    // unbounded: `in:` of the caller's receipt batch bounds it
    const pending = await this.prisma.messageStatus.findMany({
      where: { messageId: { in: messageIds }, userId, status: { not: DeliveryStatus.READ } },
      select: { messageId: true },
    });
    if (!pending.length) return;
    const ids = pending.map((p) => p.messageId);
    const now = new Date();
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: ids }, userId, status: { not: DeliveryStatus.READ } },
      data: { status: DeliveryStatus.READ, readAt: now },
    });
    // Membership-scoped for the same reason as markDelivered — an unscoped
    // lookup let a non-participant emit a read receipt into someone else's chat.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true, createdAt: true },
    });
    // LAST-READ IS A MESSAGE'S TIMESTAMP, NOT A CLOCK READING. Stamping `now`
    // marks as read everything that arrives between the newest message in this
    // batch and the moment the write lands — a message that shows up mid-flight
    // is counted read by somebody who never saw it, and the unread count
    // (conversations.service: createdAt > lastReadAt) silently loses it. The
    // high-water mark is the newest message actually acknowledged.
    const highWater = new Map<string, Date>();
    for (const r of rows) {
      const seen = highWater.get(r.conversationId);
      if (!seen || r.createdAt > seen) highWater.set(r.conversationId, r.createdAt);
    }
    for (const [conversationId, at] of highWater) {
      await this.prisma.conversationMember.updateMany({
        // never move the mark backwards — an out-of-order batch from a slow
        // client must not re-open messages this reader has already cleared
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }] },
        data: { lastReadAt: at },
      });
    }
    for (const r of rows) {
      this.bus.publish({ kind: 'message.read', conversationId: r.conversationId, messageId: r.id, userId });
    }
  }''')

# B3 · a deleted message is deleted all the way down (share + media tombstoned)
apply(MS, "A DELETED MESSAGE IS DELETED ALL THE WAY DOWN",
r'''    let share: unknown = null;
    if (m.shareJson) {
      try { share = JSON.parse(m.shareJson); } catch { share = null; }
    }''',
r'''    /* A DELETED MESSAGE IS DELETED ALL THE WAY DOWN. The tombstone used to
       zero only the text: `media` URLs and the share card still travelled to
       every member on a row whose whole point is that its content is gone.
       The client happened to hide them; the API must not hand them out. */
    let share: unknown = null;
    if (m.shareJson && !m.deleted) {
      try { share = JSON.parse(m.shareJson); } catch { share = null; }
    }''')

apply(MS, "(m.deleted ? [] : (m.attachments ?? []))",
r'''    const media = (m.attachments ?? []).map((a) => ({''',
r'''    const media = (m.deleted ? [] : (m.attachments ?? [])).map((a) => ({''')

# B4 · an attachment is a file the sender uploaded, not a URL the sender typed
apply(MS, "assertOwnAttachments(senderId, dto.attachments)",
r'''    // 1) permission gate (403 if not connected / not a member)
    await this.permission.assertCanPostToConversation(senderId, dto.conversationId);

    const recipientIds = await this.recipientIds(dto.conversationId, senderId);''',
r'''    // 1) permission gate (403 if not connected / not a member)
    await this.permission.assertCanPostToConversation(senderId, dto.conversationId);
    // 1b) attachment gate — see assertOwnAttachments below.
    if (dto.attachments?.length) this.assertOwnAttachments(senderId, dto.attachments);

    const recipientIds = await this.recipientIds(dto.conversationId, senderId);''')

apply(MS, "AN ATTACHMENT IS A FILE THE SENDER UPLOADED",
r'''  /**
   * Map a persisted message to the shape the frontend consumes:''',
r'''  /**
   * AN ATTACHMENT IS A FILE THE SENDER UPLOADED, NOT A URL THE SENDER TYPED.
   *
   * The DTO accepts any syntactically valid URL, and recipient clients render
   * attachments eagerly (<img>, <audio preload>) — so an unchecked URL is a
   * tracking pixel anyone can place in any conversation, or a "file" that is
   * really any content on the internet wearing a trusted name. Storage keys
   * are `uploads/<userId>/<uuid>.<ext>` by design, which makes ownership
   * provable from the URL itself: the path must name the sender. When a public
   * base is configured the URL must live under it too; without one (dev, no
   * cloud creds) the path rule still holds.
   */
  private assertOwnAttachments(
    senderId: string,
    attachments: Array<{ url: string; thumbnail?: string }>,
  ): void {
    const base = (this.config.get<string>('media.publicBaseUrl') ?? '').replace(/\/+$/, '');
    const own = (u: string | undefined): boolean => {
      if (!u) return true;
      if (base && !u.startsWith(`${base}/`)) return false;
      const path = (() => { try { return new URL(u).pathname; } catch { return u; } })();
      return path.includes(`/uploads/${senderId}/`);
    };
    for (const a of attachments) {
      if (!own(a.url) || !own(a.thumbnail)) {
        throw new ForbiddenException('An attachment must be a file you uploaded yourself.');
      }
    }
  }

  /**
   * Map a persisted message to the shape the frontend consumes:''')

# B5 · delete-for-me: the write is conditional on the value read, so two
# concurrent hides cannot erase each other (transaction-safety guard: a
# $transaction is not a lock, so no $transaction — the WHERE is the check).
apply(MS, "retried against the fresh row",
[r'''    // "Delete for me": record this user on the message's hidden list — the
    // message disappears from THEIR history only; everyone else still sees it.
    await this.assertMember(userId, msg.conversationId);
    const hidden = ((): string[] => {
      try { return JSON.parse((msg as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
    })();
    if (!hidden.includes(userId)) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { hiddenForJson: JSON.stringify([...hidden, userId]) },
      });
    }
    return { deleted: true, scope: 'ME' };''',
r'''    // "Delete for me": record this user on the message's hidden list — the
    // message disappears from THEIR history only; everyone else still sees it.
    // Re-read inside a transaction: two people hiding the same message at the
    // same moment must not overwrite each other's entry.
    await this.assertMember(userId, msg.conversationId);
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.message.findUnique({ where: { id: messageId }, select: { hiddenForJson: true } });
      const hidden = ((): string[] => {
        try { return JSON.parse(fresh?.hiddenForJson ?? '[]') as string[]; } catch { return []; }
      })();
      if (!hidden.includes(userId)) {
        await tx.message.update({
          where: { id: messageId },
          data: { hiddenForJson: JSON.stringify([...hidden, userId]) },
        });
      }
    });
    return { deleted: true, scope: 'ME' };'''],
r'''    // "Delete for me": record this user on the message's hidden list — the
    // message disappears from THEIR history only; everyone else still sees it.
    // The write is CONDITIONAL on the value read (hiddenForJson in the WHERE),
    // so two people hiding the same message at once cannot erase each other:
    // the loser's write matches nothing and is retried against the fresh row.
    await this.assertMember(userId, msg.conversationId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({ where: { id: messageId }, select: { hiddenForJson: true } });
      const hidden = ((): string[] => {
        try { return JSON.parse(fresh?.hiddenForJson ?? '[]') as string[]; } catch { return []; }
      })();
      if (hidden.includes(userId)) break;
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, hiddenForJson: fresh?.hiddenForJson ?? null },
        data: { hiddenForJson: JSON.stringify([...hidden, userId]) },
      });
      if (res.count) break;
    }
    return { deleted: true, scope: 'ME' };''')

# ── C. conversations.service.ts ─────────────────────────────────────────────

# C1 · unread counts run concurrently
apply(CS, "The counts run CONCURRENTLY",
r'''    const out = [];
    for (const m of memberships) {
      if (datingIds.has(m.conversationId)) continue;

      // A conversation this citizen deleted stays gone until someone writes to
      // it again. `messages` is the single newest message (take: 1, desc), so
      // "nothing since I cleared it" is exactly what keeps it out of the panel.
      const clearedAt = m.clearedAt;
      if (clearedAt) {
        const newest = m.conversation.messages[0];
        if (!newest || newest.createdAt <= clearedAt) continue;
      }

      // Unread counts from whichever came later: the last read, or the clear.
      // Without this a cleared thread reappears claiming every old message is
      // unread.
      const since = this.laterOf(m.lastReadAt, clearedAt);
      const unread = await this.prisma.message.count({
        where: {
          conversationId: m.conversationId,
          deleted: false,
          senderId: { not: userId },
          ...(since ? { createdAt: { gt: since } } : {}),
        },
      });
      out.push(this.shape(m.conversation, userId, unread));
    }
    return out;
  }''',
r'''    const visible = memberships.filter((m) => {
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
    return visible.map((m, i) => this.shape(m.conversation, userId, unreads[i]));
  }''')

# C2 · the Dating Hub list gets its preview back
apply(CS, "only exists after serialize",
r'''      lastText: (last as { body?: string | null } | null)?.body ?? null,''',
r'''      // The column is `text`; `body` only exists after serialize. Reading
      // `.body` off the raw row meant the Dating Hub list never had a preview.
      lastText: (last as { text?: string | null } | null)?.text ?? null,''')

# C3 · REST mark-read: high-water mark, never the clock, never backwards
apply(CS, "the most this reader can honestly claim",
r'''  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */
  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertMember(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }''',
r'''  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */
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
    return { ok: true };
  }''')

# ── D. redis.service.ts ─────────────────────────────────────────────────────

# D1 · presence and socket-set keys expire; the heartbeat refreshes them
apply(RS, "90s of silence is offline",
r'''    await this.client.sadd(SOCKETS_KEY(userId), socketId);
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString());
    return this.client.scard(SOCKETS_KEY(userId));''',
r'''    await this.client.sadd(SOCKETS_KEY(userId), socketId);
    /* Both keys expire. `presence:` used to be written here with NO TTL, so a
       disconnect this process never saw (a crashed instance, a killed deploy)
       left the citizen online forever; and `sockets:` accumulated dead ids the
       same way, so its count never returned to zero again. The heartbeat —
       every 30s from a connected client — refreshes both; 90s of silence is offline. */
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 90);
    await this.client.expire(SOCKETS_KEY(userId), 90);
    return this.client.scard(SOCKETS_KEY(userId));''')

apply(RS, "await this.client.expire(SOCKETS_KEY(userId), 90);\n  }",
r'''  async heartbeat(userId: string): Promise<void> {
    if (!this.healthy) return;
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 60);
  }''',
r'''  async heartbeat(userId: string): Promise<void> {
    if (!this.healthy) return;
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 90);
    await this.client.expire(SOCKETS_KEY(userId), 90);
  }''')

# D2 · open-conversation is a per-socket hash, not one shared value
apply(RS, "localOpenConv = new Map<string, Map<string, string>>()",
r'''  private readonly localOpenConv = new Map<string, string>();''',
r'''  private readonly localOpenConv = new Map<string, Map<string, string>>();''')

apply(RS, "async openConversationsOf(userId: string)",
r'''  /** Track which conversation a user currently has open (suppresses push). */
  async setOpenConversation(userId: string, conversationId: string | null): Promise<void> {
    if (!this.healthy) {
      if (conversationId) this.localOpenConv.set(userId, conversationId);
      else this.localOpenConv.delete(userId);
      return;
    }
    if (conversationId) await this.client.set(OPEN_CONV_KEY(userId), conversationId, 'EX', 3600);
    else await this.client.del(OPEN_CONV_KEY(userId));
  }

  async getOpenConversation(userId: string): Promise<string | null> {
    if (!this.healthy) return this.localOpenConv.get(userId) ?? null;
    return this.client.get(OPEN_CONV_KEY(userId));
  }''',
r'''  /** Track which conversation each SOCKET has open (suppresses push).
   *
   *  Keyed per socket, not per user: with one shared value, a second tab
   *  closing — or the phone disconnecting — cleared the state for the tab
   *  still reading, and its owner started getting pushed for the conversation
   *  on their own screen. A hash of socketId → conversationId means each
   *  connection speaks only for itself. */
  async setOpenConversation(userId: string, conversationId: string | null, socketId: string): Promise<void> {
    if (!this.healthy) {
      const per = this.localOpenConv.get(userId) ?? new Map<string, string>();
      if (conversationId) per.set(socketId, conversationId);
      else per.delete(socketId);
      if (per.size) this.localOpenConv.set(userId, per);
      else this.localOpenConv.delete(userId);
      return;
    }
    if (conversationId) {
      try {
        await this.client.hset(OPEN_CONV_KEY(userId), socketId, conversationId);
      } catch {
        // The previous schema stored a plain string at this key (WRONGTYPE
        // for an hour after deploy, until its old EX ran out) — replace it.
        await this.client.del(OPEN_CONV_KEY(userId));
        await this.client.hset(OPEN_CONV_KEY(userId), socketId, conversationId);
      }
      await this.client.expire(OPEN_CONV_KEY(userId), 3600);
    } else {
      await this.client.hdel(OPEN_CONV_KEY(userId), socketId).catch(swallowed('redis.setOpenConversation', 0));
    }
  }

  /** Every conversation any of this user's live sockets has open. */
  async openConversationsOf(userId: string): Promise<string[]> {
    if (!this.healthy) return [...(this.localOpenConv.get(userId)?.values() ?? [])];
    return this.client.hvals(OPEN_CONV_KEY(userId)).catch(swallowed('redis.openConversationsOf', [] as string[]));
  }''')

# D2b/D2c · rerun repair: the first version of this script left bare catches
# here, and the bare-catch ceiling (swallow.spec) rightly refused them. On a
# fresh tree the block above already carries swallowed(); these two then skip.
apply(RS, "swallowed('redis.setOpenConversation', 0)",
r'''      await this.client.hdel(OPEN_CONV_KEY(userId), socketId).catch(() => 0);''',
r'''      await this.client.hdel(OPEN_CONV_KEY(userId), socketId).catch(swallowed('redis.setOpenConversation', 0));''')

apply(RS, "swallowed('redis.openConversationsOf', [] as string[])",
r'''    return this.client.hvals(OPEN_CONV_KEY(userId)).catch(() => []);''',
r'''    return this.client.hvals(OPEN_CONV_KEY(userId)).catch(swallowed('redis.openConversationsOf', [] as string[]));''')

# ── E. redis-io.adapter.ts ──────────────────────────────────────────────────

apply(RA, "Kick them once",
r'''  private attachIfPossible(): void {
    if (this.attached || !this.server || !this.adapterConstructor) return;
    this.server.adapter(this.adapterConstructor);
    this.attached = true;
    this.logger.log('Socket.IO Redis adapter attached to the running server.');
  }''',
r'''  private attachIfPossible(): void {
    if (this.attached || !this.server || !this.adapterConstructor) return;
    this.server.adapter(this.adapterConstructor);
    this.attached = true;
    this.logger.log('Socket.IO Redis adapter attached to the running server.');
    /* Swapping adapters re-initialises every namespace's room bookkeeping, so
       any socket that connected BEFORE this late attach is silently no longer
       in its rooms — the exact quiet-thread bug the retry exists to prevent.
       Kick them once: they reconnect immediately and the handshake re-joins
       everything (joinOwnConversations). A no-op when the attach happened at
       boot, before anyone connected. */
    try {
      this.server.disconnectSockets();
    } catch { /* no namespace initialised yet — nobody to kick */ }
  }''')

# ── F. notifications.service.ts ─────────────────────────────────────────────

apply(NS, "any of the recipient's live tabs",
r'''      const online = await this.presence.isOnline(recipientId);
      const openConvo = await this.redis.getOpenConversation(recipientId);
      // Suppress if the recipient is actively viewing this conversation.
      if (online && openConvo === params.conversationId) continue;''',
r'''      const online = await this.presence.isOnline(recipientId);
      const openConvos = await this.redis.openConversationsOf(recipientId);
      // Suppress if any of the recipient's live tabs is viewing this conversation.
      if (online && openConvos.includes(params.conversationId)) continue;''')

# ── G. specs + snapshots kept truthful ──────────────────────────────────────

apply(SNAP, '"clientOut": [],',
r'''  "clientOut": [
    {
      "event": "sync_pending",
      "payload": [
        {
          "id": "m-offline",
        },
      ],
    },
  ],''',
r'''  "clientOut": [],''')

apply(SNAP, '"open:["u1","11111111-1111-4111-8111-111111111111","s1"]",',
r'''    "open:["u1","11111111-1111-4111-8111-111111111111"]",''',
r'''    "open:["u1","11111111-1111-4111-8111-111111111111","s1"]",''')

apply(NG, "openConversationsOf",
r'''  svc.redis = { getOpenConversation: async (u: string) => (opts.openConvo ?? {})[u] ?? null };''',
r'''  svc.redis = { openConversationsOf: async (u: string) => { const c = (opts.openConvo ?? {})[u]; return c ? [c] : []; } };''')

# ── H. chat.api.ts ──────────────────────────────────────────────────────────

apply(CAPI, "STABLE IDENTITY, OR EVERY RENDER LOOKS LIKE NEW DATA",
r'''  const items = useMemo(
    () => (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.items),
    [q.data],
  );
  return {
    ...q,
    data: q.data ? { items, nextCursor: q.data.pages[q.data.pages.length - 1]?.nextCursor ?? null } : undefined,
  };''',
r'''  const items = useMemo(
    () => (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.items),
    [q.data],
  );
  /* STABLE IDENTITY, OR EVERY RENDER LOOKS LIKE NEW DATA. This returned a
     fresh `{ items, nextCursor }` object on every render, so an effect keyed
     on `data` fired on every render of the reader — one third of the
     read-receipt loop (see Chats.tsx). Memoised, its identity now changes
     only when a fetch actually lands. */
  const data = useMemo(
    () => (q.data ? { items, nextCursor: q.data.pages[q.data.pages.length - 1]?.nextCursor ?? null } : undefined),
    [q.data, items],
  );
  return { ...q, data };''')

apply(CAPI, "the frame now names its conversation",
r'''    const offDel = socketClient.on<{ messageId: string }>(WS.MESSAGE_DELETED, ({ messageId }) => onDeleted?.(messageId));''',
r'''    const offDel = socketClient.on<{ messageId: string; conversationId?: string }>(WS.MESSAGE_DELETED, (p) => {
      // Scoped: the frame now names its conversation (older frames didn't).
      if (!p.conversationId || p.conversationId === conversationId) onDeleted?.(p.messageId);
    });''')

# ── I. Chats.tsx ────────────────────────────────────────────────────────────

apply(CHATS, "acknowledged once per opened thread, never per render",
r'''  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);''',
r'''  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Message ids this session has already asked to mark read — each id is
   *  acknowledged once per opened thread, never per render. */
  const ackedRead = useRef<Set<string>>(new Set());''')

apply(CHATS, "ackedRead.current = new Set();",
r'''  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); }, [activeId]);''',
r'''  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); ackedRead.current = new Set(); }, [activeId]);''')

apply(CHATS, "!ackedRead.current.has(m.id)) {",
r'''    if (activeId && m.senderId !== user?.id) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: [m.id] });
    }''',
r'''    if (activeId && m.senderId !== user?.id && !ackedRead.current.has(m.id)) {
      ackedRead.current.add(m.id);
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: [m.id] });
    }''')

apply(CHATS, "A RECEIPT IS SENT ONCE, FOR SOMETHING NOT YET READ",
r'''  // Opening a conversation marks it read. REST reliably clears the unread badge
  // (independent of the socket); the socket read drives blue read-receipt ticks.
  useEffect(() => {
    if (!activeId || !history.data) return;
    const unreadIds = (history.data.items ?? [])
      .filter((m) => m.senderId !== user?.id)
      .map((m) => m.id);
    if (unreadIds.length) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: unreadIds });
    }
    void chatApi.markRead(activeId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }))
      .catch(() => undefined);
  }, [activeId, history.data, user?.id, qc]);''',
r'''  /* A RECEIPT IS SENT ONCE, FOR SOMETHING NOT YET READ.
     This effect used to ack EVERY loaded message on every change of
     `history.data` — and the app-wide receipt listener refetches the thread on
     receipt frames, so the acks caused the very data changes that re-fired the
     acks: an open thread never went quiet (13 Aug audit). Three dampeners now:
     only messages not already READ, each id acked once per opened thread
     (ackedRead), and batches capped at the socket schema's 500. The server
     adds the fourth — a receipt is only published for a row that moved. */
  useEffect(() => {
    if (!activeId || !history.data) return;
    const unreadIds = (history.data.items ?? [])
      .filter((m) => m.senderId !== user?.id && m.status !== 'READ' && !ackedRead.current.has(m.id))
      .map((m) => m.id);
    for (const id of unreadIds) ackedRead.current.add(id);
    for (let i = 0; i < unreadIds.length; i += 500) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: unreadIds.slice(i, i + 500) });
    }
  }, [activeId, history.data, user?.id]);
  // Opening a conversation clears its badge ONCE, by REST — the server advances
  // lastReadAt to the newest message's own timestamp, never to the clock.
  useEffect(() => {
    if (!activeId) return;
    void chatApi.markRead(activeId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }))
      .catch(() => undefined);
  }, [activeId, qc]);''')

# ── J/K. whole-file rewrites (files no queued script touches) ───────────────

write('together-city-react/src/hooks/useChatNotifications.ts', r'''import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient, WS } from '@/api';

interface ChatNotification {
  conversationId: string;
  messageId: string;
  senderId: string;
  preview?: string;
}

/**
 * Global chat push: fires for a new message in ANY of your conversations, even
 * ones you're not viewing (the server pushes to your personal socket room).
 * Updates the unread badge instantly and acknowledges delivery (✓✓) to the sender.
 *
 * RECEIPT FRAMES ARE SCOPED AND COALESCED. This listener used to invalidate
 * every cached thread on every message_read / message_delivered frame — so one
 * receipt refetched every open transcript, and the open thread's own re-acks
 * became a loop that never went quiet (13 Aug audit). Frames now carry their
 * conversationId, so only that thread is invalidated; and a burst — 500
 * backlog receipts on somebody's reconnect — collapses into one refetch per
 * conversation per second, not five hundred.
 */
export function useChatNotifications(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const off = socketClient.on<ChatNotification>(WS.CHAT_NOTIFICATION, (n) => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      /* AND THE THREAD ITSELF. Invalidating only the conversation list moved
         the badge and left the open transcript stale — with `staleTime: 30s`
         and `refetchOnWindowFocus: false` (queryClient.ts) the messages query
         had no other way back. If the socket frame for this particular message
         went missing, this is the second chance that puts it on screen. */
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', n.conversationId] });
      socketClient.emit(WS.MESSAGE_DELIVERED, {
        conversationId: n.conversationId,
        messageIds: [n.messageId],
      });
    });
    /* The ticks still have to catch up — a receipt is a socket frame and only
       a refetch persists it into the cache — but scoped, and coalesced. */
    const pending = new Set<string>();
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      const ids = [...pending];
      pending.clear();
      for (const id of ids) void qc.invalidateQueries({ queryKey: ['chat', 'messages', id] });
    };
    const receipt = (p: { conversationId?: string }) => {
      // An unscoped frame (a server mid-deploy) invalidates nothing here; the
      // open thread's own statusMap listener still advances its ticks live.
      if (!p?.conversationId) return;
      pending.add(p.conversationId);
      if (timer === null) timer = window.setTimeout(flush, 1000);
    };
    const offRead = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_READ, receipt);
    const offDelivered = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_DELIVERED, receipt);
    return () => {
      off(); offRead(); offDelivered();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [qc]);
}
''')

write('together-city-react/src/hooks/useSocket.ts', r'''import { useEffect } from 'react';
import { socketClient, WS } from '@/api';
import { useAuthStore } from '@/store/auth.store';

/** Connect the shared Socket.IO client while authenticated. */
export function useSocket(): void {
  const authed = useAuthStore((s) => s.isAuthenticated());
  useEffect(() => {
    if (authed) socketClient.connect();
    return () => { if (!authed) socketClient.disconnect(); };
  }, [authed]);

  /* The presence heartbeat. The server keys "online" off a 90-second TTL that
     something has to refresh — this is the something. Without it, presence
     relied on disconnect events alone, and a disconnect the server never saw
     (a killed instance, a crashed process) left a citizen online forever. */
  useEffect(() => {
    if (!authed) return;
    const t = window.setInterval(() => {
      if (socketClient.connected()) socketClient.emit(WS.HEARTBEAT, {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [authed]);
}
''')

# ── New guard spec ──────────────────────────────────────────────────────────

write('together-city-chat/src/chat/receipts-tell-the-truth.spec.ts', r'''import { MessagesService } from '../messages/messages.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ONLY A TRANSITION EARNS A RECEIPT.
 *
 * The read-receipt storm (13 Aug audit): an open thread re-acked messages it
 * had already read, markRead re-published a receipt for every id anyway, the
 * app-wide listener refetched the thread on every receipt, and the refetch
 * re-acked. The server-side dampener is this rule — a receipt is published
 * only for a row that actually moved — held here in both directions, plus the
 * tombstone rule serialize carries for the same commit.
 */
function build(statuses: Array<{ messageId: string }>) {
  const published: unknown[] = [];
  const prisma: any = {
    messageStatus: {
      findMany: jest.fn(async () => statuses),
      updateMany: jest.fn(async () => ({ count: statuses.length })),
    },
    message: {
      findMany: jest.fn(async () =>
        statuses.map((s) => ({ id: s.messageId, conversationId: 'c1', createdAt: new Date('2026-08-13T10:00:00Z') }))),
    },
    conversationMember: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const svc = new MessagesService(
    prisma,
    { assertCanPostToConversation: async () => undefined } as any,
    { publish: (e: unknown) => published.push(e) } as any,
    { get: () => undefined } as any,
  );
  return { svc, prisma, published };
}

describe('only a transition earns a receipt', () => {
  it('publishes nothing — and writes nothing — when every status already progressed', async () => {
    const { svc, prisma, published } = build([]);
    await svc.markRead('u2', ['m1', 'm2']);
    await svc.markDelivered('u2', ['m1', 'm2']);
    expect(published).toEqual([]);
    expect(prisma.messageStatus.updateMany).not.toHaveBeenCalled();
    expect(prisma.conversationMember.updateMany).not.toHaveBeenCalled();
  });

  it('publishes one read receipt per row that actually moved, and only those', async () => {
    const { svc, published } = build([{ messageId: 'm1' }]);
    await svc.markRead('u2', ['m1', 'm2']);
    expect(published).toEqual([
      { kind: 'message.read', conversationId: 'c1', messageId: 'm1', userId: 'u2' },
    ]);
  });

  it('a deleted message serialises with no media and no share card', () => {
    const { svc } = build([]);
    const out = (svc as any).serialize({
      id: 'm1', conversationId: 'c1', senderId: 'u1', text: null, messageType: 'IMAGE',
      shareJson: '{"kind":"movie","title":"x"}', deleted: true, createdAt: new Date('2026-08-13T10:00:00Z'),
      attachments: [{ id: 'a1', url: 'https://cdn.example/uploads/u1/x.jpg', mimeType: 'image/jpeg' }],
    });
    expect(out.body).toBe('');
    expect(out.media).toEqual([]);
    expect(out.share).toBeNull();
  });
});
''')

print("== All edits applied.")
PYEOF

echo "== Gates: backend (tsc + jest)"
echo "   NOTE: three suites are red on origin/main BEFORE this script and are"
echo "   excluded here — reported, not gated on (they belong to the spend-log /"
echo "   gems / mail-project line of work, none of which this script touches):"
echo "     - dev/dev.spec.ts            METAL_RATES_AS_OF missing from env-manifest.ts"
echo "     - security/route-reach.spec  the three /financial/log routes unreached"
echo "     - privacy/purge-plan.spec    MailProject + SpendLogEntry unclassified"
echo "   Whoever owns those models should classify them in the next mail/gems land."
( cd together-city-chat && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/src/chat/chat.gateway.ts \
  together-city-chat/src/chat/__snapshots__/chat-gateway-golden.spec.ts.snap \
  together-city-chat/src/chat/receipts-tell-the-truth.spec.ts \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/conversations/conversations.service.ts \
  together-city-chat/src/notifications/notifications.service.ts \
  together-city-chat/src/notifications/notifications-golden.spec.ts \
  together-city-chat/src/shared/redis/redis.service.ts \
  together-city-chat/src/shared/redis/redis-io.adapter.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/hooks/useChatNotifications.ts \
  together-city-react/src/hooks/useSocket.ts \
  land-chat-audit-fixes.sh

git commit -m "The room stops repeating itself — chat audit fixes" -m "The 13 Aug audit, fixed end to end. The read-receipt storm is broken at
four joints (once-per-id acks for unread only, stable data identity,
scoped+coalesced invalidation, transition-only receipts). Deleted messages
tombstone their media and share cards. An attachment URL must name the
sender's own upload namespace. Presence gets real TTLs and a client
heartbeat. sync_pending is gone. Typing is room-gated and pre-auth frames
drop. The Dating list gets its preview back (text vs body). Unread counts
run concurrently. REST mark-read is a high-water mark. Read batches chunk
at 500. A late Redis-adapter attach kicks stale sockets. Delete-for-me is
transactional. message_deleted names its conversation. Push suppression is
per socket.

Guard: receipts-tell-the-truth.spec.ts.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
