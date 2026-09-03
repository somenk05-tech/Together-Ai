# A Photo That Never Left The Bar — Chat Audit, 3 Sep

Scope: `together-city-react/src/features/chat/*`, `src/features/dating/pages/DatingChats.tsx`,
`src/api/chat.api.ts`, and `together-city-chat/src/{messages,chat,conversations,media}`.
Read-only audit. Nothing was changed.

---

## 0. Your example, answered

**The wire is fine.** I traced the whole path and the field names match end to end:
`Composer.sendFiles` uploads first, then sends (`Composer.tsx:116-145`); `chat.api.ts:371-387`
puts `attachments` on the socket frame; the server serialises them as `media[]`
(`messages.service.ts:1354-1378`); `MediaAttachmentSchema` declares exactly those names
(`schemas.ts:89-109`); `MessageBody` reads `m.media` / `a.kind === 'image'` / `a.url`
(`MessageBody.tsx:42-48, 134`); the gateway broadcasts to `conversation:<id>`, which the
**sender's own socket is in** (`chat.gateway.ts:376-378`). So when it works, it works, and both
sides see the photo without a refresh.

The reason it *looks* like the picture stays in the bar is four separate things, none of them
the plumbing:

**0.1 — A refused send is completely silent. This is the one to fix first.**
The gateway's only failure channel is `client.emit('error_event', …)`
(`ws-exception.filter.ts:14`, `chat.gateway.ts:259-262`). Grep the whole front end for
`error_event` and you get **one hit — the constant declaration**, `src/api/events.ts:24`.
Nothing listens. Nothing listens to `message_ack` either.

So when the server refuses a photo, this is what the user sees: the upload succeeds, `busy`
clears (`Composer.tsx:143`), the typed caption is wiped (`:138`), and **no bubble, no error,
no trace**. The refusals that hit this path:

- image moderation in a dating chat — `messages.service.ts:150 screenAttachments` throws
  `BadRequestException(verdict.reason)`; note it runs **only** where `anonymousTrust != null`,
  i.e. dating conversations, so this fails in dating and not in city chat, which is exactly the
  kind of "sometimes it doesn't send" that is impossible to report;
- the socket rate limit (`chat.gateway.ts:260`);
- a blocked pair or an ended match (`connection-permission.service.ts:101`);
- a replayed snap key (`messages.service.ts:165`).

**Fix:** subscribe to `WS.ERROR` in `useChatRealtime`, surface the message in the composer's
existing error slot, and **do not clear the text field until the send is acknowledged.** Add a
`message_ack` timeout (say 8s) that puts the message back as "failed — tap to retry".

**0.2 — There is no attachment tray.** Picking a file *is* sending it
(`Composer.tsx:167-171 onPick → sendFiles`). No preview, no caption written after the pick, no
cancel, no "remove this one of the three". And the Send key is disabled unless there is text
(`Composer.tsx:113`, `:322`) — so a user who attaches and then reaches for Send finds a dead
key and reasonably concludes the photo is sitting there waiting. If what you want is
attach → see it in the bar → press Send, that is a real change, not a bug fix: hold the
`OutgoingAttachment[]` in composer state, render chips above the capsule, and let `submit()`
send text-and-attachments together.

**0.3 — The image bubble has no size, so it shoves itself off screen.**
`MessageBody.tsx:42-48` renders `<img>` with no `width`/`height`/`aspect-ratio`. The scroll
effect (`MessageThread.tsx:166-171`) fires on `messages.length` while the bubble is still ~0px
tall; the photo then decodes and pushes the newest message below the fold. On the sender's own
photo this reads as "it didn't send".
The server DTO already accepts `width`/`height` (`messages.dto.ts:63-64`) and `attachmentRow`
persists them (`messages.service.ts:1146-1148`) — but `serialize()` drops both from `media[]`
and the client schema doesn't declare them, so the client *structurally cannot* size a photo
today. Close that loop and set `aspect-ratio`.

**0.4 — `thumbUrl` is dead code and every chat photo is the full original.**
`serialize()` sets `thumbUrl: a.thumbnail ?? undefined` (`messages.service.ts:1371`), but
`OutgoingAttachment` has no `thumbnail` field (`chat.api.ts:34-45`) and the composer never
sends one. So `a.thumbUrl` is always undefined and a 4 MB phone photo is downloaded in full to
fill a 260px box. Also: no `onError` anywhere in `features/chat/` — an expired object renders
the browser's broken-image glyph with no fallback and no retry.

---

## 1. Fix before anyone else sees these chats

**1.1 — `replyToMessageId` is persisted with no authorization check.**
`messages.service.ts:183`. The DTO wants a UUID and nothing more (`messages.dto.ts:194`); the
only gate that runs is `assertCanPostToConversation` on the *target* room (`:119`). Nothing
checks the quoted message is in that conversation, or in any conversation you belong to.
`messageInclude` then hydrates it (`:44-46`) and `serialize` returns its body verbatim
(`:1405-1413`).

Post `{conversationId: <your own chat>, body:"x", replyToMessageId: <a message id from a chat
you are not in>}` and the 201, the `receive_message` broadcast and every later
`GET /chat/:id/messages` carry that message's plaintext and its real `senderId`. It is
persisted, so the leak is permanent and is also shown to the other participant.
*(Secondary: a non-existent id raises Prisma P2003; the catch at `:197-213` handles only P2002,
so it 500s instead of 400.)*

**1.2 — Every message ships the sender's entire dating `extras` blob to the recipient.**
`messages.service.ts:42` joins `datingProfile: { select: { extras: true } }` so the *anonymous*
branch can read `firstName` — but the `else` branch at `:1283-1287` returns `m.sender`
unchanged, blob included, on every non-anonymous conversation.
`dating/extras-shape.ts:29-50` says what is in it: `religion`, `dealBreakers`,
`personalityTraits`, `wantsChildren`, smoking/drinking/diet, `prefAgeMin/Max`,
`searchLat`/`searchLng`, `sensitiveConsentAt`, `selfieKey` (the private key of the
verification selfie) and `photos`.

A city colleague you exchange one message with receives your dating profile, your dating
photos and your verification-selfie key. **A passing spec currently pins this leak in place** —
`messages/a-dating-message-does-not-carry-the-city.spec.ts:74-79` asserts
`datingProfile: { extras: … }` is present in the handed-over sender. Narrow the select to what
`datingFirstName` needs, then fix the spec.

**1.3 — The base64 avatar rides on every single message.**
Same select (`profileImage: true`). `users.service.ts:118-120` allows a `data:` URL up to
400 KB. `conversations.service.ts:174-177` deliberately keeps photos out of the polled
conversation list for exactly this reason; the thread path does the opposite. A 30-message page
from one sender is ~1.8 MB of duplicated avatar at a typical 60 KB, up to 12 MB at the cap.

**1.4 — Attachment ownership degrades to a substring test when `MEDIA_PUBLIC_BASE_URL` is blank.**
`messages.service.ts:1174-1176`: if `base` is empty the origin check is skipped and all that
remains is `path.includes('/uploads/<senderId>/')`. `configuration.ts:242` defaults it to `''`,
`assertProductionConfig()` never checks it, and `render.yaml:121-122` ships it `sync: false`.
With it blank, `https://tracker.example/uploads/<senderId>/pixel.gif` passes — an arbitrary-host
tracking pixel in any conversation, rendered eagerly by the recipient. Make it fatal at boot.

---

## 2. Realtime correctness

**2.1 — The dating room leaves and re-joins the socket on every render.**
`chat.api.ts:360` deps include the handlers; `DatingChats.tsx:272-286` passes them as **inline
arrows**, so they are new identities every render. `Chats.tsx:281-302` wraps its equivalents in
`useCallback` — dating is the drifted copy. Cleanup emits `LEAVE_CONVERSATION`
(`chat.api.ts:356`), the effect re-emits `JOIN_CONVERSATION`. Consequences: a message broadcast
in the gap is missed entirely; `onLeave` (`chat.gateway.ts:253`) clears the redis
open-conversation flag that `notifications.service.ts:441-443` uses to suppress push, so the
user gets a **phone push for the chat they are staring at**; and every rejoin re-runs
`assertCanPostToConversation` + `markConversationRead` — a DB round trip per keystroke of the
person typing at you.

**2.2 — Nothing refetches after a reconnect.** `chat.api.ts:324` re-joins the room and
invalidates nothing. `queryClient.ts:7,10` sets `staleTime: 30_000`, `refetchOnWindowFocus:
false`; `useMessages` has no `refetchInterval`. Background the phone, the socket drops, messages
sent in that window arrive by neither `receive_message` nor `chat_notification`, and
`deliverBacklog` (`chat.gateway.ts:146`) replays receipts only. Those messages are gone until
the component remounts. **Invalidate the thread on `connect`.**

**2.3 — Only `send_message` is rate-limited.** `chat.gateway.ts:259` is the sole `overSendLimit`
call. `onJoin` (`:239-247`) does a `findUnique` + redis write + `markConversationRead`;
`onRead`/`onDelivered` (`:271-281`) each do a `findMany` + `updateMany` over up to 500 ids;
`onTypingStart` (`:284`) allocates a timer and broadcasts. One authenticated socket can loop any
of them without limit — the exact hole the file's own comment at `:47-53` describes for sends.

**2.4 — Dating threads never mark messages read while open.** The `markRead` effect is keyed
`[chat.conversationId, qc]` (`DatingChats.tsx:293`), so it fires once per open, and there is no
`WS.MESSAGE_READ` emit in the file — `Chats.tsx:519` acks each incoming message; dating does
not. And the REST `/read` (`conversations.service.ts:654-681`) only moves `lastReadAt`, never
`MessageStatus`. So you read ten messages as they land, the pip stays lit, and the sender's
ticks never pass DELIVERED.

---

## 3. Things that look broken to the person using them

**3.1 — "Load earlier messages" scrolls you straight back to the newest message.**
`useMessages` prepends the older page (`chat.api.ts:271-274`), so `messages.length` grows, and
`MessageThread.tsx:166-171` fires and yanks the box to `scrollHeight`. The button appears to do
nothing. Anchor the scroll: record `scrollHeight` before the fetch and restore the delta after.
*(The same effect also fires on delete-for-me, since length changes.)*

**3.2 — Dating threads can never load older messages at all.** `DatingChats.tsx:210` calls the
same infinite query, but `fetchNextPage`/`hasNextPage` appear nowhere in the file. A 200-message
thread shows the last 30 and nothing says so.

**3.3 — `jumpToId` re-fires on every new message.** `MessageThread.tsx:179-191` deps are
`[jumpToId, messages.length]` and `jumpToId` is never cleared after a successful jump. Tap a
search hit, the peer sends a message, and you are dragged back to the old message with its
outline flashing — and it wins, because it runs after the bottom-scroll effect. Clear
`jumpToId` in `Chats.tsx` once the jump lands.

**3.4 — A failed thread fetch renders as an empty conversation.** `Chats.tsx:809-836` has an
`isLoading` branch and no `isError` branch; `MessageThread` draws nothing for `[]`. A 500 or a
zod failure is indistinguishable from a brand-new chat, and people re-send.

**3.5 — Three more silent failures in `Chats.tsx`.** `deleteMessage` catches and does nothing
(`:358-365`) — "delete for everyone" past the 15-minute window closes the dialog and leaves the
message unexplained. `editMessage` catches and does nothing (`:367-373`) — the typed edit is
discarded. `leaveUnread` (`:431-435`) `.catch(() => undefined)` and then closes and refetches
anyway, so a failure looks exactly like a success. `pinMessage` (`:418-424`) has no catch at all
and both call sites `void` it — an unhandled rejection and a banner that just doesn't change.

**3.6 — The new-chat people picker is mouse-only.** `ChatStarter.tsx:96` (and `:79`) is a
`<div onClick>` with no `role`, no `tabIndex`. Mouse works; keyboard and screen-reader users
cannot select anyone, so "Start chat" stays disabled (`:110`) with no way to enable it. This is
the identical bug the 30 Aug audit fixed in `share.tsx:127-132`; the fix was never carried
across.

**3.7 — In-conversation search fires one HTTP request per keystroke.** `Chats.tsx:184, 190,
763` — no debounce; `useMessageSearch` keys on the raw `kw` and enables at length ≥ 2
(`chat.api.ts:414-424`). Typing "birthday" issues seven searches. `ForwardPanel.tsx:26-28`
argues against exactly this and does the right thing locally.

**3.8 — A `?c=` deep link is ignored while the page is mounted.** `Chats.tsx:84-85` reads the
param only into initial state. Tap a chat notification while already on `/chats` and the URL
changes but nothing on screen moves.

**3.9 — Selecting Mira fires REST calls for the sentinel id.** `Chats.tsx:233` guards
`useMessages` with `convId` but `usePinnedMessage(activeId)` and the markRead effect
(`:524-529`) both use `activeId`, so opening Mira does `GET /chat/__mira__/pinned` (404, a
failed query) and `POST /chat/__mira__/read` (404, swallowed) every time.

**3.10 — `download={a.name}` is inert** (`MessageBody.tsx:68`) — cross-origin R2 href, so the
attribute is ignored: a PDF navigates away instead of saving. And `alt={a.name ?? 'Shared
photo'}` (`:45`) reads "IMG_4821.jpg" to a screen reader; invert the fallback.

**3.11 — Leaving a group calls back into an unmounted panel.** `GroupPanel.tsx:134` — `onLeft`
closes the panel, then `run`'s body continues to `load()`, issuing `GET /chat/:id/members` for
a group you just left: a guaranteed 403 whose catch calls `setErr` on an unmounted component.

**3.12 — `typingTimer` is never cleared** (`Chats.tsx:437-441`): type a character, navigate
away inside 2.5s, and `typing_stop` is emitted for a room the socket has already left.

**3.13 — `phone` is measured once at mount** (`Chats.tsx:108, 571-575`) with no `matchMedia`
listener: a tablet that opens a thread at 820px and rotates to 1180px keeps the phone layout,
conversation list hidden, until the route remounts.

---

## 4. Dating-specific: `'romantic'` is hardcoded on a list that carries both kinds

`dating.service.ts:3580` selects match rows with **no `kind` filter**, and the row it pushes
(`:3688-3717`) carries no `kind`. `schema.prisma:1306` is `@@unique([userOneId, userTwoId,
kind])`, so one pair can hold a romantic *and* a platonic match, each with its own
`conversationId`. The page assumes romantic everywhere: `DatingChats.tsx:92`, `:209`
(`useUnmatch('romantic')`), `:219`, `:308` (`&kind=romantic`), `:435` (`<SafetyMenu
kind="romantic">`).

Unmatch a platonic thread and `dating.service.ts:3450-3453` finds no romantic row, returns
`{ok:true}`, the UI closes the thread — and it reappears on the next poll. A destructive action
that silently did nothing. If a romantic match with the same person *does* exist, it archives
the wrong conversation. `blockMatch` (`:2260-2265`) has the same shape.

Related: `DatingChats.tsx:589` keys the pending-match list on `c.otherUserId`, which
`sealCardId` derives from viewer+target only, not kind — the same person pending in both lenses
gives two rows with one key. And `:184` builds `/matchmaking/match?u=…` with no `kind`, which
`DatingMatchDetail.tsx:357` defaults to `'romantic'`.

**3.14 (dating, cosmetic)** — `DatingChats.tsx:597` passes `active={false}` unconditionally, so
the active-row highlight at `:148` is dead code; `:293` invalidates only `['dating','chats']`
and not `['chat','conversations']`, so the city header's unread badge keeps counting dating
messages you have already read for up to 60s.

**3.15 — You can type into an ended thread.** `DatingChats.tsx:512` renders `<Composer>`
unconditionally and `DatingChatSummary` (`dating/api.ts:315-337`) carries no `ended`/`archived`
flag. The other person unmatches (`dating.service.ts:3462`), both sockets are removed from the
room (`chat.gateway.ts:501`), and for up to the 15s poll the reader sees a live thread, types,
is refused, is told nothing (see 0.1), and then the thread unmounts mid-sentence.

---

## 5. Counts and cost

**5.1 — Three code paths compute unread and they disagree.** `listForUser` correctly uses
`laterOf(lastReadAt, clearedAt)` plus the `markedUnread` floor
(`conversations.service.ts:148,163`). `toDto` (`:266-273`) uses `lastReadAt` only — clear a
chat, then `POST /chat/start` on the same person, and the response counts everything you
deleted. `summariesFor` (`:398-406`) — the Dating Hub list, polled every 15s — uses `readAt`
only and never applies `markedUnread`, so clearing a dating chat re-inflates its badge and
"mark unread" does nothing there.

**5.2 — Unread ignores `joinedAt`.** `conversations.service.ts:149-156`: `since` is
`lastReadAt ?? clearedAt`, both null for a new member, so a freshly added group member's badge
is the group's entire history. `ConversationMember.joinedAt` exists
(`schema.prisma:351`) and is never read. The same query also ignores `hiddenForJson`, so
messages you deleted-for-me keep counting.

**5.3 — One `COUNT` per conversation on a 15-second poll.** `conversations.service.ts:143-158`,
plus a correlated `messages take:1` per row from the include at `:122`. `summariesFor`
(`:393-407`) already shows the single-`groupBy` form this should use.

**5.4 — `Attachment.url` has no index and two hot paths query on it.** `schema.prisma:565,569`
indexes only `messageId` and `(snapExpiresAt, snapGoneAt)`. But
`messages.service.ts:164` does `findFirst({ where: { url } })` on **every snap send**, and
`:1206-1212` does `findMany({ where: { url: { in: … } } })` joined through Message →
Conversation → ConversationMember on **every forward**. Both are sequential scans of a table
that grows with every attachment ever sent. Sending a snap gets slower forever.

**5.5 — The screenshot notice fires on every report.** `messages.service.ts:993-997` puts the
`snap.changed` publish *outside* the `if (!a.snapShotAt)` guard. The column is written once; the
sender's client can be rung 120 times a minute (`messages.controller.ts:203-204`) for one photo.

---

## 6. Dead weight

`src/services/` is entirely deprecated re-export shims — `services/api/chat.api.ts` is one
line, `export { chatApi } from '@/api';`, and `grep -rn "services/api|@/services" src` returns
**zero importers**. Delete the tree.

---

## Suggested order

1. **0.1** (listen for `error_event`, stop clearing the field before ack) — one change, and it
   makes every other chat bug reportable instead of invisible.
2. **1.1, 1.2, 1.4** — the three that leak.
3. **2.1** (`useCallback` in `DatingChats`) — one line, fixes dropped messages, phantom pushes
   and a DB hit per keystroke.
4. **0.2 + 0.3 + 0.4** — the attachment tray, the sized bubble, the thumbnail.
5. **3.1, 3.2, 3.4, 3.6** — the four that read as "this app is broken".
6. Everything else.

## What I did not check

Calls/WebRTC, Mira's thread (`mira/*`), push-notification delivery beyond the suppression flag,
and the moderation/report queue. Say the word and I'll take those next.
