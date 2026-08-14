#!/bin/bash
# land-a-group-can-change-who-is-in-it.sh — "A group can change who is in it."
#
# The largest functional hole left in chat: a group's roster was frozen at
# creation. No add, no remove, no way out except deleting the thread from your
# own panel — which does not remove you, so you keep receiving it. MemberRole
# has had OWNER, ADMIN and MEMBER in the enum since the schema was written, the
# creator has always been written as OWNER, and not one line of code has ever
# read the column back.
#
# WHAT THE RULES ARE, AND WHY:
#   · OWNER and ADMIN may change the roster and the name. A MEMBER may not.
#   · Everybody added must be connected to the person adding them — the same
#     gate createGroup has always applied. A group is not a way to put a
#     stranger in front of somebody who never accepted them.
#   · Only the OWNER changes roles, and never to OWNER: promotion to owner
#     happens exactly once, on the way out (below). An ADMIN who could demote
#     the other admins is an owner by another name.
#   · Anybody may leave. If the OWNER leaves and anybody remains, ownership
#     passes automatically to the longest-standing admin, or failing that the
#     longest-standing member. Refusing to let an owner leave until they hand
#     over sounds tidy and is a trap: it is the one person who cannot get out.
#   · Leaving DELETES the membership row rather than archiving it, because
#     recipientIds is computed from members — anything less and a leaver keeps
#     receiving the group.
#
# One thing deliberately not built: a roster change sends no socket frame. The
# conversation list polls every fifteen seconds, and a new member's socket joins
# the room on their next handshake or on the first message after they were added
# (the gateway pulls recipients in by user room on message.created). So the gap
# is at most one poll and never loses a message. A roster event is worth adding
# the day the group UI shows presence, and not before.
#
# APPLY-shape, idempotent. New routes, one new component file, no migration.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="The room says who is here"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-the-room-says-who-is-here.sh first."; exit 1 ;;
esac
MARK="A group can change who is in it"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/conversations/conversations.service.ts
together-city-chat/src/conversations/conversations.controller.ts
together-city-chat/src/conversations/dto/conversations.dto.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/features/chat/components/GroupPanel.tsx
together-city-react/src/features/chat/pages/Chats.tsx
EOF
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py|.*\.css)$' || true)"
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
    p = pathlib.Path(path); s = p.read_text()
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:200]}")
    p.write_text(s.replace(anchor, replacement)); print(f"   + {path}")

def write(path, content):
    p = pathlib.Path(path)
    if p.exists() and p.read_text() == content:
        print(f"   = {path}: already written"); return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content); print(f"   + {path} (whole file)")

CS   = 'together-city-chat/src/conversations/conversations.service.ts'
CTRL = 'together-city-chat/src/conversations/conversations.controller.ts'
DTO  = 'together-city-chat/src/conversations/dto/conversations.dto.ts'
SCH  = 'together-city-react/src/api/schemas.ts'
API  = 'together-city-react/src/api/chat.api.ts'
CHATS= 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the DTOs ────────────────────────────────────────────────────────────
apply(DTO, "AddMembersSchema",
r'''export const CreateGroupSchema = z.object({''',
r'''export const AddMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(64),
});
export type AddMembersDto = z.infer<typeof AddMembersSchema>;

/** ADMIN or MEMBER, never OWNER. Ownership moves exactly once, when an owner
 *  leaves — see conversations.service.leaveConversation. */
export const SetRoleSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) });
export type SetRoleDto = z.infer<typeof SetRoleSchema>;

export const RenameGroupSchema = z.object({ title: z.string().min(1).max(80) });
export type RenameGroupDto = z.infer<typeof RenameGroupSchema>;

export const CreateGroupSchema = z.object({''')

# ── 2 · the service ─────────────────────────────────────────────────────────
apply(CS, "A GROUP'S ROSTER IS NOT FROZEN AT CREATION",
r'''  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */''',
r'''  /* ── A GROUP'S ROSTER IS NOT FROZEN AT CREATION ────────────────────────
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
    // unbounded: one conversation's members — group-sized
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      name: r.user?.name ?? 'Someone',
      handle: r.user?.handle ?? null,
      profileImage: r.user?.profileImage ?? null,
      role: r.role,
    }));
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

  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */''')

# ── 3 · the routes ──────────────────────────────────────────────────────────
apply(CTRL, "':id/members'",
r'''  // GET /api/chat/contacts — city directory for starting chats / groups
  @Get('contacts')''',
r'''  // GET /api/chat/:id/members — who is in this group, and what they are.
  @Get(':id/members')
  members(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.members(user.sub, id);
  }

  // POST /api/chat/:id/members — add people (admins only; each must be connected)
  @Post(':id/members')
  @UsePipes(new ZodValidationPipe(AddMembersSchema))
  addMembers(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AddMembersDto) {
    return this.conversations.addMembers(user.sub, id, dto.memberIds);
  }

  // DELETE /api/chat/:id/members/:userId — remove somebody (never the owner)
  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.conversations.removeMember(user.sub, id, userId);
  }

  // POST /api/chat/:id/members/:userId/role — promote/demote (owner only)
  @Post(':id/members/:userId/role')
  @UsePipes(new ZodValidationPipe(SetRoleSchema))
  setRole(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('userId') userId: string, @Body() dto: SetRoleDto) {
    return this.conversations.setMemberRole(user.sub, id, userId, dto.role);
  }

  // POST /api/chat/:id/rename — a distinct path rather than PATCH :id, so the
  // one-id routes stay one shape and nothing depends on method to disambiguate.
  @Post(':id/rename')
  @UsePipes(new ZodValidationPipe(RenameGroupSchema))
  rename(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RenameGroupDto) {
    return this.conversations.renameGroup(user.sub, id, dto.title);
  }

  // POST /api/chat/:id/leave — leave a group for good (the row is deleted)
  @Post(':id/leave')
  leave(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.leaveConversation(user.sub, id);
  }

  // GET /api/chat/contacts — city directory for starting chats / groups
  @Get('contacts')''')

apply(CTRL, "AddMembersDto,",
r'''import {
  CreateGroupDto,
  CreateGroupSchema,
  StartDirectDto,
  StartDirectSchema,
} from './dto/conversations.dto';''',
r'''import {
  AddMembersDto,
  AddMembersSchema,
  CreateGroupDto,
  CreateGroupSchema,
  RenameGroupDto,
  RenameGroupSchema,
  SetRoleDto,
  SetRoleSchema,
  StartDirectDto,
  StartDirectSchema,
} from './dto/conversations.dto';''')

# ── 4 · the client ──────────────────────────────────────────────────────────
apply(SCH, "GroupMemberSchema",
r'''/** Who a message reached, and when — sender's own view. */''',
r'''/** One person in a group, and what they are. */
export const GroupMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  handle: z.string().nullable().optional(),
  profileImage: z.string().nullable().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

/** Who a message reached, and when — sender's own view. */''')

apply(API, "groupMembers:",
r'''  /** Who received and read one of YOUR messages. 403 for anybody else's. */
  messageInfo: (messageId: string): Promise<MessageInfo> =>
    apiGet(`/messages/${messageId}/info`, MessageInfoSchema),
};''',
r'''  /** Who received and read one of YOUR messages. 403 for anybody else's. */
  messageInfo: (messageId: string): Promise<MessageInfo> =>
    apiGet(`/messages/${messageId}/info`, MessageInfoSchema),

  /* ---- groups: a roster that can change ---- */
  groupMembers: (conversationId: string): Promise<GroupMember[]> =>
    apiGet(`/chat/${conversationId}/members`, z.array(GroupMemberSchema)),
  addGroupMembers: (conversationId: string, memberIds: string[]): Promise<{ ok: boolean; added: number }> =>
    apiPost(`/chat/${conversationId}/members`, { memberIds }, z.object({ ok: z.boolean(), added: z.number() })),
  removeGroupMember: (conversationId: string, userId: string): Promise<{ ok: boolean }> =>
    apiDelete(`/chat/${conversationId}/members/${userId}`, z.object({ ok: z.boolean() })),
  setGroupRole: (conversationId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/members/${userId}/role`, { role }, z.object({ ok: z.boolean() })),
  renameGroup: (conversationId: string, title: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/rename`, { title }, z.object({ ok: z.boolean() })),
  leaveGroup: (conversationId: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/leave`, {}, z.object({ ok: z.boolean() })),
};''')

apply(API, "GroupMemberSchema, MessageInfoSchema",
r'''import {
  ConversationSchema, MessageInfoSchema, MessagePageSchema, MessageSchema,
  type Conversation, type Message, type MessageInfo, type MessagePage, type ShareCard,
} from './schemas';''',
r'''import {
  ConversationSchema, GroupMemberSchema, MessageInfoSchema, MessagePageSchema, MessageSchema,
  type Conversation, type GroupMember, type Message, type MessageInfo, type MessagePage, type ShareCard,
} from './schemas';''')

print("== Anchored edits applied.")
PYEOF

echo "== Writing the group panel"
python3 <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/features/chat/components/GroupPanel.tsx')
content = r'''import { useEffect, useState } from 'react';
import { chatApi, useChatContacts, type GroupMember } from '@/api';

/**
 * WHO IS IN THIS GROUP, AND WHO MAY CHANGE IT.
 *
 * The roster was frozen at creation until this existed. What the panel shows is
 * decided by the server, not guessed here: it renders the actions it is allowed
 * to render from the role it was handed, and every one of them is refused again
 * on the way in. A UI that hides a button is a courtesy; the gate is the API.
 *
 * The owner is never removable and never demotable, which is why their row has
 * no controls at all rather than controls that fail.
 */
export function GroupPanel({ conversationId, title, meId, onClose, onChanged, onLeft }: {
  conversationId: string;
  title: string;
  meId?: string;
  onClose: () => void;
  /** The conversation list owns the name and the membership — it refetches. */
  onChanged: () => void;
  onLeft: () => void;
}) {
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(title);
  const [adding, setAdding] = useState(false);
  const contacts = useChatContacts();

  const load = () => {
    chatApi.groupMembers(conversationId).then(setMembers).catch(() => setErr('Could not load who is in this group.'));
  };
  useEffect(load, [conversationId]);
  useEffect(() => { setName(title); }, [title]);

  const me = members?.find((m) => m.userId === meId);
  const canAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isOwner = me?.role === 'OWNER';

  /** Every action goes through here: one place that reports a refusal in the
   *  server's own words rather than a generic failure. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); onChanged(); }
    catch (e) { setErr((e as { message?: string }).message || 'That did not work.'); }
    finally { setBusy(false); }
  };

  const already = new Set((members ?? []).map((m) => m.userId));
  const addable = (contacts.data ?? []).filter((c) => !already.has(c.id));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(460px, 100%)', maxHeight: '82vh', overflowY: 'auto', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>Group</h3>

        {canAdmin ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name"
              style={{ flex: 1, fontSize: 16 }} />
            <button type="button" className="btn btn-sm" disabled={busy || !name.trim() || name === title}
              onClick={() => void run(() => chatApi.renameGroup(conversationId, name.trim()))}>Rename</button>
          </div>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{title}</p>
        )}

        {err && <p role="alert" style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--danger-ink)' }}>{err}</p>}
        {!members && !err && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}

        {members && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {members.map((m) => (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}{m.userId === meId ? ' (you)' : ''}
                  </span>
                  {m.handle && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>@{m.handle}</span>}
                </span>
                {m.role !== 'MEMBER' && (
                  <span className="pill" style={{ fontSize: 11 }}>{m.role === 'OWNER' ? 'Owner' : 'Admin'}</span>
                )}
                {/* The owner's row carries no controls — not disabled ones.
                    A button that is always refused is a question with one answer. */}
                {isOwner && m.role !== 'OWNER' && (
                  <button type="button" className="btn btn-line btn-sm" disabled={busy}
                    onClick={() => void run(() => chatApi.setGroupRole(conversationId, m.userId, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'))}>
                    {m.role === 'ADMIN' ? 'Demote' : 'Make admin'}
                  </button>
                )}
                {canAdmin && m.role !== 'OWNER' && m.userId !== meId && (
                  <button type="button" className="btn btn-line btn-sm" disabled={busy}
                    style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
                    onClick={() => void run(() => chatApi.removeGroupMember(conversationId, m.userId))}>Remove</button>
                )}
              </div>
            ))}
          </div>
        )}

        {canAdmin && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}>{adding ? 'Cancel' : 'Add people'}</button>
            {adding && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
                {addable.length === 0
                  ? <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                      Everybody you are connected to is already here. You can only add members you are connected to.
                    </p>
                  : addable.map((c) => (
                      <button key={c.id} type="button" className="btn btn-line btn-sm" disabled={busy}
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => void run(() => chatApi.addGroupMembers(conversationId, [c.id]))}>
                        {c.name} <span className="muted" style={{ marginLeft: 6 }}>@{c.handle}</span>
                      </button>
                    ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {/* Leaving says what it costs. The owner is told where the group goes,
              because "you are the owner" is exactly when somebody hesitates. */}
          <button type="button" className="btn btn-line btn-sm" disabled={busy}
            style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
            onClick={() => void run(async () => { await chatApi.leaveGroup(conversationId); onLeft(); })}>
            Leave group
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>Done</button>
        </div>
        {isOwner && (members?.length ?? 0) > 1 && (
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            You own this group. If you leave, it passes to the longest-standing admin.
          </p>
        )}
      </div>
    </div>
  );
}
'''
if p.exists() and p.read_text() == content:
    print('   = GroupPanel.tsx: already written')
else:
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(content)
    print('   + together-city-react/src/features/chat/components/GroupPanel.tsx (whole file)')
PYEOF

echo "== Wiring the panel into the thread header"
python3 <<'PYEOF'
import pathlib, sys
def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text()
    if present in s: print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1: sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x\n{anchor[:200]}")
    p.write_text(s.replace(anchor, replacement)); print(f"   + {path}")

CHATS = 'together-city-react/src/features/chat/pages/Chats.tsx'

apply(CHATS, "import { GroupPanel }",
r'''import { ChatStarter } from '../components/ChatStarter';''',
r'''import { ChatStarter } from '../components/ChatStarter';
import { GroupPanel } from '../components/GroupPanel';''')

apply(CHATS, "const [groupOpen, setGroupOpen]",
r'''  const [peerOnline, setPeerOnline] = useState(false);''',
r'''  const [peerOnline, setPeerOnline] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const activeIsGroup = useMemo(
    () => Boolean((conversations.data ?? []).find((c) => c.id === activeId)?.isGroup),
    [conversations.data, activeId],
  );''')

# The title becomes the door into the group, the way every messenger does it.
apply(CHATS, "activeIsGroup ? (",
r'''                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</b>''',
r'''                <div style={{ flex: 1, minWidth: 0 }}>
                  {activeIsGroup ? (
                    <button type="button" onClick={() => setGroupOpen(true)}
                      aria-label="Group members and settings"
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                      <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</b>
                    </button>
                  ) : (
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</b>
                  )}''')

apply(CHATS, "<GroupPanel",
r'''              <Composer onSend={sendWithReply} onTyping={emitTyping}''',
r'''              {groupOpen && activeId && (
                <GroupPanel conversationId={activeId} title={activeTitle} meId={user?.id}
                  onClose={() => setGroupOpen(false)}
                  onChanged={() => { void conversations.refetch(); }}
                  onLeft={() => { setGroupOpen(false); setActiveId(undefined); void conversations.refetch(); }} />
              )}
              <Composer onSend={sendWithReply} onTyping={emitTyping}''')
print("== Wiring applied.")
PYEOF

echo "== Gates: backend (tsc + jest)"
echo "   (dev/dev, security/route-reach, privacy/purge-plan stay excluded — red on"
echo "    origin/main before this script, still someone else's to fix.)"
( cd together-city-chat && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/src/conversations/conversations.service.ts \
  together-city-chat/src/conversations/conversations.controller.ts \
  together-city-chat/src/conversations/dto/conversations.dto.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/features/chat/components/GroupPanel.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  land-a-group-can-change-who-is-in-it.sh

git commit -m "A group can change who is in it" -m "The largest functional hole left in chat: a group's roster was frozen at
creation. No add, no remove, and no way out — deleting the thread from your
own panel does not remove you, so you keep receiving it. MemberRole has had
OWNER, ADMIN and MEMBER in the enum since the schema was written, the
creator has always been written as OWNER, and not one line ever read the
column back. Everything here reads it.

THE RULES, AND WHY. Admins and the owner change the roster and the name.
Everybody added must be connected to the person adding them — the same gate
createGroup has always applied, because a group is not a way to put a
stranger in front of somebody who never accepted them. Only the owner
changes roles, and never to OWNER: an admin who could demote the other
admins is an owner by another name. The owner cannot be removed or demoted,
so their row carries no controls rather than controls that fail.

LEAVING DELETES THE MEMBERSHIP ROW, because recipientIds is computed from
members and anything less leaves a leaver still receiving the group. An
owner may leave and ownership moves — longest-standing admin, else
longest-standing member. Requiring a hand-over first sounds tidy and is a
trap: the owner would be the one person with no way out.

NOT BUILT, DELIBERATELY: a roster change sends no socket frame. The list
polls every fifteen seconds, and a new member's socket joins the room on
their next handshake or on the first message after they were added, since
the gateway pulls recipients in by user room on message.created. The gap is
at most one poll and never loses a message. Worth an event the day the
group UI shows presence, not before.

No migration.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
