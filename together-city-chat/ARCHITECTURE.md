# Together City Chat — Architecture

## 1. Principle: the connection gate
The system's invariant: **communication requires an `ACCEPTED` connection.**
It is enforced in one place, `ConnectionPermissionService`, which every send / edit /
delete / conversation-start passes through:

```
send_message ─▶ assertCanPostToConversation(user, convo)
                 ├─ member of convo?                   no ─▶ 403
                 └─ DIRECT? assertCanCommunicate(a,b)   no ─▶ 403
                            └─ Connection(status=ACCEPTED)?  no ─▶ 403
```

Connections are **order-independent**: the smaller user id is always stored as
`userOneId`, so a pair maps to exactly one row per `connectionType` and lookups never
need `OR (a,b) (b,a)` on the hot path (`@@unique([userOneId,userTwoId,connectionType])`).

### Extending connection types
Add a value to the `ConnectionType` enum (schema) and one entry to
`connection-permission.rules.ts`. No messaging code changes. Types shipped: friends,
couples, family, business↔customer, doctor↔patient, nutritionist↔client, lawyer↔client,
marketplace buyer↔seller, event participants. `requiresExternalEvent` flags the types
that must be created by a domain event (an order, an assignment) rather than a raw
friend-style request; the owning domain calls `connections.request` once that event exists.

## 2. Layers & dependency direction
```
transport (chat gateway, REST controllers)
      │  depends on
domain services (messages, conversations, connections, notifications, media)
      │  depends on
data (Prisma) + presence (Redis)
```
The domain layer **never imports** the transport layer. Services publish to an in-process
`ChatEventBus`; the gateway subscribes and fans events to Socket.IO rooms. This is why a
REST-sent message and a socket-sent message reach recipients through the identical path.

## 3. Data model
`User · RefreshToken · DeviceToken · Connection · Conversation · ConversationMember ·
Message · MessageStatus · Attachment`. Indexes cover the hot paths: message pagination
(`[conversationId, createdAt]`), sender, per-recipient status (`[userId, status]`),
connection lookups (`[userOneId,status]`,`[userTwoId,status]`), membership (`[userId]`).

Read receipts are per-recipient rows in `MessageStatus` (`SENT → DELIVERED → READ`),
which is what powers single / double / blue ticks and group read state.

## 4. Real-time flows
**Send:** validate JWT (handshake) → validate connection + membership → persist message +
per-recipient `SENT` status (single transaction) → bus `message.created` → gateway emits
`receive_message` to the conversation room → recipients not in-room get an FCM push.

**Delivered/Read:** recipient emits `message_delivered` / `message_read` (or calls the REST
ack) → status rows advance → bus events → sender sees ticks update live; `lastReadAt`
advances for unread counts.

**Typing:** `typing_start` relayed to the room; server auto-emits `typing_stop` after 3s.

**Presence:** handshake marks online in Redis (socket-set per user) and persists
`onlineStatus`/`lastSeen` to Postgres on the *first* connect and *last* disconnect;
`heartbeat` refreshes a TTL key. Redis is the fast source of truth; Postgres is durable.

**Offline sync:** on connect, `pendingForUser` returns all `SENT`/`DELIVERED` messages so a
reconnecting client catches up; while offline, an FCM push is sent (unless muted / chat open).

## 5. Push rules
Push only when the recipient is **offline**, or online but does **not** have that
conversation open (tracked in Redis `openconv:<user>`), and not muted. Never to the sender.
Payload carries sender name, avatar, preview, and a `togethercity://chat/<id>` deep link.

## 6. Media pipeline
Client asks `POST /media/upload` → server returns a **pre-signed** R2/S3 PUT URL → client
uploads directly to the bucket → client sends a message referencing the object URL. Cloud
credentials are optional in dev (the provider returns deterministic URLs). Production
hooks (async worker triggered by bucket event/queue): `generateThumbnail`, `compressImage`,
`transcodeVideo`; a virus-scan hook gates public serving. Max upload + mime allow-list are
enforced server-side.

## 7. Security
JWT access (short) + rotating, hashed, single-use refresh tokens · Argon2 password hashing ·
Helmet · CORS allow-list · Throttler (rate limiting) · Zod validation on every REST body and
socket payload · Prisma parameterised queries (SQL-injection safe) · tombstoned messages never
leak text · WSS/HTTPS in production · upload size cap + mime allow-list + virus-scan hook.

## 8. Performance
Redis for presence, open-conversation, and (next) unread-count + conversation-list caches ·
cursor pagination (never OFFSET) · targeted composite indexes · single-transaction writes for
message+status+attachments · `include` shaping to avoid N+1. Target <100ms delivery: the
gateway does O(1) room emits; all DB work is awaited in services before broadcast.

### Scaling to millions
Swap the in-process `ChatEventBus` for a Redis pub/sub (or the Socket.IO Redis adapter) so
events fan out across nodes; run the gateway stateless behind a sticky-session LB; move media
processing + push to a queue (BullMQ). The schema and module boundaries do not change.

## 9. Roadmap (phased)
1. **Foundation (done this session):** gate, auth, conversations, messages, gateway, presence,
   media presign, push decisioning, seed, unit tests.
2. **Wire real providers:** firebase-admin (FCM), @aws-sdk S3/R2 presign, media worker.
3. **React UI:** conversation list (unread/pinned/archive/mute/search), thread with infinite
   scroll + date separators + sticky headers, typing/online/receipts, reply preview, media
   viewer, voice recorder, emoji picker, dark mode, mobile-first. State via a socket-backed
   store (Zustand/Redux Toolkit) with optimistic sends keyed by `clientId`.
4. **Hardening:** e2e tests (offline delivery, reconnection, permission matrix), load tests,
   observability (structured logs, metrics, tracing).
5. **Future (design already accommodates):** voice/video calls (WebRTC signalling over the same
   gateway), AI assistant + message suggestions, business chatbots, E2E encryption
   (per-device keys; server stores ciphertext), communities, broadcast channels, stories,
   live location, payments-in-chat (a `PAYMENT` message type + escrow service). None require a
   rewrite — they attach as new modules + message types behind the existing gate.

## 10. Reactions (architecture-ready)
Add a `MessageReaction(messageId, userId, emoji)` table + `message.reaction` bus events; the
gateway already has the room fan-out pattern to broadcast them. UI slot is reserved.
