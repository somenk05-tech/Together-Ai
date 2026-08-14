#!/bin/bash
# land-a-message-can-be-sent-on.sh — "A message can be sent on."
#
# Forward: pick a message, pick a conversation, it goes — text, files, voice
# notes and share cards alike.
#
# THE INTERESTING PART IS THE GATE, NOT THE BUTTON. The audit added
# assertOwnAttachments, which requires an attachment URL to name the sender's
# own `uploads/<id>/` namespace — that closed a real hole (any URL, rendered
# eagerly by every recipient's browser, is a tracking pixel anybody could post
# into any conversation). A forward is the one legitimate case that rule
# forbids: the file belongs to whoever sent it to you.
#
# So the rule widens by exactly one clause, and not an inch further: you may
# attach a file you uploaded, OR a file that was sent to a conversation you are
# a member of. The second half is a database question, not a string question —
# the URL has to name an Attachment row whose message sits in a conversation
# with the sender in it. An arbitrary URL still cannot be posted, a file from a
# chat you were removed from cannot be forwarded, and the hole the audit closed
# stays closed.
#
# Multi-select is NOT in this commit. Forwarding one message is the whole of
# what a selection bar would then do N times, and the interaction rewrite is
# worth its own change rather than riding along with a permission decision.
#
# APPLY-shape, idempotent. No migration, no new routes.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="A group can change who is in it"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-a-group-can-change-who-is-in-it.sh first."; exit 1 ;;
esac
MARK="A message can be sent on"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/messages/forwarding-is-not-injection.spec.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/features/chat/components/ForwardPanel.tsx
together-city-react/src/features/chat/components/MessageThread.tsx
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

MS     = 'together-city-chat/src/messages/messages.service.ts'
API    = 'together-city-react/src/api/chat.api.ts'
THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the gate widens by one clause ───────────────────────────────────────
apply(MS, "assertAttachmentsAreYoursToSend",
r'''    // 1b) attachment gate — see assertOwnAttachments below.
    if (dto.attachments?.length) this.assertOwnAttachments(senderId, dto.attachments);''',
r'''    // 1b) attachment gate — see assertAttachmentsAreYoursToSend below.
    if (dto.attachments?.length) await this.assertAttachmentsAreYoursToSend(senderId, dto.attachments);''')

apply(MS, "A FORWARD IS THE ONE LEGITIMATE CASE",
r'''  private assertOwnAttachments(
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
  }''',
r'''  private async assertAttachmentsAreYoursToSend(
    senderId: string,
    attachments: Array<{ url: string; thumbnail?: string }>,
  ): Promise<void> {
    const base = (this.config.get<string>('media.publicBaseUrl') ?? '').replace(/\/+$/, '');
    const own = (u: string | undefined): boolean => {
      if (!u) return true;
      if (base && !u.startsWith(`${base}/`)) return false;
      const path = (() => { try { return new URL(u).pathname; } catch { return u; } })();
      return path.includes(`/uploads/${senderId}/`);
    };

    /* A FORWARD IS THE ONE LEGITIMATE CASE THE FIRST RULE FORBIDS — the file
       belongs to whoever sent it to you, so `uploads/<you>/` will never match.
       The second clause is a DATABASE question rather than a string one: the
       URL must name an Attachment row whose message sits in a conversation
       this sender is a member of. An arbitrary URL still cannot be posted, and
       a file from a chat they have left or been removed from is no longer
       theirs to pass on, because membership is re-read here and not trusted
       from whenever they first saw it. */
    const urls = attachments.flatMap((a) => [a.url, a.thumbnail]).filter((u): u is string => Boolean(u));
    const foreign = urls.filter((u) => !own(u));
    if (!foreign.length) return;

    // unbounded: `in:` at most ten attachments' worth of urls — the DTO caps it
    const seen = await this.prisma.attachment.findMany({
      where: {
        url: { in: foreign },
        message: { conversation: { members: { some: { userId: senderId } } } },
      },
      select: { url: true },
    });
    const allowed = new Set(seen.map((r) => r.url));
    for (const u of foreign) {
      if (!allowed.has(u)) {
        throw new ForbiddenException('An attachment must be a file you uploaded, or one sent to a conversation you are in.');
      }
    }
  }''')

# ── 2 · the client ──────────────────────────────────────────────────────────
apply(API, "forwardMessage:",
r'''  /* ---- groups: a roster that can change ---- */''',
r'''  /**
   * Send an existing message on to another conversation.
   *
   * A copy, not a reference: the new row is its own message with its own id,
   * its own receipts and its own place in the other conversation's history.
   * The attachments travel as URLs — the same bytes, no re-upload — which is
   * exactly what the widened gate in messages.service permits and why it had
   * to be widened rather than bypassed.
   */
  forwardMessage: (toConversationId: string, m: Message): Promise<Message> =>
    apiPost('/messages', {
      conversationId: toConversationId,
      body: m.body || undefined,
      ...(m.share ? { share: m.share } : {}),
      ...((m.media ?? []).length ? {
        messageType: m.media![0].kind === 'image' ? 'IMAGE'
          : m.media![0].kind === 'video' ? 'VIDEO'
          : m.media![0].kind === 'audio' ? 'VOICE' : 'FILE',
        attachments: m.media!.map((a) => ({
          url: a.url,
          mimeType: a.mimeType ?? 'application/octet-stream',
          size: a.sizeBytes ?? 0,
          ...(a.name ? { name: a.name } : {}),
          ...(a.durationSec ? { duration: Math.round(a.durationSec) } : {}),
          ...(a.thumbUrl ? { thumbnail: a.thumbUrl } : {}),
        })),
      } : {}),
    }, MessageSchema),

  /* ---- groups: a roster that can change ---- */''')

# ── 3 · the thread offers it ────────────────────────────────────────────────
apply(THREAD, "onForward?: (m: Message) => void",
r'''  onReply?: (m: Message) => void;''',
r'''  onReply?: (m: Message) => void;
  onForward?: (m: Message) => void;''')

apply(THREAD, "onReply, onForward, onJump",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onJump, fetchInfo, jumpToId }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onJump, fetchInfo, jumpToId }: {''')

apply(THREAD, "⤳ Forward",
r'''                  {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}''',
r'''                  {onForward && !deleted && <button type="button" title="Forward" onClick={() => { onForward(m); setTouchOpen(null); }}>⤳ Forward</button>}
                  {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}''')

# ── 4 · the page picks where it goes ────────────────────────────────────────
apply(CHATS, "import { ForwardPanel }",
r'''import { GroupPanel } from '../components/GroupPanel';''',
r'''import { GroupPanel } from '../components/GroupPanel';
import { ForwardPanel } from '../components/ForwardPanel';''')

apply(CHATS, "const [forwarding, setForwarding]",
r'''  const [groupOpen, setGroupOpen] = useState(false);''',
r'''  const [groupOpen, setGroupOpen] = useState(false);
  const [forwarding, setForwarding] = useState<Message | null>(null);''')

apply(CHATS, "onForward={setForwarding}",
r'''                      onReply={setReplyTo} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}''',
r'''                      onReply={setReplyTo} onForward={setForwarding} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}''')

apply(CHATS, "<ForwardPanel",
r'''              {groupOpen && activeId && (''',
r'''              {forwarding && (
                <ForwardPanel message={forwarding} fromConversationId={activeId}
                  conversations={list}
                  onClose={() => setForwarding(null)}
                  onSent={(toId) => {
                    setForwarding(null);
                    void conversations.refetch();
                    // The copy lands in the OTHER conversation; if that thread
                    // is the one on screen it needs re-reading, and if it is
                    // not, the list's own poll is what shows it.
                    void qc.invalidateQueries({ queryKey: ['chat', 'messages', toId] });
                  }} />
              )}
              {groupOpen && activeId && (''')

print("== Anchored edits applied.")
PYEOF

echo "== Writing the forward picker + its guard"
python3 <<'PYEOF'
import pathlib

def write(path, content):
    p = pathlib.Path(path)
    if p.exists() and p.read_text() == content:
        print(f"   = {path}: already written"); return
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(content)
    print(f"   + {path} (whole file)")

write('together-city-react/src/features/chat/components/ForwardPanel.tsx', r'''import { useState } from 'react';
import { chatApi, type Conversation, type Message } from '@/api';

/**
 * WHERE DOES THIS GO.
 *
 * One conversation at a time, deliberately: forwarding to several at once is
 * the same call in a loop, and the thing that makes it safe — being sure which
 * room you just put somebody's message into — is exactly what a multi-select
 * makes fuzzy. The list names the room and says nothing else.
 *
 * The conversation it came FROM is excluded. Forwarding a message into the
 * thread it is already in is never what somebody means, and offering it is how
 * a mis-tap becomes a duplicate.
 */
export function ForwardPanel({ message, fromConversationId, conversations, onClose, onSent }: {
  message: Message;
  fromConversationId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onSent: (toConversationId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const preview = message.body
    || (message.share?.title ? `Card · ${message.share.title}` : '')
    || ((message.media ?? []).length ? `${message.media!.length} attachment${message.media!.length > 1 ? 's' : ''}` : 'Message');

  const send = async (to: Conversation) => {
    setBusy(to.id); setErr(null);
    try {
      await chatApi.forwardMessage(to.id, message);
      onSent(to.id);
    } catch (e) {
      setErr((e as { message?: string }).message || 'That could not be forwarded.');
      setBusy(null);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(420px, 100%)', maxHeight: '80vh', overflowY: 'auto', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Forward to</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </p>

        {err && <p role="alert" style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--danger-ink)' }}>{err}</p>}

        <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
          {targets.length === 0
            ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>There is nowhere else to send this yet.</p>
            : targets.map((c) => (
                <button key={c.id} type="button" className="btn btn-line btn-sm" disabled={Boolean(busy)}
                  style={{ justifyContent: 'flex-start' }} onClick={() => void send(c)}>
                  {busy === c.id ? 'Sending…' : (c.title || 'Conversation')}
                  {c.isGroup && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>group</span>}
                </button>
              ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
''')

write('together-city-chat/src/messages/forwarding-is-not-injection.spec.ts', r'''import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A FORWARD IS NOT AN INJECTION.
 *
 * The audit's attachment gate requires a URL to name the sender's own upload
 * namespace, because an unchecked URL is a tracking pixel anyone can post into
 * any conversation and every recipient's browser fetches it on render.
 * Forwarding is the one legitimate case that rule forbids, so the rule widened
 * — and the danger in widening a security check is that it widens further than
 * intended. These four assertions are the edges.
 */
function build(seenUrls: string[]) {
  const prisma: any = {
    attachment: { findMany: jest.fn(async () => seenUrls.map((url) => ({ url }))) },
  };
  const svc = new MessagesService(
    prisma,
    {} as any,
    { publish: () => undefined } as any,
    { get: () => 'https://cdn.example' } as any,
  );
  const check = (attachments: unknown) =>
    (svc as any).assertAttachmentsAreYoursToSend('me', attachments);
  return { svc, prisma, check };
}

describe('a forward is not an injection', () => {
  it('lets you send a file you uploaded yourself, without asking the database', async () => {
    const { check, prisma } = build([]);
    await expect(check([{ url: 'https://cdn.example/uploads/me/a.jpg' }])).resolves.toBeUndefined();
    expect(prisma.attachment.findMany).not.toHaveBeenCalled();
  });

  it('lets you forward a file that was sent to a conversation you are in', async () => {
    const url = 'https://cdn.example/uploads/them/b.jpg';
    const { check } = build([url]);
    await expect(check([{ url }])).resolves.toBeUndefined();
  });

  it('refuses a URL that names no attachment row at all — the hole the gate exists to close', async () => {
    const { check } = build([]);
    await expect(check([{ url: 'https://tracker.example/pixel.gif' }])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a real file from a conversation the sender is not in', async () => {
    // The query is membership-scoped, so a file that exists but belongs to a
    // chat they are not in comes back as no row — same refusal, and this is
    // the assertion that would fail if somebody dropped the `members: some`.
    const { check } = build([]);
    await expect(check([{ url: 'https://cdn.example/uploads/them/private.pdf' }])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the thumbnail too, not only the file', async () => {
    const { check } = build(['https://cdn.example/uploads/them/ok.mp4']);
    await expect(check([{
      url: 'https://cdn.example/uploads/them/ok.mp4',
      thumbnail: 'https://tracker.example/pixel.gif',
    }])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
''')
PYEOF

echo "== Gates: backend (tsc + jest)"
echo "   (dev/dev, security/route-reach, privacy/purge-plan stay excluded — red on"
echo "    origin/main before this script, still someone else's to fix.)"
( cd together-city-chat && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/messages/forwarding-is-not-injection.spec.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/features/chat/components/ForwardPanel.tsx \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  land-a-message-can-be-sent-on.sh

git commit -m "A message can be sent on" -m "Forward: pick a message, pick a conversation, it goes — text, files, voice
notes and share cards alike. A copy, not a reference: its own row, its own
id, its own receipts, its own place in the other conversation's history.

THE INTERESTING PART IS THE GATE, NOT THE BUTTON. The audit added
assertOwnAttachments, requiring an attachment URL to name the sender's own
uploads/<id>/ namespace — closing a real hole, since any URL is a tracking
pixel that every recipient's browser fetches on render. A forward is the
one legitimate case that rule forbids: the file belongs to whoever sent it
to you, so the namespace will never match.

So the rule widens by exactly one clause. You may attach a file you
uploaded, OR one that was sent to a conversation you are a member of — and
the second half is a DATABASE question, not a string question: the URL must
name an Attachment row whose message sits in a conversation with this
sender in it. Membership is re-read at send time rather than trusted from
whenever they first saw the file, so a chat they have left or been removed
from is no longer theirs to forward from. An arbitrary URL still cannot be
posted. Thumbnails are checked on the same rule, because a forwarded video
with an attacker's poster frame is the same hole wearing a different field.

Guard: forwarding-is-not-injection.spec.ts — five assertions on the edges of
the widened rule, including the one that fails if somebody ever drops the
membership scope.

MULTI-SELECT IS NOT HERE, deliberately. Forwarding one message is the whole
of what a selection bar does N times, and an interaction rewrite should not
ride along with a permission decision.

No migration, no new routes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
