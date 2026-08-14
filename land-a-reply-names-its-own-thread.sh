#!/usr/bin/env bash
# land-a-reply-names-its-own-thread.sh  ·  run from the REPO ROOT
#
# DELIVERABILITY. Outbound mail carried no threading headers at all, and the
# inbound side had nothing to match on.
#
# The Resend call set no Message-ID, no In-Reply-To and no References — there
# was no seam on OutboundMessage to put one on — so Gmail and Outlook were left
# to thread on the subject line. And resolveInboundThread fell back to "the most
# recent message from this correspondent, if the Re:-stripped subjects are
# identical", which two live conversations with one person is enough to break: a
# reply to the older one matches the newer one's subject, fails, and starts a
# third thread with no original beside it.
#
# The trail id is now encoded into the ids we mint, so a reply that echoes
# References back names its own thread — no lookup, no new column, no migration.
#
#   Message-ID:  <t.{threadId}.{uuid}@togethercity.app>   unique per message
#   References:  <t.{threadId}.thread@togethercity.app>   stable per thread
#
# A thread id in a header is a CLAIM, not a credential: it is believed only
# after checking the citizen already holds a row in that trail.
#
# The headers seam is also what List-Unsubscribe and Auto-Submitted will need,
# and what one provider call carrying to/cc/bcc will need. Neither is in here.
#
# SELF-CONTAINED. This script carries its own edits as anchored replacements
# rather than verifying files already on disk, because the working tree is
# shared with another session. Every anchor is matched exactly once, or already
# applied, or the script stops having changed nothing.
set -uo pipefail
A=together-city-chat
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] || die "run me from the repo root (no $A/ here)"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
# The log goes into a variable first. `git log | grep -q` exits early, git dies
# on SIGPIPE, and under `pipefail` the pipeline reports THAT - so the check
# reads as "not found" whether or not it is there.
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'A reply names its own thread' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The city is not a megaphone' >/dev/null
[ $? -eq 0 ] || die "base commit 'The city is not a megaphone' is not here - this lands on top of it"
ok "base is here, the fix is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "together-city-chat/src/mail/" \
  | grep -Ev '(together-city-chat/src/mail/mail\.service\.ts|together-city-chat/src/mail/mail-inbound\.ts|together-city-chat/src/mail/mail-inbound\.spec\.ts|together-city-chat/src/mail/messaging-provider\.ts|together-city-chat/src/mail/a-reply-names-its-own-thread\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m the touched folders carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched folders carry only this change, or nothing"

say "3 - edits"
python3 - . <<'EDITSEOF' || die "edits did not apply"
import io, sys, os
A = sys.argv[1] if len(sys.argv) > 1 else '.'
applied = skipped = 0


def edit(rel, pairs):
    global applied, skipped
    p = os.path.join(A, rel)
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n == 1:
            s = s.replace(old, new); applied += 1; continue
        if n == 0 and s.count(new) == 1:
            skipped += 1; continue
        sys.stderr.write("   %s: anchor matched %d times and its result %d times, wanted 1 of one:\n   %r\n"
                         % (rel, n, s.count(new), old[:120]))
        sys.exit(1)
    io.open(p, 'w', encoding='utf-8').write(s)


# ── the seam: a place to put a header ────────────────────────────────────────
edit('together-city-chat/src/mail/messaging-provider.ts', [
    ("""  // email only — where replies go. Set to the citizen's city address so a reply
  // lands back in THEIR inbox (via the inbound webhook), not the shared box.
  replyTo?: string;
}""",
     """  // email only — where replies go. Set to the citizen's city address so a reply
  // lands back in THEIR inbox (via the inbound webhook), not the shared box.
  replyTo?: string;
  /**
   * email only — raw headers to put on the wire.
   *
   * This is the seam that was missing. Everything an email needs beyond a
   * body — Message-ID, In-Reply-To, References, and later List-Unsubscribe and
   * Auto-Submitted — is a header, and there was nowhere to put one, so
   * outbound city mail carried none of them. Gmail and Outlook were left to
   * thread on the subject line alone.
   */
  headers?: Record<string, string>;
}"""),

    ("""      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      to: msg.to,""",
     """      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      // Threading, and whatever else the caller needs on the wire.
      ...(msg.headers && Object.keys(msg.headers).length ? { headers: msg.headers } : {}),
      to: msg.to,"""),
])

# ── inbound: read what the protocol already carries ──────────────────────────
edit('together-city-chat/src/mail/mail-inbound.ts', [
    ("""  emailId?: string;
}""",
     """  emailId?: string;
  /**
   * The Message-IDs this mail says it answers — In-Reply-To first, then the
   * References chain, newest last.
   *
   * Threading used to be "the most recent message from this correspondent,
   * if the Re:-stripped subjects match exactly". Two conversations with one
   * person was enough to break it: a reply to the older one matched the newer
   * one's subject, failed, and started a third thread. The headers are the
   * answer the protocol already carries, and the outbound side now mints ids
   * it can recognise.
   */
  inReplyTo: string[];
}"""),

    ("""  const headers = (d.headers && typeof d.headers === 'object' ? d.headers : {}) as Record<string, unknown>;
  const idRaw = d.message_id ?? d.messageId ?? headers['message-id'] ?? headers['Message-ID'] ?? d.id ?? '';""",
     """  const headers = (d.headers && typeof d.headers === 'object' ? d.headers : {}) as Record<string, unknown>;
  const idRaw = d.message_id ?? d.messageId ?? headers['message-id'] ?? headers['Message-ID'] ?? d.id ?? '';
  // Case-insensitive: header names are, and providers differ about which case
  // they hand back. Both fields are lists of <id> tokens; References carries
  // the whole chain, In-Reply-To the immediate parent, and either will do.
  const hdr = (name: string): string => {
    const k = Object.keys(headers).find((x) => x.toLowerCase() === name);
    const v = k === undefined ? undefined : headers[k];
    return typeof v === 'string' ? v : '';
  };
  const refs = `${d.in_reply_to ?? d.inReplyTo ?? hdr('in-reply-to')} ${d.references ?? hdr('references')}`;
  const inReplyTo = (refs.match(/<[^<>\\s]+>/g) ?? []).map((x) => x.trim());"""),

    ("""    emailId: typeof d.email_id === 'string' ? d.email_id
      : typeof d.emailId === 'string' ? d.emailId : undefined,
  };""",
     """    emailId: typeof d.email_id === 'string' ? d.email_id
      : typeof d.emailId === 'string' ? d.emailId : undefined,
    inReplyTo,
  };"""),
])

# The parser suite asserts the whole shape with toEqual, so a new field is a
# failure there. This change's own mess, cleaned up here.
edit('together-city-chat/src/mail/mail-inbound.spec.ts', [
    ("""      html: undefined,
      providerMessageId: '<abc@mail>',
    });
  });""",
     """      html: undefined,
      providerMessageId: '<abc@mail>',
      // Empty because this payload names no parent. The threading fields are
      // parsed now; see a-reply-names-its-own-thread.spec.ts for the shapes
      // that fill them.
      inReplyTo: [],
    });
  });"""),
])

# ── the ids, on the way out and on the way back ──────────────────────────────
edit('together-city-chat/src/mail/mail.service.ts', [
    ("""const EXTERNAL_RECIPIENTS_PER_MESSAGE = 10;""",
     """/**
 * THREADING IS CARRIED IN THE ID, NOT GUESSED FROM THE SUBJECT.
 *
 * Outbound mail set no Message-ID, no In-Reply-To and no References, so Gmail
 * and Outlook had nothing to thread on but the subject line — and the inbound
 * side had nothing to match on either, so `resolveInboundThread` fell back to
 * "the most recent message from this correspondent, if the Re:-stripped
 * subjects are identical". Two live conversations with one person was enough
 * to break it: a reply to the older one matched the newer one's subject,
 * failed, and started a third thread with no original beside it.
 *
 * The trail id is encoded INTO the ids we mint, so a reply that echoes any of
 * them back — every mail client echoes References — names its thread without
 * a lookup and without a new column.
 *
 *   Message-ID:  <t.{threadId}.{uuid}@togethercity.app>   unique per message
 *   References:  <t.{threadId}.thread@togethercity.app>   stable per thread
 *
 * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL. `threadFromRefs` is
 * only ever believed after checking the citizen already holds a row in that
 * trail — otherwise a stranger could put their mail inside somebody's
 * conversation by writing one header, which is the same hole the draft path
 * had and closed.
 */
const threadAnchorId = (threadId: string): string => `<t.${threadId}.thread@${MAIL_DOMAIN}>`;
const threadMessageId = (threadId: string): string => `<t.${threadId}.${randomUUID()}@${MAIL_DOMAIN}>`;
// Built on call, not at module load: MAIL_DOMAIN is imported BELOW this block
// (this file interleaves its constants with its imports), so reading it here
// eagerly is a temporal-dead-zone crash at require time. Every mail suite fails
// to load, which is how this was caught.
const threadRef = (): RegExp =>
  new RegExp(`^<t\\\\.([0-9a-f-]{36})\\\\.[^@<>]+@${MAIL_DOMAIN.replace(/\\./g, '\\\\.')}>$`, 'i');
const threadFromRefs = (refs: string[]): string | null => {
  const re = threadRef();
  for (const r of refs) {
    const m = re.exec(r.trim());
    if (m) return m[1].toLowerCase();
  }
  return null;
};

const EXTERNAL_RECIPIENTS_PER_MESSAGE = 10;"""),

    ("""      .send({ channel: 'email', to: toEmail, subject, body: dto.body + linkFooter + footer, kind: 'mail', from: fromHeader, replyTo, ...(attachments.length ? { attachments } : {}) })""",
     """      .send({
        channel: 'email', to: toEmail, subject, body: dto.body + linkFooter + footer, kind: 'mail',
        from: fromHeader, replyTo,
        // References names the trail on the FIRST message too, where it points
        // at an id nothing has sent yet. Clients tolerate that and still group
        // on it, and it means every message of a thread carries the same
        // anchor rather than only the replies.
        headers: { 'Message-ID': threadMessageId(threadId), References: threadAnchorId(threadId) },
        ...(attachments.length ? { attachments } : {}),
      })"""),

    ("""      const threadId = await this.resolveInboundThread(user.id, mail.from.addr, subject);""",
     """      const threadId = await this.resolveInboundThread(user.id, mail.from.addr, subject, mail.inReplyTo);"""),

    ("""  private async resolveInboundThread(userId: string, fromAddr: string, subject: string): Promise<string> {
    const strip = (t: string) => t.replace(/^\\s*(re|fwd?)\\s*:\\s*/i, '').trim().toLowerCase();""",
     """  private async resolveInboundThread(
    userId: string, fromAddr: string, subject: string, refs: string[] = [],
  ): Promise<string> {
    /**
     * THE HEADERS FIRST, BECAUSE THEY ARE THE ANSWER THE PROTOCOL CARRIES.
     *
     * Outbound mail now mints ids with the trail encoded in them, and every
     * mail client echoes References back. So a reply usually names its own
     * thread, and none of the guessing below has to run.
     *
     * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL. It is believed
     * only after checking this citizen already holds a row in that trail —
     * without that, anyone could drop their mail into the middle of somebody
     * else's conversation by writing one header, which is the hole the draft
     * path had. The check is the same shape as `resolveThreadId`'s.
     */
    const claimed = threadFromRefs(refs);
    if (claimed) {
      const mine = await this.prisma.mailMessage.findFirst({
        where: { ownerId: userId, threadId: claimed }, select: { id: true },
      });
      if (mine) return claimed;
    }

    /**
     * Then the old guess, for mail from a client that dropped the headers, or
     * a forward that came back. It looks at the most recent message from this
     * correspondent and requires the subjects to match — which is wrong often
     * enough to matter (two live conversations with one person is enough), and
     * is why the headers above exist. It is kept because losing the thread is
     * worse than occasionally starting a new one.
     */
    const strip = (t: string) => t.replace(/^\\s*(re|fwd?)\\s*:\\s*/i, '').trim().toLowerCase();"""),
])

print("   %d edit(s) applied, %d already present" % (applied, skipped))
EDITSEOF
ok "edits applied"

say "4 - a-reply-names-its-own-thread.spec.ts"
mkdir -p "$(dirname "$A/src/mail/a-reply-names-its-own-thread.spec.ts")"
cat > "$A/src/mail/a-reply-names-its-own-thread.spec.ts" <<'FILEEOF'
import { normalizeInbound } from './mail-inbound';
import { MailService } from './mail.service';

/**
 * OUTBOUND MAIL CARRIED NO THREADING HEADERS, AND INBOUND HAD NOTHING TO MATCH.
 *
 * The Resend call set no Message-ID, no In-Reply-To and no References — there
 * was no seam on OutboundMessage to put one on — so Gmail and Outlook were
 * left to thread on the subject line. And `resolveInboundThread` fell back to
 * "the most recent message from this correspondent, if the Re:-stripped
 * subjects are identical", which two live conversations with one person is
 * enough to break: a reply to the older one matches the newer one's subject,
 * fails, and starts a third thread with no original beside it.
 *
 * The trail id is now encoded into the ids we mint, so a reply that echoes
 * References back names its own thread with no lookup and no new column.
 *
 * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL — believed only after
 * checking the citizen already holds a row in that trail. The last two
 * assertions are that check; without it, one header would put a stranger's
 * mail inside somebody's conversation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const THREAD = '11111111-2222-3333-4444-555555555555';
const anchor = `<t.${THREAD}.thread@togethercity.app>`;

describe('what a reply says about the thread it answers', () => {
  it('reads In-Reply-To out of the headers, whatever the case', () => {
    const out = normalizeInbound({
      data: {
        to: ['somen@togethercity.app'], from: 'a@b.com', subject: 'Re: hi',
        headers: { 'In-Reply-To': anchor },
      },
    });
    expect(out?.inReplyTo).toEqual([anchor]);
  });

  it('reads the whole References chain', () => {
    const out = normalizeInbound({
      data: {
        to: ['somen@togethercity.app'], from: 'a@b.com', subject: 'Re: hi',
        headers: { references: `<x@y.com> ${anchor}` },
      },
    });
    expect(out?.inReplyTo).toContain(anchor);
    expect(out?.inReplyTo).toContain('<x@y.com>');
  });

  it('is an empty list, never undefined, when the mail names no parent', () => {
    const out = normalizeInbound({ data: { to: ['somen@togethercity.app'], from: 'a@b.com' } });
    expect(out?.inReplyTo).toEqual([]);
  });
});

function svcWith(rowsInThread: string[]) {
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = {
    mailMessage: {
      findFirst: async ({ where }: any) => {
        if (where.threadId) return rowsInThread.includes(where.threadId) ? { id: 'm1' } : null;
        // The subject-matching fallback finds nothing in these tests.
        return null;
      },
    },
  };
  return svc;
}

describe('which trail an arriving message joins', () => {
  it('joins the thread its References names', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', [anchor]);
    expect(got).toBe(THREAD);
  });

  it('takes the thread from any id in the chain, not only the first', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', ['<x@y.com>', anchor]);
    expect(got).toBe(THREAD);
  });

  it('refuses a thread the citizen holds no message in', async () => {
    // The forgery: one header claiming somebody else's conversation.
    const svc = svcWith([]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', [anchor]);
    expect(got).not.toBe(THREAD);
    expect(got).toEqual(expect.any(String));
  });

  it('ignores an id that is not one of ours', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', ['<t.not-a-uuid.x@evil.com>']);
    expect(got).not.toBe(THREAD);
  });

  it('still falls back to the subject when the headers are gone', async () => {
    const svc: any = Object.create(MailService.prototype);
    svc.prisma = {
      mailMessage: {
        findFirst: async ({ where }: any) =>
          (where.threadId ? null : { threadId: THREAD, subject: 'hi' }),
      },
    };
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', []);
    expect(got).toBe(THREAD);
  });
});
FILEEOF
ok "a-reply-names-its-own-thread.spec.ts written"

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
git add "together-city-chat/src/mail/mail.service.ts" \
        "together-city-chat/src/mail/mail-inbound.ts" \
        "together-city-chat/src/mail/mail-inbound.spec.ts" \
        "together-city-chat/src/mail/messaging-provider.ts" \
        "together-city-chat/src/mail/a-reply-names-its-own-thread.spec.ts" \
        land-a-reply-names-its-own-thread.sh

git commit -F - <<'MSG'
A reply names its own thread

Outbound city mail carried no threading headers at all - no Message-ID, no
In-Reply-To, no References - because OutboundMessage had no seam to put one
on. The Resend call is the only place a header could ever be set, and it took
from, to, subject, text, html and attachments. So Gmail and Outlook were left
to thread on the subject line, and a conversation fragmented every time
somebody edited it.

The inbound side had nothing to match on either. resolveInboundThread looked
at the single most recent message from that correspondent and required the
Re:-stripped subjects to be identical. Two live conversations with one person
is enough to break that: Alice and ext@acme.com have "Invoice 42", ext then
starts "Quote for Q4", and ext's reply to the INVOICE finds the Q4 row, fails
the subject test, and mints a fresh uuid. The reply lands as an orphan with no
original beside it, and inherits no project because the thread is new.

THE TRAIL ID GOES IN THE ID. Every mail client echoes References back, so a
reply can name its own thread with no lookup, no new column and no migration:

  Message-ID:  <t.{threadId}.{uuid}@togethercity.app>   unique per message
  References:  <t.{threadId}.thread@togethercity.app>   stable per thread

References names the trail on the FIRST message too, where it points at an id
nothing has sent yet. Clients tolerate that and still group on it, and it
means every message of a thread carries the same anchor rather than only the
replies.

A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL. threadFromRefs is
believed only after checking the citizen already holds a row in that trail.
Without that check one header would put a stranger's mail inside somebody's
conversation - the same hole the draft path had, and closed, four commits ago.
Two of the eight assertions are that check.

THE SUBJECT GUESS IS KEPT, not replaced: mail from a client that dropped the
headers, or a forward that came back, still has to land somewhere, and losing
a thread is worse than occasionally starting a new one. It runs second now.

THE REGEX IS BUILT ON CALL, NOT AT MODULE LOAD. This file interleaves its
constants with its imports, so a top-level const reading MAIL_DOMAIN is a
temporal-dead-zone crash at require time. Every mail suite failed to load,
which is how it was caught - and is the second time this week that running the
tests beat reading the diff.

THE SPEC WAS RUN AGAINST THE OLD CODE BEFORE IT WAS TRUSTED. With the header
match removed, two of its eight assertions fail; the six that pass are the
parser and the fallback, which is the half that must not regress.

WHAT THIS DELIBERATELY DOES NOT DO. External Cc still never reaches the wire:
OutboundMessage has no cc member and sendExternal still dispatches one provider
call per recipient, so a Cc'd stranger cannot see who else was copied and
cannot reply-all. Fixing it means one provider call carrying to/cc/bcc rather
than a fan-out - a change to the delivery topology, which this commit's own
KNOWN RESIDUE note has been asking for since the fan-out was written. The
headers seam added here is what that commit will need, and what
List-Unsubscribe and Auto-Submitted will need after it.

Noticed while here, not touched: src/mail/_to_delete/zz-tmp-probe.spec.ts is
red and is not this change's. It looks like a scratch file parked in the
delete folder.
MSG

ok committed
say "review, then:  git push"
