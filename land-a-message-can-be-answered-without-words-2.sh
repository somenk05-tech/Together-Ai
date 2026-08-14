#!/bin/bash
# land-a-message-can-be-answered-without-words-2.sh
#   "A message can be answered without words, and one can be kept at the top."
#
# -2 because the first run applied every edit, passed prisma validate, prisma
# generate and backend tsc, and then stopped in jest on a suite this change does
# not touch. See "ONE SUITE IS EXCLUDED THAT NORMALLY IS NOT" below. The patch
# is unchanged; only the gate line moved, and the freezing rule says that is a
# new file rather than an edit to a name that has already been run.
#
# Reactions and Pin, in one migration — three columns on Message and one index.
#
# REACTIONS ARE SHARED; STARS ARE NOT. That is the whole difference between this
# column and starredForJson beside it. A star is the reader's own bookkeeping and
# nobody else can see it; a reaction is addressed to the room. So the serialized
# shape carries the user ids rather than a per-viewer boolean, and the client
# works out its own "mine" — which is also what makes one socket frame correct
# for everybody it reaches, instead of correct for nobody the way a viewer-
# dependent field would be.
#
# ONE PER PERSON. Setting a reaction strips you from wherever you were before
# adding you, so a userId appears under at most one emoji. The set is closed on
# the SERVER, not merely in the picker: an open emoji column is an open text
# column, and this one is broadcast to a room.
#
# ONE PIN PER CONVERSATION. Pinning another clears the first, so two columns
# answer "what is pinned here" without a second table — and a new Prisma model
# would owe purge-plan.spec a deletion policy, which is the same reason the star
# work chose a column. Pinning is a fact about the ROOM, not about the reader.
#
# Neither write is a $transaction. transaction-safety.spec's rule: a transaction
# is not a lock, so the WHERE carries what was read and a loser retries.
#
# ── ONE SUITE IS EXCLUDED THAT NORMALLY IS NOT ──────────────────────────────
#
# `shared/unbounded-reads` is excluded below, and it is NOT one of the three
# that are red on origin/main. It is green on main — the ceiling file says 0 and
# a clean clone of 9f0a6ed measures 0. It goes red only in THIS working tree,
# because of the parallel mail session's uncommitted work:
#
#     mail/mail.service.ts:1403 — emptyTrash()
#     const rows = await this.prisma.mailMessage.findMany({
#       where: { ownerId: userId, folder: 'trash' }, select: { sizeBytes: true },
#     });
#
# That findMany has neither `take:` nor an `// unbounded: <reason>` beside it.
# It is a COMPUTATION — it sums sizeBytes to report reclaimed space — so by the
# spec's own doctrine it wants the comment rather than a cap, since truncating
# would under-report. It is 418 uncommitted insertions deep in somebody else's
# file and this script does not touch it: rule 3 says mention, not absorb.
#
# The exclusion is therefore TEMPORARY and belongs to this tree, not to main.
# Take it back out of the next chat script. What the exclusion could have hidden
# is checked instead, three lines down: this change adds no findMany at all —
# pinnedIn uses findFirst, setReaction and setPinned use findUnique and
# updateMany — and the guard below fails the run if that ever stops being true.
#
# APPLY-shape, idempotent. One migration, so Railway rebuilds and runs it on boot.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

# A stale empty index.lock is left behind by any git run through the Cowork
# bridge, which cannot unlink. Park it rather than fail at the last step.
if [ -e .git/index.lock ] && [ ! -s .git/index.lock ]; then
  mkdir -p _to_delete && mv .git/index.lock "_to_delete/index.lock.$(date +%s)" || true
fi

LOG="$(git log --oneline -100)"
NEEDS="A handful of messages can be moved at once"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — that commit is not in the last 100."; exit 1 ;;
esac
MARK="A message can be answered without words"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/prisma/schema.prisma
together-city-chat/src/shared/events/chat-events.ts
together-city-chat/src/chat/chat.events.ts
together-city-chat/src/chat/chat.gateway.ts
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/messages/messages.controller.ts
together-city-chat/src/messages/dto/messages.dto.ts
together-city-react/src/api/events.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/api/index.ts
together-city-react/src/types/index.ts
together-city-react/src/features/chat/components/MessageThread.tsx
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/app/a-message-can-be-answered-without-words.test.ts
EOF

# A PARALLEL SESSION OWNS src/mail ON BOTH SIDES, and index.css this evening.
# Tolerated rather than stashed: `git stash` is one stack shared by every session
# in this repo, and the last time two runs shared it one popped entries it had
# not pushed.
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py|.*\.css|.*\.log)$' || true)"
if [ -n "$DIRTY" ]; then
  BAD="$(echo "$DIRTY" | awk '{print $NF}' \
    | grep -Ev '(together-city-chat/src/mail/|together-city-react/src/features/mail/|^together-city-react/src/index\.css$)' \
    | grep -Fxv -f "$OWNED_TMP" || true)"
  if [ -n "$BAD" ]; then
    echo "!! Working tree has changes outside this script's scope and outside the mail session's. Commit first:"
    echo "$BAD"; exit 1
  fi
  echo "== Continuing over the mail session's files and this script's own."
fi

echo "== Applying anchored edits"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text(encoding='utf-8')
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:240]}")
    if present not in replacement:
        sys.exit(f"!! {path}: idempotence marker is not in the text it inserts — this would apply twice.\n--- marker: {present}")
    p.write_text(s.replace(anchor, replacement), encoding='utf-8'); print(f"   + {path}")

SCHEMA = 'together-city-chat/prisma/schema.prisma'
BUS    = 'together-city-chat/src/shared/events/chat-events.ts'
WSC    = 'together-city-chat/src/chat/chat.events.ts'
GW     = 'together-city-chat/src/chat/chat.gateway.ts'
MS     = 'together-city-chat/src/messages/messages.service.ts'
CTRL   = 'together-city-chat/src/messages/messages.controller.ts'
DTO    = 'together-city-chat/src/messages/dto/messages.dto.ts'
EVENTS = 'together-city-react/src/api/events.ts'
SCH    = 'together-city-react/src/api/schemas.ts'
API    = 'together-city-react/src/api/chat.api.ts'
BARREL = 'together-city-react/src/api/index.ts'
TYPES  = 'together-city-react/src/types/index.ts'
THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the columns ─────────────────────────────────────────────────────────
apply(SCHEMA, "reactionsJson",
r'''  starredForJson   String?
  createdAt        DateTime    @default(now())''',
r'''  starredForJson   String?
  /// JSON { "<emoji>": userId[] } — who answered this message with what.
  /// SHARED, unlike starredForJson directly above it: a star is the reader's
  /// own bookkeeping and nobody else sees it, a reaction is addressed to the
  /// room. One per person, so a userId appears under at most one key and
  /// choosing a second replaces the first.
  reactionsJson    String?
  /// ONE PIN PER CONVERSATION: pinning another message clears these, so the
  /// pair answers "what is pinned here" without a second table. A pin is a
  /// fact about the room rather than about the reader, which is why it is not
  /// a per-viewer list. ConversationMember.pinned is a different feature — it
  /// pins a CONVERSATION in somebody's panel.
  pinnedAt         DateTime?
  pinnedById       String?
  createdAt        DateTime    @default(now())''')

apply(SCHEMA, "@@index([conversationId, pinnedAt])",
r'''  @@index([conversationId, createdAt]) // cursor pagination + ordering''',
r'''  @@index([conversationId, createdAt]) // cursor pagination + ordering
  @@index([conversationId, pinnedAt]) // "what is pinned in this room" — one row''')

# ── 2 · two more things the bus carries ─────────────────────────────────────
apply(BUS, "'message.reacted'",
r'''  | { kind: 'message.read'; conversationId: string; messageId: string; userId: string }
  | { kind: 'presence.changed'; userId: string; online: boolean }''',
r'''  | { kind: 'message.read'; conversationId: string; messageId: string; userId: string }
  /* The whole list every time, not a delta. A reaction frame that said "+1 on
     👍" would need the client to already hold a correct count to add to — and a
     client that missed one frame would then be wrong for as long as the thread
     stayed open. Sending the state makes a dropped frame self-healing. */
  | {
      kind: 'message.reacted';
      conversationId: string;
      messageId: string;
      reactions: Array<{ emoji: string; userIds: string[] }>;
    }
  /* messageId is null when the room's pin was cleared. `message` carries the
     newly pinned one so a banner can render without a fetch. */
  | { kind: 'message.pinned'; conversationId: string; messageId: string | null; message: unknown }
  | { kind: 'presence.changed'; userId: string; online: boolean }''')

apply(WSC, "MESSAGE_REACTED",
r'''  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',''',
r'''  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_REACTED: 'message_reacted',
  MESSAGE_PINNED: 'message_pinned',''')

apply(GW, "case 'message.reacted':",
r'''      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;''',
r'''      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;
      /* Both go to the conversation room and to nobody else. Neither is worth a
         per-user push the way a new message is: a reaction and a pin are things
         you notice when you are in the room, not things that should light up a
         phone in somebody's pocket. */
      case 'message.reacted':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_REACTED, {
            conversationId: event.conversationId,
            messageId: event.messageId,
            reactions: event.reactions,
          });
        break;
      case 'message.pinned':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_PINNED, {
            conversationId: event.conversationId,
            messageId: event.messageId,
            message: event.message,
          });
        break;''')

# ── 3 · the DTOs ────────────────────────────────────────────────────────────
apply(DTO, "ReactMessageSchema",
r'''export const StarMessageSchema = z.object({ on: z.boolean() });
export type StarMessageDto = z.infer<typeof StarMessageSchema>;''',
r'''export const StarMessageSchema = z.object({ on: z.boolean() });
export type StarMessageDto = z.infer<typeof StarMessageSchema>;

/**
 * The six, closed HERE rather than only in the picker.
 *
 * An open emoji field is an open text field wearing a smaller name, and this
 * one is persisted and then broadcast to everybody in the room. Six is also
 * what fits on one row of a phone without a scroller, which is why the picker
 * needs no picker. `null` clears whatever you had — one per person, so setting
 * a second replaces the first rather than adding to it.
 *
 * The web client keeps its own copy of this list (features/chat/MessageThread)
 * because the two packages share no code. Change one, change the other.
 */
export const ReactMessageSchema = z.object({
  emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '🙏']).nullable(),
});
export type ReactMessageDto = z.infer<typeof ReactMessageSchema>;

export const PinMessageSchema = z.object({ on: z.boolean() });
export type PinMessageDto = z.infer<typeof PinMessageSchema>;''')

# ── 4 · the service ─────────────────────────────────────────────────────────
apply(MS, "Promise<{ id: string; conversationId: string }>",
r'''  /** A message you may star is a message you may read: membership, re-asked. */
  private async assertCanSeeMessage(userId: string, messageId: string): Promise<void> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Message not found');
  }''',
r'''  /** A message you may star, react to or pin is a message you may read:
   *  membership, re-asked. It returns the row now, because the callers that
   *  publish to the bus need the conversation it is in and re-reading for that
   *  would be a second query for a fact this one already had. */
  private async assertCanSeeMessage(
    userId: string,
    messageId: string,
  ): Promise<{ id: string; conversationId: string }> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    if (!row) throw new NotFoundException('Message not found');
    return row;
  }''')

apply(MS, "async setReaction(",
r'''  async edit(userId: string, messageId: string, dto: EditMessageDto) {''',
r'''  /** Reactions as stored: emoji → the citizens who chose it. */
  private reactionsOf(m: unknown): Record<string, string[]> {
    try {
      const raw = JSON.parse((m as { reactionsJson?: string | null }).reactionsJson ?? '{}') as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return raw as Record<string, string[]>;
    } catch { return {}; }
  }

  /**
   * The wire shape: a stable-ordered list with empty buckets dropped.
   *
   * It carries the USER IDS, not a count and a per-viewer boolean, and that is
   * deliberate — one socket frame goes to a whole room, so any field whose
   * value depends on who is reading is a field the broadcast has to get wrong
   * for everybody but one person. The client knows its own id; let it decide.
   */
  private reactionList(m: unknown): Array<{ emoji: string; userIds: string[] }> {
    const map = this.reactionsOf(m);
    return Object.keys(map)
      .filter((e) => Array.isArray(map[e]) && map[e].length > 0)
      .sort()
      .map((emoji) => ({ emoji, userIds: map[emoji] }));
  }

  /**
   * Answer a message with one of the six, or clear your answer with null.
   *
   * ONE PER PERSON: you are stripped from wherever you were before being added,
   * so a userId is under at most one key. Conditional updateMany with a retry
   * rather than a $transaction — a transaction is not a lock, so the WHERE
   * carries the value that was read and a loser retries against the fresh row.
   * A busy group reacting to the same message in the same second is the
   * ordinary case for this feature, not an exotic one.
   */
  async setReaction(userId: string, messageId: string, emoji: string | null) {
    const msg = await this.assertCanSeeMessage(userId, messageId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({
        where: { id: messageId }, select: { reactionsJson: true },
      });
      const map = this.reactionsOf(fresh);
      const next: Record<string, string[]> = {};
      for (const key of Object.keys(map)) {
        const kept = (Array.isArray(map[key]) ? map[key] : []).filter((id) => id !== userId);
        if (kept.length) next[key] = kept;
      }
      if (emoji) next[emoji] = [...(next[emoji] ?? []), userId];
      const after = JSON.stringify(next);
      // Tapping the reaction you already have is a clear, and tapping a clear
      // twice is nothing at all. Neither deserves a write or a broadcast.
      if (JSON.stringify(map) === after) return { ok: true as const, reactions: this.reactionList(fresh) };
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, reactionsJson: fresh?.reactionsJson ?? null },
        data: { reactionsJson: after },
      });
      if (res.count) {
        const reactions = this.reactionList({ reactionsJson: after });
        this.bus.publish({
          kind: 'message.reacted', conversationId: msg.conversationId, messageId, reactions,
        });
        return { ok: true as const, reactions };
      }
    }
    // Three losses to concurrent writers. Report what is actually there rather
    // than what this call wanted — the citizen can look and tap again.
    const now = await this.prisma.message.findUnique({
      where: { id: messageId }, select: { reactionsJson: true },
    });
    return { ok: true as const, reactions: this.reactionList(now) };
  }

  /**
   * Pin a message, or unpin it. ONE PER CONVERSATION.
   *
   * A pin is a fact about the ROOM — everybody sees the same banner — which is
   * what separates it from a star, and why it is two plain columns rather than
   * a per-reader list. Clearing then setting is two writes and not a
   * $transaction, for the usual reason: the clear's WHERE names the
   * conversation rather than a row somebody read a moment ago, so two people
   * pinning at once resolve to whichever wrote second, with no orphan left
   * pinned behind it.
   */
  async setPinned(userId: string, messageId: string, on: boolean) {
    const msg = await this.assertCanSeeMessage(userId, messageId);
    if (!on) {
      await this.prisma.message.updateMany({
        where: { id: messageId, pinnedAt: { not: null } },
        data: { pinnedAt: null, pinnedById: null },
      });
      this.bus.publish({
        kind: 'message.pinned', conversationId: msg.conversationId, messageId: null, message: null,
      });
      return { ok: true as const, pinned: null };
    }
    await this.prisma.message.updateMany({
      where: { conversationId: msg.conversationId, pinnedAt: { not: null } },
      data: { pinnedAt: null, pinnedById: null },
    });
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedById: userId },
      include: messageInclude,
    });
    const dtoOut = this.serialize(row);
    this.bus.publish({
      kind: 'message.pinned', conversationId: msg.conversationId, messageId, message: dtoOut,
    });
    return { ok: true as const, pinned: dtoOut };
  }

  /**
   * What is pinned in this conversation, if anything.
   *
   * A dedicated read rather than a field on the message list, because the
   * pinned message is usually OLD — that is what pinning is for — and the
   * thread only loads its newest page. Tombstones are excluded here rather
   * than unpinned on delete: "this message was deleted" is not worth a banner,
   * and a row that comes back is not a case this schema has.
   */
  async pinnedIn(userId: string, conversationId: string) {
    const row = await this.prisma.message.findFirst({
      where: {
        conversationId,
        pinnedAt: { not: null },
        deleted: false,
        conversation: { members: { some: { userId } } },
      },
      orderBy: { pinnedAt: 'desc' },
      include: messageInclude,
    });
    return { pinned: row ? this.serialize(row, userId) : null };
  }

  async edit(userId: string, messageId: string, dto: EditMessageDto) {''')

apply(MS, "reactionsJson?: string | null;",
r'''    starredForJson?: string | null;
  }, viewerId?: string) {''',
r'''    starredForJson?: string | null;
    reactionsJson?: string | null;
    pinnedAt?: Date | null;
  }, viewerId?: string) {''')

apply(MS, "reactions: this.reactionList(m),",
r'''      starred: viewerId ? this.starredBy(m, viewerId) : false,
      edited: !!m.edited,''',
r'''      starred: viewerId ? this.starredBy(m, viewerId) : false,
      /* Unlike `starred` right above it, this needs no viewer: it carries the
         ids and lets the reader recognise themselves. That is the reason a
         reaction frame can be broadcast and a star frame cannot. */
      reactions: this.reactionList(m),
      pinnedAt: m.pinnedAt ?? null,
      edited: !!m.edited,''')

# ── 5 · the routes ──────────────────────────────────────────────────────────
apply(CTRL, "ReactMessageSchema,",
r'''  StarMessageDto,
  StarMessageSchema,
} from './dto/messages.dto';''',
r'''  PinMessageDto,
  PinMessageSchema,
  ReactMessageDto,
  ReactMessageSchema,
  StarMessageDto,
  StarMessageSchema,
} from './dto/messages.dto';''')

apply(CTRL, "messages/:id/react",
r'''  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:''',
r'''  // POST /api/messages/:id/react — one of the six, or null to clear yours.
  @Post('messages/:id/react')
  @UsePipes(new ZodValidationPipe(ReactMessageSchema))
  react(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ReactMessageDto) {
    return this.messages.setReaction(user.sub, id, dto.emoji);
  }

  // POST /api/messages/:id/pin — one pinned message per conversation.
  @Post('messages/:id/pin')
  @UsePipes(new ZodValidationPipe(PinMessageSchema))
  pin(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PinMessageDto) {
    return this.messages.setPinned(user.sub, id, dto.on);
  }

  // GET /api/chat/:id/pinned — what is pinned in this room, if anything.
  @Get('chat/:id/pinned')
  pinned(@CurrentUser() user: JwtUser, @Param('id') conversationId: string) {
    return this.messages.pinnedIn(user.sub, conversationId);
  }

  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:''')

# ── 6 · the client wire ─────────────────────────────────────────────────────
apply(EVENTS, "MESSAGE_REACTED:",
r'''  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',''',
r'''  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_REACTED: 'message_reacted',
  MESSAGE_PINNED: 'message_pinned',''')

apply(SCH, "reactions: z.array(",
r'''  starred: z.boolean().optional(),''',
r'''  starred: z.boolean().optional(),
  /* Shared, unlike `starred`: the ids arrive and the client recognises itself
     among them. zod strips what a schema does not declare, which is how quoted
     replies were lost between the wire and the component — so this is declared
     here in the same breath as the type. */
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })).optional(),
  pinnedAt: z.string().nullable().optional(),''')

apply(TYPES, "reactions?: Array<{ emoji: string; userIds: string[] }>;",
r'''  /** Whether YOU have kept this message — per reader, never shared. */
  starred?: boolean;''',
r'''  /** Whether YOU have kept this message — per reader, never shared. */
  starred?: boolean;
  /** Who answered this message with what. SHARED, unlike `starred`: the server
   *  sends ids rather than a count and a "mine", so one broadcast frame is
   *  correct for everybody who receives it. Keep in step with api/schemas.ts. */
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  /** Set when this message is the one pinned in its conversation. */
  pinnedAt?: string | null;''')

apply(API, "reactToMessage:",
r'''  /** Who received and read one of YOUR messages. 403 for anybody else's. */''',
r'''  /** Answer a message with one of the six, or clear yours with null. */
  reactToMessage: (messageId: string, emoji: string | null): Promise<{ ok: boolean; reactions: Array<{ emoji: string; userIds: string[] }> }> =>
    apiPost(`/messages/${messageId}/react`, { emoji }, z.object({
      ok: z.boolean(),
      reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
    })),

  /** Pin a message, or unpin it. One per conversation — pinning clears the last. */
  pinMessage: (messageId: string, on: boolean): Promise<{ ok: boolean; pinned: Message | null }> =>
    apiPost(`/messages/${messageId}/pin`, { on }, z.object({ ok: z.boolean(), pinned: MessageSchema.nullable() })),

  /** What is pinned in this conversation. Its own read, because a pinned
   *  message is usually older than the page the thread has loaded. */
  pinnedMessage: (conversationId: string): Promise<{ pinned: Message | null }> =>
    apiGet(`/chat/${conversationId}/pinned`, z.object({ pinned: MessageSchema.nullable() })),

  /** Who received and read one of YOUR messages. 403 for anybody else's. */''')

apply(API, "export function usePinnedMessage",
r'''export function useChatContacts() {''',
r'''/** The room's pinned message. Refetched by the socket frame, not by a poll —
 *  a pin changes rarely and an interval here would be a request per open thread
 *  per fifteen seconds for a fact that is usually null. */
export function usePinnedMessage(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'pinned', conversationId],
    queryFn: () => chatApi.pinnedMessage(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useChatContacts() {''')

# The barrel names every export by hand — `@/api` is the app's one gateway and
# an `export *` there would let anything in api/ become public by accident. A
# hook that is not on this line does not exist to the app, and tsc says so.
apply(BARREL, "usePinnedMessage",
r'''export { chatApi, useConversations, useUnreadChatCount, useMessages, useChatRealtime, useStartDirect, useChatContacts, useCreateGroup, useClearConversation, useMessageSearch, type Contact, type OutgoingAttachment } from './chat.api';''',
r'''export { chatApi, useConversations, useUnreadChatCount, useMessages, useChatRealtime, useStartDirect, useChatContacts, useCreateGroup, useClearConversation, useMessageSearch, usePinnedMessage, type Contact, type OutgoingAttachment } from './chat.api';''')

print("== Backend + wire applied.")
PYEOF

echo "== Applying the thread and the page"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text(encoding='utf-8')
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:240]}")
    if present not in replacement:
        sys.exit(f"!! {path}: idempotence marker is not in the text it inserts.\n--- marker: {present}")
    p.write_text(s.replace(anchor, replacement), encoding='utf-8'); print(f"   + {path}")

THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── the six, and the chips they leave behind ────────────────────────────────
apply(THREAD, "export const REACTIONS",
r'''/**
 * 15-minute edit / delete-for-everyone window (matches the server policy).''',
r'''/**
 * THE SIX.
 *
 * A closed set, and the same closed set the API enforces in
 * messages/dto/messages.dto.ts — the two packages share no code, so this is a
 * copy and the guard pins both ends of it. Six is what fits on one row of a
 * phone beside the other actions, which is the reason there is no picker to
 * open: the picker IS the row.
 */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/**
 * 15-minute edit / delete-for-everyone window (matches the server policy).''')

apply(THREAD, ".tc-react{",
r'''.tc-msg-collapsing{grid-template-rows:0fr;opacity:0}
`;''',
r'''.tc-msg-collapsing{grid-template-rows:0fr;opacity:0}
/* A chip is small on purpose — it sits under a bubble and must not compete
   with it — so it borrows the repo's own answer to that: a transparent 44px
   pseudo-element centred behind the label, so the TARGET meets the standard
   while the paint stays 22px. Same trick as .btn-sm::after in relief.css,
   which tap-targets.test.ts exists to stop anybody removing. */
.tc-react{position:relative;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--stage-line);background:var(--stage-tile);color:var(--on-stage-soft);border-radius:999px;padding:1px 8px;font-size:11.5px;font-family:inherit;line-height:1.7;cursor:pointer}
.tc-react.mine{border-color:var(--on-stage-faint);color:var(--on-stage)}
.tc-react::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:44px;min-height:44px;z-index:0}
.tc-react > span{position:relative;z-index:1}
.tc-msg-actions button.tc-emoji{font-size:15px;padding:2px 5px}
`;''')

apply(THREAD, "onReact?: (m: Message, emoji: string | null) => void;",
r'''  /** Toggle one message in the selection. The first call is what enters''',
r'''  /** Answer a message with one of THE SIX, or clear yours by passing null —
   *  which is also what tapping your own chip does. One per person, so the
   *  page never has to work out which of several to remove. */
  onReact?: (m: Message, emoji: string | null) => void;
  /** Pin this message for the whole room, or unpin it. One per conversation,
   *  so pinning anything is also unpinning whatever was there. */
  onPin?: (m: Message, on: boolean) => void;
  /** The id of the room's pinned message, so the action bar can offer "Unpin"
   *  on the one message where that is the honest word. */
  pinnedId?: string | null;
  /** Toggle one message in the selection. The first call is what enters''')

apply(THREAD, "jumpToId, selectedIds, onSelect, onReact, onPin, pinnedId }",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId, selectedIds, onSelect }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId, selectedIds, onSelect, onReact, onPin, pinnedId }: {''')

apply(THREAD, "const [reactFor, setReactFor]",
r'''  const [touchOpen, setTouchOpen] = useState<string | null>(null);''',
r'''  const [touchOpen, setTouchOpen] = useState<string | null>(null);
  /* Which message's action bar is currently showing the six instead of its
     buttons. One bar with two faces rather than a second floating row: the
     stage is a locked viewport and every new floating thing on it is another
     element that can land under a keyboard. */
  const [reactFor, setReactFor] = useState<string | null>(null);''')

apply(THREAD, "setReactFor(null); }, [messages.length])",
r'''  /* INFO IS FETCHED WHEN IT IS ASKED FOR, never alongside the thread:''',
r'''  /* A bar that is showing the six belongs to the message it opened on. When
     the thread changes underneath it — a message arrives, one is deleted — the
     row it was anchored to may not be where it was, so it closes rather than
     hovering over whatever moved into its place. */
  useEffect(() => { setReactFor(null); }, [messages.length]);

  /* INFO IS FETCHED WHEN IT IS ASKED FOR, never alongside the thread:''')

apply(THREAD, 'title="React"',
r'''                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}''',
r'''                  {/* THE BAR HAS TWO FACES. Asked for the six, it shows the
                      six and nothing else — there is no room on a phone for a
                      picker beside eight other controls, and a second floating
                      row on a locked viewport is a thing that lands under a
                      keyboard. Choosing one, or tapping away, puts it back. */}
                  {onReact && reactFor === m.id ? (
                    <>
                      {REACTIONS.map((e) => (
                        <button key={e} type="button" className="tc-emoji" title={`React ${e}`}
                          aria-label={`React with ${e}`}
                          onClick={() => { onReact(m, myReaction === e ? null : e); setReactFor(null); setTouchOpen(null); }}>
                          <span style={myReaction === e ? { filter: 'none' } : undefined}>{e}</span>
                        </button>
                      ))}
                      <button type="button" aria-label="Close reactions" onClick={() => setReactFor(null)}>✕</button>
                    </>
                  ) : (
                  <>
                  {onReact && <button type="button" title="React" onClick={() => setReactFor(m.id)}>☺ React</button>}
                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}''')

apply(THREAD, 'title={isPinned ? \'Unpin\' : \'Pin\'}',
r'''                  <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>
                </div>
              )}''',
r'''                  {onPin && (
                    <button type="button" title={isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => { onPin(m, !isPinned); setTouchOpen(null); }}>
                      {isPinned ? '📌 Unpin' : '📌 Pin'}
                    </button>
                  )}
                  <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>
                  </>
                  )}
                </div>
              )}''')

apply(THREAD, "const myReaction =",
r'''        const pickable = selecting && !deleted;''',
r'''        const pickable = selecting && !deleted;
        const isPinned = Boolean(pinnedId && pinnedId === m.id);
        /* At most one, by construction on the server — so this is a find, not a
           filter, and the picker can light the one you already chose. */
        const myReaction = currentUserId
          ? (m.reactions ?? []).find((r) => r.userIds.includes(currentUserId))?.emoji ?? null
          : null;''')

apply(THREAD, "aria-label={`${r.emoji} · ",
r'''                {/* Only the facts the attribution line does not already carry:
                    an edit, and how far a message of yours has got. */}''',
r'''                {/* WHAT THE ROOM ANSWERED. Under the bubble rather than over
                    its corner: a chip laid on the bubble covers the last line
                    of a short message, and every count in this app that hides
                    a word has been a bug report. Tapping your own chip clears
                    it, which is the only gesture people try. */}
                {!deleted && (m.reactions ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4,
                    justifyContent: mine ? 'flex-end' : 'flex-start', maxWidth: 260 }}>
                    {(m.reactions ?? []).map((r) => {
                      const isMine = Boolean(currentUserId && r.userIds.includes(currentUserId));
                      return (
                        <button key={r.emoji} type="button"
                          className={isMine ? 'tc-react mine' : 'tc-react'}
                          aria-pressed={isMine}
                          aria-label={`${r.emoji} · ${r.userIds.length}${isMine ? ', including you — tap to remove yours' : ''}`}
                          onClick={() => onReact?.(m, isMine ? null : r.emoji)}
                          disabled={!onReact}>
                          <span aria-hidden>{r.emoji}</span>
                          <span aria-hidden>{r.userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Only the facts the attribution line does not already carry:
                    an edit, and how far a message of yours has got. */}''')

# ── the page: the banner, the handlers, the two frames ──────────────────────
apply(CHATS, "usePinnedMessage",
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, useOnlineContacts, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';''',
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, useOnlineContacts, usePinnedMessage, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';''')

apply(CHATS, "const [reactionsMap, setReactionsMap]",
r'''  const [bulkDelete, setBulkDelete] = useState(false);''',
r'''  const [bulkDelete, setBulkDelete] = useState(false);
  /* Its own map rather than a partial written into editsMap, which is typed as
     whole Messages: a reaction frame carries only the list, and widening that
     map to accept fragments would let a half-message through it later. */
  const [reactionsMap, setReactionsMap] = useState<Record<string, Message['reactions']>>({});
  const pinned = usePinnedMessage(activeId);''')

apply(CHATS, "setReactionsMap({}); }, [activeId]);",
r'''setSelected(new Set()); setBulkDelete(false); }, [activeId]);''',
r'''setSelected(new Set()); setBulkDelete(false); setReactionsMap({}); }, [activeId]);''')

apply(CHATS, "WS.MESSAGE_REACTED",
r'''  // Live delivery/read receipts → advance the ticks on your sent messages.''',
r'''  /* THE WHOLE LIST ARRIVES, so this assigns rather than merges. A frame that
     said "+1 on 👍" would need a correct count to add to, and one dropped frame
     would leave the room wrong for as long as the thread stayed open. */
  useEffect(() => {
    const off = socketClient.on<{ messageId: string; reactions: Message['reactions'] }>(
      WS.MESSAGE_REACTED,
      ({ messageId, reactions }) => setReactionsMap((s) => ({ ...s, [messageId]: reactions })),
    );
    return off;
  }, []);
  /* A pin is one row for the whole room, so the frame is a nudge and the
     refetch is the truth — it also has to reach the banner when the pinned
     message is older than anything loaded, which no frame can carry. */
  useEffect(() => {
    if (!activeId) return;
    const off = socketClient.on<{ conversationId: string }>(WS.MESSAGE_PINNED, ({ conversationId }) => {
      if (conversationId === activeId) void qc.invalidateQueries({ queryKey: ['chat', 'pinned', activeId] });
    });
    return off;
  }, [activeId, qc]);

  // Live delivery/read receipts → advance the ticks on your sent messages.''')

apply(CHATS, "const reactToMessage",
r'''  /* Flag it and LEAVE. Staying in an open thread you have just marked unread''',
r'''  /* Optimistic for the same reason a star is: the server cannot refuse a
     reaction on a message you can already see, and one that waits for a round
     trip feels broken on a phone. ONE PER PERSON is applied here too, so the
     chip you had disappears in the same frame the new one appears — the server
     is agreeing with the screen rather than correcting it. */
  const reactToMessage = useCallback(async (m: Message, emoji: string | null) => {
    const before = reactionsMap[m.id] ?? m.reactions ?? [];
    const me = user?.id;
    if (!me) return;
    const stripped = before
      .map((r) => ({ emoji: r.emoji, userIds: r.userIds.filter((id) => id !== me) }))
      .filter((r) => r.userIds.length > 0);
    const optimistic = emoji
      ? (stripped.some((r) => r.emoji === emoji)
          ? stripped.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, me] } : r))
          : [...stripped, { emoji, userIds: [me] }].sort((a, b) => a.emoji.localeCompare(b.emoji)))
      : stripped;
    setReactionsMap((s) => ({ ...s, [m.id]: optimistic }));
    try {
      const res = await chatApi.reactToMessage(m.id, emoji);
      setReactionsMap((s) => ({ ...s, [m.id]: res.reactions }));
    } catch {
      setReactionsMap((s) => ({ ...s, [m.id]: before }));
    }
  }, [reactionsMap, user?.id]);

  /* A pin is NOT optimistic. It changes what the whole room sees and it
     silently unpins somebody else's choice, so the banner should say what the
     server did rather than what this tab hoped — and the refetch is one row. */
  const pinMessage = useCallback(async (m: Message, on: boolean) => {
    try {
      await chatApi.pinMessage(m.id, on);
    } finally {
      void pinned.refetch();
    }
  }, [pinned]);

  /* Flag it and LEAVE. Staying in an open thread you have just marked unread''')

apply(CHATS, "reactionsMap[m.id] ? { ...m, reactions:",
r'''      .map((m) => (statusMap[m.id] ? { ...m, status: statusMap[m.id] } : m));''',
r'''      .map((m) => (statusMap[m.id] ? { ...m, status: statusMap[m.id] } : m))
      .map((m) => (reactionsMap[m.id] ? { ...m, reactions: reactionsMap[m.id] } : m));''')

apply(CHATS, "reactionsMap]);",
r'''  }, [history.data, live, statusMap, hiddenIds, tombstoned, editsMap]);''',
r'''  }, [history.data, live, statusMap, hiddenIds, tombstoned, editsMap, reactionsMap]);''')

apply(CHATS, "pinnedMsg",
r'''              {searchOpen && (''',
r'''              {/* THE PINNED ROW, under the header and above everything else.
                  It is a line rather than a card because it is present for the
                  whole visit and a card would be a permanent tax on the height
                  of the thread. Tapping it goes to the message, which is the
                  only thing anybody wants from a pin. A tombstoned pin is
                  dropped here as well as on the server — the delete frame
                  arrives before the refetch does. */}
              {pinnedMsg && !tombstoned.has(pinnedMsg.id) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px',
                  borderBottom: '1px solid var(--stage-line)' }}>
                  <span aria-hidden style={{ flex: 'none', fontSize: 12 }}>📌</span>
                  <button type="button" onClick={() => { void jumpTo(pinnedMsg.id); }}
                    aria-label="Go to the pinned message"
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none',
                      font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--on-stage-faint)' }}>Pinned</span>
                    <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pinnedMsg.body || '📎 Attachment'}
                    </span>
                  </button>
                  <button type="button" className="cstool" style={{ flex: 'none' }}
                    aria-label="Unpin this message" title="Unpin"
                    onClick={() => { void pinMessage(pinnedMsg, false); }}>✕</button>
                </div>
              )}
              {searchOpen && (''')

apply(CHATS, "const pinnedMsg =",
r'''  const activeTitle = list.find((c) => c.id === activeId)?.title || 'Conversation';''',
r'''  const activeTitle = list.find((c) => c.id === activeId)?.title || 'Conversation';
  const pinnedMsg = pinned.data?.pinned ?? null;''')

apply(CHATS, "onReact={(m, e) =>",
r'''                      selectedIds={selected} onSelect={toggleSelect}
                      fetchInfo={chatApi.messageInfo} />''',
r'''                      selectedIds={selected} onSelect={toggleSelect}
                      onReact={(m, e) => { void reactToMessage(m, e); }}
                      onPin={(m, on) => { void pinMessage(m, on); }}
                      pinnedId={pinnedMsg?.id ?? null}
                      fetchInfo={chatApi.messageInfo} />''')

print("== Thread and page applied.")
PYEOF

echo "== Writing the migration"
python3 <<'PYEOF'
import pathlib
d = pathlib.Path('together-city-chat/prisma/migrations/20260814150000_react_and_pin')
sql = '''-- A reaction is addressed to the ROOM, which is what separates this column
-- from starredForJson beside it: a star is the reader's own bookkeeping that
-- nobody else can see. Stored as JSON { "<emoji>": userId[] }, one key per
-- emoji, and a userId under at most one key — one reaction per person.
ALTER TABLE "Message" ADD COLUMN "reactionsJson" TEXT;

-- One pinned message per conversation. Nullable rather than defaulted, so
-- nothing has to be rewritten for the rows that predate this: absent and
-- unpinned are the same fact.
ALTER TABLE "Message" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "pinnedById" TEXT;

-- "What is pinned in this room" is a one-row question asked on every thread
-- open. Without this it is a scan of the conversation's whole history.
CREATE INDEX "Message_conversationId_pinnedAt_idx" ON "Message"("conversationId", "pinnedAt");
'''
f = d / 'migration.sql'
if f.exists() and f.read_text(encoding='utf-8') == sql:
    print('   = migration: already written')
else:
    d.mkdir(parents=True, exist_ok=True); f.write_text(sql, encoding='utf-8')
    print(f'   + {f}')
PYEOF

echo "== Writing the guard"
python3 <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/app/a-message-can-be-answered-without-words.test.ts')
src = '''import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/(^|[^:])\\/\\/.*$/gm, '$1 ');

const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));
const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const types = strip(read('types', 'index.ts'));
const schemas = strip(read('api', 'schemas.ts'));
const api = strip(read('api', 'chat.api.ts'));

/**
 * A MESSAGE CAN BE ANSWERED WITHOUT WORDS.
 *
 * The load-bearing distinction in this feature is that a reaction is SHARED and
 * a star is not, and almost every way of getting it wrong still renders
 * correctly for the person who did the reacting. So the wire shape is pinned
 * here: ids, not a count and a "mine". A per-viewer boolean in a frame that
 * goes to a whole room is wrong for everybody but one of them, and it is wrong
 * silently — the sender sees exactly what they expect.
 */
describe('the wire shape of a reaction', () => {
  it('carries the ids, so one broadcast frame is right for the whole room', () => {
    expect(schemas).toMatch(/reactions: z\\.array\\(z\\.object\\(\\{ emoji: z\\.string\\(\\), userIds: z\\.array\\(z\\.string\\(\\)\\) \\}\\)\\)/);
    expect(types).toMatch(/reactions\\?: Array<\\{ emoji: string; userIds: string\\[\\] \\}>/);
    // A `mine` or a bare `count` on the wire would be the defect this exists
    // to prevent.
    expect(schemas).not.toMatch(/reactions:[^;]*z\\.object\\(\\{[^}]*mine/);
  });

  it('is declared in the schema as well as the type, or zod strips it', () => {
    // Quoted replies were lost exactly this way: sent by the server, declared
    // in the type, absent from the schema, gone before the component saw them.
    expect(schemas).toMatch(/reactions:/);
    expect(schemas).toMatch(/pinnedAt:/);
  });

  it('replaces the whole list on a socket frame rather than adding to a count', () => {
    expect(page).toMatch(/WS\\.MESSAGE_REACTED/);
    expect(page).toMatch(/setReactionsMap\\(\\(s\\) => \\(\\{ \\.\\.\\.s, \\[messageId\\]: reactions \\}\\)\\)/);
  });
});

describe('the six', () => {
  it('is a closed set of exactly six in the client', () => {
    const m = thread.match(/export const REACTIONS = \\[([^\\]]*)\\]/);
    expect(m).toBeTruthy();
    expect((m![1].match(/'/g) ?? []).length / 2).toBe(6);
  });

  it('is one per person, so the picker can light the one you chose', () => {
    expect(thread).toMatch(/const myReaction =/);
    // find, not filter: at most one by construction on the server.
    expect(thread).toMatch(/\\.find\\(\\(r\\) => r\\.userIds\\.includes\\(currentUserId\\)\\)/);
  });

  it('clears your reaction by tapping your own chip', () => {
    expect(thread).toMatch(/onReact\\?\\.\\(m, isMine \\? null : r\\.emoji\\)/);
  });

  it('opens in the action bar rather than a second floating row', () => {
    // The stage is a locked viewport; every extra floating element on it is
    // another thing that can land under a keyboard.
    expect(thread).toMatch(/reactFor === m\\.id \\?/);
    expect(thread).not.toMatch(/position: 'fixed'[^}]*REACTIONS/);
  });
});

describe('the pin', () => {
  it('is read on its own, because a pinned message is usually older than the page', () => {
    expect(api).toMatch(/pinnedMessage:/);
    expect(api).toMatch(/export function usePinnedMessage/);
    expect(api).toMatch(/queryKey: \\['chat', 'pinned', conversationId\\]/);
  });

  it('is not optimistic — it changes what the whole room sees', () => {
    expect(page).toMatch(/const pinMessage = useCallback/);
    expect(page).toMatch(/void pinned\\.refetch\\(\\)/);
  });

  it('drops a tombstoned pin from the banner without waiting for a refetch', () => {
    expect(page).toMatch(/pinnedMsg && !tombstoned\\.has\\(pinnedMsg\\.id\\)/);
  });

  it('taps through to the message it pinned', () => {
    expect(page).toMatch(/aria-label="Go to the pinned message"/);
    expect(page).toMatch(/void jumpTo\\(pinnedMsg\\.id\\)/);
  });
});

describe('a reaction, unlike a pin, is optimistic', () => {
  it('rolls back to what was there if the write fails', () => {
    expect(page).toMatch(/const reactToMessage = useCallback/);
    expect(page).toMatch(/setReactionsMap\\(\\(s\\) => \\(\\{ \\.\\.\\.s, \\[m\\.id\\]: before \\}\\)\\)/);
  });

  it('strips you from wherever you were before adding you', () => {
    expect(page).toMatch(/userIds\\.filter\\(\\(id\\) => id !== me\\)/);
  });
});
'''
if p.exists() and p.read_text(encoding='utf-8') == src:
    print('   = guard: already written')
else:
    p.write_text(src, encoding='utf-8')
    print(f'   + {p}')
PYEOF

echo "== Standing in for the excluded suite: did THIS change add a findMany?"
ADDED_FINDMANY="$(git diff -- \
  together-city-chat/src/messages \
  together-city-chat/src/chat \
  together-city-chat/src/shared/events \
  | grep -E '^\+.*\.findMany\(' || true)"
if [ -n "$ADDED_FINDMANY" ]; then
  echo "!! This change adds a findMany, and shared/unbounded-reads is excluded this"
  echo "   run — so nothing would have checked it. Add take: or an // unbounded:"
  echo "   reason, then delete this guard's exclusion. Lines added:"
  echo "$ADDED_FINDMANY"; exit 1
fi
echo "   None. pinnedIn is findFirst; setReaction and setPinned are findUnique + updateMany."

echo "== Gates: backend (prisma validate + generate, tsc, jest)"
echo "   dev/dev, security/route-reach and privacy/purge-plan stay excluded — red on"
echo "   origin/main before this script, still someone else's to fix."
echo "   shared/unbounded-reads is excluded TEMPORARILY and is NOT one of those: it is"
echo "   green on main, and red here only because of the mail session's uncommitted"
echo "   mail/mail.service.ts:1403. Take this one back out of the next chat script."
( cd together-city-chat \
  && npx prisma validate \
  && npx prisma generate >/dev/null \
  && npx tsc --noEmit \
  && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan|shared/unbounded-reads)\.spec\.ts$' )

echo "== Gates: frontend (tsc, vitest, lint-ceiling, nav-audit, a11y-audit, motion-ceiling, build)"
echo "   The four ratchets are from How-Deployment-Works.md. The previous chat"
echo "   script ran only tsc/vitest/build and had to verify them after the fact."
( cd together-city-react \
  && npx tsc --noEmit \
  && npx vitest run --silent \
  && node scripts/lint-ceiling.mjs \
  && node scripts/nav-audit.mjs \
  && node scripts/a11y-audit.mjs \
  && node scripts/motion-ceiling.mjs \
  && npm run -s build )

echo "== Report-only ratchets (main already fails dead-export; not a blocker)"
( cd together-city-react && node scripts/dead-export-audit.mjs || true )

echo "== Committing"
[ -e .git/index.lock ] && [ ! -s .git/index.lock ] && mv .git/index.lock "_to_delete/index.lock.$(date +%s)" || true
git add \
  together-city-chat/prisma/schema.prisma \
  together-city-chat/prisma/migrations/20260814150000_react_and_pin/migration.sql \
  together-city-chat/src/shared/events/chat-events.ts \
  together-city-chat/src/chat/chat.events.ts \
  together-city-chat/src/chat/chat.gateway.ts \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/messages/messages.controller.ts \
  together-city-chat/src/messages/dto/messages.dto.ts \
  together-city-react/src/api/events.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/api/index.ts \
  together-city-react/src/types/index.ts \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/app/a-message-can-be-answered-without-words.test.ts \
  land-a-message-can-be-answered-without-words.sh \
  land-a-message-can-be-answered-without-words-2.sh

git commit -F - <<'MSGEOF'
A message can be answered without words

Reactions and Pin, in one migration: three columns on Message and one
index. Railway rebuilds and applies it on boot.

A REACTION IS SHARED; A STAR IS NOT. That is the whole difference between
reactionsJson and starredForJson sitting beside it, and it decides the wire
shape. The serializer sends the USER IDS, not a count and a per-viewer
"mine", because one socket frame goes to a whole room — any field whose
value depends on who is reading is a field the broadcast gets wrong for
everybody but one person, and gets wrong silently, since the person who
reacted sees exactly what they expected. The client knows its own id and
works out the rest.

The frame carries the whole list rather than a delta. "+1 on thumbs-up"
needs a correct count to add to, so one dropped frame would leave the room
wrong for as long as the thread stayed open. Sending state makes a missed
frame self-healing.

ONE PER PERSON, enforced by construction: setting a reaction strips you from
wherever you were before adding you, so a userId is under at most one key
and the picker can light the one you already chose. The set of six is closed
on the SERVER, not only in the picker — an open emoji field is an open text
field wearing a smaller name, and this one is persisted and broadcast. The
web client keeps its own copy of the list because the packages share no
code; the guard pins both ends.

ONE PIN PER CONVERSATION, as two plain columns. A pin is a fact about the
room, not about the reader, so it is not a per-viewer list — and a new
Prisma model would owe purge-plan.spec a deletion policy, which is the same
reason the star work chose a column over a join table. It is read by its own
endpoint rather than riding on the message list, because a pinned message is
usually OLD and the thread only loads its newest page.

Neither write is a $transaction. transaction-safety.spec's rule: a
transaction is not a lock. The reaction write is a conditional updateMany
with a retry whose WHERE carries what was read; the pin's clear step names
the conversation rather than a row somebody read a moment ago, so two people
pinning at once resolve to whoever wrote second with no orphan left behind.

A reaction is optimistic and a pin is not. The server cannot refuse a
reaction on a message you can already see, and one that waits for a round
trip feels broken on a phone. A pin changes what everybody sees and silently
unpins somebody else's choice, so the banner says what the server did.

The six open inside the existing action bar rather than in a second floating
row: the stage is a locked visual viewport and every floating element on it
is another thing that can land under a keyboard. Chips sit UNDER the bubble,
not over its corner, because a chip laid on a short message covers its last
line. They carry the repo's own 44px pseudo-element target, the same trick
tap-targets.test.ts exists to protect in relief.css.

Gates: prisma validate, prisma generate, backend tsc and jest; frontend tsc,
vitest, lint-ceiling, nav-audit, a11y-audit, motion-ceiling and build. The
four ratchets are from How-Deployment-Works.md — the previous chat script
ran only tsc/vitest/build and had to be checked after the fact.

shared/unbounded-reads is excluded from the backend run, TEMPORARILY, and it
is not one of the three that are red on main. It is green on main — the
ceiling file says 0 and a clean clone of 9f0a6ed measures 0 — and red only
in this working tree, because of the parallel mail session's uncommitted
mail/mail.service.ts:1403, an emptyTrash() findMany with neither take: nor
an // unbounded: reason. That is 418 uncommitted insertions inside somebody
else's file, so this reports it rather than absorbing it. In its place the
script checks that this change adds no findMany at all, which it does not:
pinnedIn is a findFirst, and setReaction and setPinned are findUnique and
updateMany. Take the exclusion back out of the next chat script.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TvSk8yA3rcp4MtLPLrnCY9
MSGEOF

echo "== Landed: \"$MARK\". Push when ready."
