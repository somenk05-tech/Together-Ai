# Together City — Real-Time Chat

Connection-gated, WhatsApp-quality messaging for Together City.
**A user can only message another user when they share an `ACCEPTED` connection.** Any
other attempt returns **403 Forbidden** — enforced centrally in
`ConnectionPermissionService` and reinforced by conversation membership.

Stack: **NestJS · Prisma · PostgreSQL · Socket.IO · Redis · JWT · Zod · FCM · R2/S3.**

> Status: **Backend foundation (this session).** The connection gate, auth, conversations,
> messages (send/edit/delete/read/delivered, reply, cursor pagination, search), the
> Socket.IO gateway (presence, typing, receipts, offline sync), media presign, and the
> push-notification decision layer are implemented. Media post-processing, real FCM/S3
> calls, and the React UI are stubbed behind clean interfaces — see `ARCHITECTURE.md`
> → Roadmap for the remaining phases.

## Quick start
```bash
cp .env.example .env            # fill DATABASE_URL, REDIS_URL, JWT secrets
npm install
npm run prisma:generate
npm run prisma:migrate          # creates tables
npm run seed                    # demo users + connections + messages
npm run start:dev               # REST on :4000/api, WS on :4000
```

### Demo logins (password `password123`)
| handle        | can chat with                    |
|---------------|----------------------------------|
| `asha`        | `ravi` (friend), `dr_meena` (doctor) |
| `ravi`        | `asha`. **Not** `coach_kiran` (request still pending → 403) |
| `coach_kiran` | nobody yet (pending) — demonstrates the gate |

## REST API (all routes under `/api`, all require `Authorization: Bearer <access>`)
| Method | Path | Purpose |
|-------|------|---------|
| POST | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | JWT access + rotating refresh |
| POST | `/connections/request` `/connections/respond` · GET `/connections` | connection lifecycle |
| POST | `/chat/start` | get-or-create a direct conversation (gated) |
| GET  | `/chat/conversations` | list with unread counts |
| GET  | `/chat/:id/messages?cursor=&limit=` | cursor pagination (no OFFSET) |
| POST | `/messages` | send (gated) |
| PUT  | `/messages/:id` | edit (15-min window) |
| DELETE | `/messages/:id` | delete for me / everyone |
| POST | `/messages/read` `/messages/delivered` | receipts |
| GET  | `/messages/search` | keyword / sender / type / date |
| POST | `/media/upload` | pre-signed R2/S3 upload URL |
| GET  | `/users/online` | online among your connections |

## Socket.IO events
`join_conversation` · `leave_conversation` · `send_message` → `receive_message` ·
`message_delivered` · `message_read` · `message_deleted` · `message_edited` ·
`typing_start` / `typing_stop` (auto-stop after 3s) · `user_online` / `user_offline` ·
`heartbeat`. Every payload is Zod-validated; the connection gate runs on `join` and `send`.

Handshake auth: `io(url, { auth: { token: <accessToken> } })`.

## Testing
```bash
npm test          # unit (connection gate, message policy)
npm run test:e2e  # integration
```

## Module map (`src/`)
`auth` · `users` (+presence) · `connections` (+permission core) · `conversations` ·
`messages` · `chat` (Socket.IO gateway) · `media` · `notifications` · `shared`
(prisma, redis, config, events bus, zod, filters). Every module is independent and
wired via DI; the domain layer never imports the transport layer (they communicate
through `ChatEventBus`).

See `ARCHITECTURE.md` for schema, data flows, security, performance, and the roadmap
(React UI, calls, encryption, communities, payments-in-chat).
