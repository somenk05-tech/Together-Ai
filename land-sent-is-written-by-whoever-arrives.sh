#!/usr/bin/env bash
# land-sent-is-written-by-whoever-arrives.sh  ·  run from the REPO ROOT
#
# REGRESSION from "One message is one message", landed this morning. Land it
# ahead of the rest of the mail audit queue.
#
# fanOut wrote the sender's copy with `keepSentCopy: i === 0` — "the first
# recipient carries the row". That is the same thing as "the first attempt that
# WRITES one" only when the first recipient gets far enough to write. It does
# not when the address is malformed, names no city mailbox, belongs to somebody
# the sender is not connected with, or the mailbox is full: sendOne throws
# before any create, and every later recipient then ran with the copy already
# spoken for and wrote an inbox row and nothing else.
#
#   send({ to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'] })
#
# Alice receives the mail. send() returns 200 with her in `delivered`, so
# clearDraft removes the draft. The sender is left with no Sent row, no Failed
# row and no draft — a message delivered, and no trace of it in the mailbox
# that sent it.
#
# SELF-CONTAINED. This script carries its own edits as anchored replacements
# rather than verifying files already on disk, because the working tree is
# shared with another session and uncommitted files have been discarded once.
# Every anchor is matched EXACTLY ONCE or the script stops having changed
# nothing.
#
# SCOPE GUARD IS NARROW ON PURPOSE. It refuses only when src/mail/ is already
# dirty. Unrelated work elsewhere in the tree is left alone and never staged —
# the commit names its four paths explicitly.
set -uo pipefail
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] || die "run me from the repo root (no $A/ here)"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
# The log goes into a variable first. `git log | grep -q` exits early, git dies
# on SIGPIPE, and under `pipefail` the pipeline reports THAT — so the check
# reads as "not found" whether or not it is there. Every land script in this
# repo captures first for the same reason.
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'Sent is written by whoever arrives' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'One message is one message' >/dev/null
[ $? -eq 0 ] || die "base commit 'One message is one message' is not here - this lands on top of it"
ok "base is here, the fix is not"

say "2 - scope"
# Only the three files below may be dirty. Anything else under src/mail/ is
# somebody else's work in flight and this script must not run over it.
STRAY="$(git status --porcelain -- "$A/src/mail/" \
  | grep -Ev 'src/mail/(mail\.service\.ts|mail-cc-bcc\.spec\.ts|sent-is-written-by-whoever-arrives\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m src/mail/ carries changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "src/mail/ carries only this change, or nothing"

say "3 - edits"
# IDEMPOTENT. Each replacement is skipped when its result is already in the
# file and its anchor is gone — the tree may already hold these edits from the
# session that wrote them, and re-running must not be a way to lose them. An
# anchor that matches neither state stops the script having changed nothing.
python3 - "$A" <<'PYEOF' || die "edits did not apply"
import io, sys, os
A = sys.argv[1]
p = os.path.join(A, 'src/mail/mail.service.ts')
s = io.open(p, encoding='utf-8').read()
applied, skipped = 0, 0

def rep(old, new):
    global s, applied, skipped
    n = s.count(old)
    if n == 1:
        s = s.replace(old, new); applied += 1; return
    if n == 0 and s.count(new) == 1:
        skipped += 1; return
    sys.stderr.write("   anchor matched %d times and its result %d times, wanted 1 of one of them:\n   %r\n"
                     % (n, s.count(new), old[:120]))
    sys.exit(1)

rep("""    const cc = (dto.cc ?? []).map((a) => a.trim()).filter(Boolean);
    const bcc = (dto.bcc ?? []).map((a) => a.trim()).filter(Boolean);
    const sent: string[] = [];
    const failed: Array<{ to: string; reason: string }> = [];

    for (const [i, r] of queue.entries()) {
      try {
        await this.sendOne(userId, {
          ...dto, to: r.addr, resolvedThreadId: threadId, projectId: project?.id ?? null,
          // The sender keeps ONE Sent copy, written with the first recipient,
          // and it is the only row that ever carries the blind list. Later
          // recipients write an inbox row and nothing else.
          keepSentCopy: i === 0,
          ccAddrs: cc.length ? cc.join(', ') : null,
          bccAddrs: i === 0 && bcc.length ? bcc.join(', ') : null,
        });""",
"""    const cc = (dto.cc ?? []).map((a) => a.trim()).filter(Boolean);
    const bcc = (dto.bcc ?? []).map((a) => a.trim()).filter(Boolean);
    const sent: string[] = [];
    const failed: Array<{ to: string; reason: string }> = [];

    /**
     * THE MESSAGE'S OWN ROW BELONGS TO THE FIRST ATTEMPT THAT WRITES ONE, not
     * to the first attempt MADE.
     *
     * `keepSentCopy: i === 0` read as "the first recipient carries the row",
     * and it is only the same thing when the first recipient gets far enough
     * to write. It does not, when the address is malformed, names no city
     * mailbox, belongs to somebody the sender is not connected with, or the
     * mailbox is full: `sendOne` throws before any create. The later
     * recipients then ran with the copy already spoken for and wrote an inbox
     * row and nothing else.
     *
     *   send({ to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'] })
     *
     * Alice gets the mail. `send()` returns 200 with her in `delivered`, so
     * `clearDraft` removes the draft. The sender is left with NO Sent row, no
     * Failed row and no draft — a message delivered and no trace of it
     * anywhere in the mailbox that sent it.
     *
     * A ledger rather than an index, because the fact being tracked is "has a
     * row for this message been written", and only the writer knows. It flips
     * on a Failed row too: an external refusal already files the message so
     * Retry can find it, and a second row would be a second copy of one
     * message, which is the thing the previous commit was for.
     */
    const ownCopy = { written: false };

    for (const r of queue) {
      try {
        await this.sendOne(userId, {
          ...dto, to: r.addr, resolvedThreadId: threadId, projectId: project?.id ?? null,
          ownCopy,
          ccAddrs: cc.length ? cc.join(', ') : null,
          bccAddrs: !ownCopy.written && bcc.length ? bcc.join(', ') : null,
        });""")

rep("""  private async sendOne(userId: string, dto: SendMailDto & {
    keepSentCopy: boolean; ccAddrs: string | null; bccAddrs: string | null;""",
"""  private async sendOne(userId: string, dto: SendMailDto & {
    /** Shared across the fan-out: set once, by whichever attempt writes the sender's row. */
    ownCopy: { written: boolean }; ccAddrs: string | null; bccAddrs: string | null;""")

rep("""    await this.prisma.$transaction([
      // The sender's Sent copy, written once for the whole message rather than
      // once per recipient — five rows in Sent for one message is five things
      // to delete and four lies about how many messages were written. It is
      // also THE ONLY ROW that ever carries the blind list.
      ...(dto.keepSentCopy
        ? [this.prisma.mailMessage.create({ data: { ...base, bccAddrs: dto.bccAddrs, ownerId: userId, boxUserId: userId, folder: 'sent', read: true, projectId } })]
        : []),""",
"""    const keepOwnCopy = !dto.ownCopy.written;
    await this.prisma.$transaction([
      // The sender's Sent copy, written once for the whole message rather than
      // once per recipient — five rows in Sent for one message is five things
      // to delete and four lies about how many messages were written. It is
      // also THE ONLY ROW that ever carries the blind list.
      ...(keepOwnCopy
        ? [this.prisma.mailMessage.create({ data: { ...base, bccAddrs: dto.bccAddrs, ownerId: userId, boxUserId: userId, folder: 'sent', read: true, projectId } })]
        : []),""")

rep("""    ]);
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  /** Send to a GLOBAL (external) email address via the email provider (Resend).""",
"""    ]);
    // Claimed only after the write succeeded — a transaction that threw leaves
    // the row unwritten, and the next recipient must still be able to carry it.
    if (keepOwnCopy) dto.ownCopy.written = true;
    await this.linkAttachments(userId, threadId, dto.attachmentFileIds);
    return this.list(userId, { folder: 'sent' });
  }

  /** Send to a GLOBAL (external) email address via the email provider (Resend).""")

rep("""      keepSentCopy?: boolean; ccAddrs?: string | null; bccAddrs?: string | null;
      resolvedThreadId: string; projectId: string | null;""",
"""      ownCopy: { written: boolean }; ccAddrs?: string | null; bccAddrs?: string | null;
      resolvedThreadId: string; projectId: string | null;""")

rep("""     * KNOWN RESIDUE, stated rather than discovered: if the FIRST recipient is
     * refused and a later one is accepted, the row is filed under Failed even
     * though the message did reach somebody. Retrying it re-sends to the
     * refused address only, which is the right repair — but the row's folder
     * is telling half the story until then. Fixing that properly means one
     * provider call carrying to/cc/bcc rather than a fan-out, which is a
     * change to the delivery topology and belongs in its own commit.
     */
    if (dto.keepSentCopy === false) {""",
"""     * The row belongs to the first attempt that WRITES one, not the first
     * attempt made — see the ledger in fanOut. A refusal writes it too, in
     * Failed, so a message nobody would take is still somewhere the citizen
     * can find and retry.
     *
     * KNOWN RESIDUE, stated rather than discovered: if the row is claimed by a
     * refusal and a LATER recipient is accepted, the row is filed under Failed
     * even though the message did reach somebody. Fixing that properly means
     * one provider call carrying to/cc/bcc rather than a fan-out, which is a
     * change to the delivery topology and belongs in its own commit.
     */
    if (dto.ownCopy.written) {""")

rep("""        ...(failed && dto.attachmentFileIds?.length ? { attachmentIds: JSON.stringify(dto.attachmentFileIds) } : {}),
      },
    });

    // Keep the attachments visible on whichever copy was written.""",
"""        ...(failed && dto.attachmentFileIds?.length ? { attachmentIds: JSON.stringify(dto.attachmentFileIds) } : {}),
      },
    });
    // Sent or Failed, the message now has exactly one row. Later recipients
    // dispatch and write nothing.
    dto.ownCopy.written = true;

    // Keep the attachments visible on whichever copy was written.""")

io.open(p, 'w', encoding='utf-8').write(s)

# mail-cc-bcc.spec.ts pins this rule by matching the SOURCE TEXT, so its regex
# moves with the line. The behaviour is pinned in the new spec instead.
q = os.path.join(A, 'src/mail/mail-cc-bcc.spec.ts')
t = io.open(q, encoding='utf-8').read()
old = """    expect(code).toMatch(/bccAddrs:\\s*i === 0 && bcc\\.length/);"""
new = """    // The condition is the ledger rather than the index because a refused
    // first recipient writes no row — see
    // sent-is-written-by-whoever-arrives.spec.ts, which asserts the behaviour
    // this line only describes.
    expect(code).toMatch(/bccAddrs:\\s*!ownCopy\\.written && bcc\\.length/);"""
# "Already applied" is decided on the assertion itself, not on the comment
# above it — a comment that has been reworded is not a half-applied edit.
if t.count(old) == 1:
    io.open(q, 'w', encoding='utf-8').write(t.replace(old, new)); applied += 1
elif 'bccAddrs:\\s*!ownCopy\\.written && bcc\\.length' in t:
    skipped += 1
else:
    sys.stderr.write("   cc-bcc spec: neither the old assertion nor the new one is in the file\n")
    sys.exit(1)
print("   %d edit(s) applied, %d already present" % (applied, skipped))
PYEOF
ok "service and the text-matching spec updated"

say "4 - the new spec"
cat > "$A/src/mail/sent-is-written-by-whoever-arrives.spec.ts" <<'SPECEOF'
import { MailService } from './mail.service';

/**
 * A DELIVERED MESSAGE ALWAYS LEAVES A TRACE IN THE MAILBOX THAT SENT IT.
 *
 * `fanOut` wrote the sender's copy with `keepSentCopy: i === 0` — "the first
 * recipient carries the row". That is the same thing as "the first attempt that
 * writes one" only when the first recipient gets far enough to write. It does
 * not when the address is malformed, names no city mailbox, belongs to somebody
 * the sender is not connected with, or the mailbox is full: `sendOne` throws
 * before any create, and every later recipient then ran with the copy already
 * spoken for and wrote an inbox row and nothing else.
 *
 *   send({ to: <refused>, cc: [<accepted>] })
 *
 * The Cc'd citizen receives the mail. `send()` returns 200 with them in
 * `delivered`, so `clearDraft` removes the draft. The sender is left with no
 * Sent row, no Failed row and no draft: a message delivered, and no trace of
 * it anywhere in their own mailbox.
 *
 * This file sends to somebody who will be refused FIRST, which is the one
 * shape none of the other mail suites has: `one-message-one-thread.spec.ts`
 * exercises the reverse order only (`to` succeeds, `cc` fails), so its
 * guarantee never reached this.
 *
 * CHECKED AGAINST THE OLD CODE. With the ledger reverted to `i === 0`, the
 * first two assertions below fail and the rest pass.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness() {
  const rows: any[] = [];
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    if (where.threadId !== undefined && where.threadId !== r.threadId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    if (where.folder?.in && !where.folder.in.includes(r.folder)) return false;
    return true;
  };
  const create = async ({ data }: any) => {
    const row = {
      id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), starred: false,
      threadId: null, projectId: null, ccAddrs: null, bccAddrs: null, failureReason: null, ...data,
    };
    rows.push(row); return row;
  };
  const prisma: any = {
    mailMessage: {
      create,
      findFirst: async ({ where }: any) => rows.find((r) => matches(where, r)) ?? null,
      findMany: async ({ where, select }: any) => {
        const hit = rows.filter((r) => matches(where ?? {}, r));
        return select?.sizeBytes ? hit.map((r) => ({ sizeBytes: r.sizeBytes })) : hit;
      },
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
    mailProject: { findFirst: async () => null },
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app' }) },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return { id: 'u1', name: 'Somen', handle: 'somen' };
        // `stranger` exists but is not connected; `nobody` does not exist at
        // all. Both refuse BEFORE any row is written, which is the point.
        const known: any = {
          alice: { id: 'u2', name: 'Alice', handle: 'alice' },
          bob: { id: 'u3', name: 'Bob', handle: 'bob' },
          stranger: { id: 'u9', name: 'Stranger', handle: 'stranger' },
          somen: { id: 'u1', name: 'Somen', handle: 'somen' },
        };
        return known[where.handle] ?? null;
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  svc.isConnected = async (_me: string, other: string) => other !== 'u9';
  svc.linkAttachments = async () => undefined;
  svc.clearDraft = async () => undefined;
  prisma.mailMessage.create = create;
  return { svc, rows };
}

const sentRows = (rows: any[]) => rows.filter((r) => r.ownerId === 'u1' && r.folder === 'sent');
const inboxRows = (rows: any[]) => rows.filter((r) => r.folder === 'inbox');

describe('the sender keeps a copy of a message that was delivered', () => {
  it('writes the Sent row when the FIRST recipient was refused before any write', async () => {
    const { svc, rows } = harness();
    const res = await svc.send('u1', {
      to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'], subject: 'hi', body: 'x',
    });

    expect(res.delivered).toEqual(['alice@togethercity.app']);
    expect(res.failed).toHaveLength(1);
    // Alice has it, and so does the sender. Neither used to be true together.
    expect(inboxRows(rows).map((r) => r.ownerId)).toEqual(['u2']);
    expect(sentRows(rows)).toHaveLength(1);
  });

  it('carries the blind list on that row, wherever in the queue it landed', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'nobody@togethercity.app', cc: ['alice@togethercity.app'],
      bcc: ['carol@togethercity.app'], subject: 'hi', body: 'x',
    });
    // The Bcc list is the sender's alone and must travel with whichever row is
    // theirs — pinning it to the first recipient lost it with the first refusal.
    expect(sentRows(rows)[0].bccAddrs).toContain('carol@togethercity.app');
    for (const r of inboxRows(rows)) expect(r.bccAddrs ?? null).toBeNull();
  });

  it('still keeps exactly ONE Sent row when everybody is accepted', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], subject: 'hi', body: 'x',
    });
    expect(sentRows(rows)).toHaveLength(1);
    expect(inboxRows(rows).map((r) => r.ownerId).sort()).toEqual(['u2', 'u3']);
  });

  it('writes nothing at all when every recipient is refused', async () => {
    const { svc, rows } = harness();
    await expect(svc.send('u1', {
      to: 'stranger@togethercity.app', cc: ['nobody@togethercity.app'], subject: 'hi', body: 'x',
    })).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });
});
SPECEOF
ok "sent-is-written-by-whoever-arrives.spec.ts written"

say "5 - gates"
cd "$A" || die cd
npx prisma validate        && ok "prisma validate" || die "prisma validate"
npx prisma generate        && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit           && ok "api tsc"         || die "api tsc"
npx jest src/mail --silent && ok "api jest (mail)" || die "api jest (mail)"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (main: $API_BASELINE)"
npm run build              && ok "api build"       || die "api build"
cd ..

say "6 - commit"
git add "$A/src/mail/mail.service.ts" \
        "$A/src/mail/mail-cc-bcc.spec.ts" \
        "$A/src/mail/sent-is-written-by-whoever-arrives.spec.ts" \
        land-sent-is-written-by-whoever-arrives.sh

git commit -F - <<'MSG'
Sent is written by whoever arrives

fanOut wrote the sender's copy with `keepSentCopy: i === 0` - "the first
recipient carries the row". That is the same thing as "the first attempt that
WRITES one" only when the first recipient gets far enough to write. It does
not when the address is malformed, names no city mailbox, belongs to somebody
the sender is not connected with, or the mailbox is full: sendOne throws
before any create, and every later recipient then ran with the copy already
spoken for and wrote an inbox row and nothing else.

  send({ to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'] })

Alice receives the mail. send() returns 200 with her in `delivered`, so
clearDraft removes the draft. The sender is left with NO Sent row, no Failed
row and no draft - a message delivered, and no trace of it anywhere in the
mailbox that sent it. The words are gone too.

This is a regression from "One message is one message", landed this morning.
Before it the external path wrote one row per recipient, so a later success
still left the sender a copy. The fix that removed four redundant rows removed
the last one along with them, in the case nobody tested.

A LEDGER, NOT AN INDEX. The fact being tracked is "has a row for this message
been written", and only the writer knows it, so the writer sets it. It flips
on a Failed row too: an external refusal already files the message so Retry
can find it, and a second row would be a second copy of one message - the
thing this morning's commit was for.

The blind list moves with it. bccAddrs was pinned to `i === 0` for the same
reason and lost the same way: a refused first recipient took the Bcc list with
it, and the sender's actual row carried none.

THE SPEC WAS RUN AGAINST THE OLD CODE BEFORE IT WAS TRUSTED. Ledger reverted:
two of its four assertions fail. Ledger in: all four pass. It carries its own
harness and sends to somebody refused FIRST, which is the shape no other mail
suite has - one-message-one-thread.spec.ts exercises the reverse order only
(`to` succeeds, `cc` fails), so its guarantee never reached this.

mail-cc-bcc.spec.ts asserts this rule by matching the source TEXT, so its
regex moved with the line. That file reads code rather than running it, which
is why the behaviour is pinned in the new spec instead of there.

Found by the second audit of the mail surface, which was looking for exactly
this: what the morning's five commits broke while fixing what they fixed.
MSG

ok committed
say "review, then:  git push"
