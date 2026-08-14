#!/usr/bin/env bash
# land-the-webhook-is-not-a-citizen.sh  ·  run from the REPO ROOT
#
# SECURITY. Land this one early; it is reachable by anyone on the internet.
#
# Three things were true of ingestInbound at once.
#
# 1 · `fromAddr` was written straight off the wire, and nothing checked what it
# claimed to be. Mail between citizens never leaves the building — sendOne
# writes both rows itself — so an inbound message whose From is a city address
# did not come from that citizen. It came from whoever handed it to the provider.
#
#   From: "The Mayor" <mayor@togethercity.app>
#   To:   victim@togethercity.app
#
# The provider accepts it for the verified domain and fires the webhook with its
# own valid secret. The row landed in the victim's inbox and rendered as
# ordinary internal mail — and resolveInboundThread matches on fromAddr and
# subject, so a forgery spliced itself into a real conversation and inherited
# that thread's project. It also walked past the only anti-abuse control in the
# module, the connection check, because it never touched the authenticated API.
#
# 2 · providerMessageId was written and never read back, and the column carries
# no constraint. Every provider retry put another copy of the same email in the
# same inbox, in the same thread, charging the quota again.
#
# 3 · The delivery loop had no catch, so one failed write escaped the method,
# Nest answered 500, and the provider re-sent the whole payload — to the
# mailboxes that had already taken it.
#
# And the recipient list had no ceiling: one email naming a thousand handles was
# a thousand network body-fetches and a thousand whole-mailbox scans, inline, in
# one request.
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
printf '%s\n' "$LOG" | grep 'The webhook is not a citizen' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Sent is written by whoever arrives' >/dev/null
[ $? -eq 0 ] || die "base commit 'Sent is written by whoever arrives' is not here - this lands on top of it"
ok "base is here, the fix is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "together-city-chat/src/mail/" \
  | grep -Ev '(together-city-chat/src/mail/mail\.service\.ts|together-city-chat/src/mail/the-webhook-is-not-a-citizen\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m the touched folders carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched folders carry only this change, or nothing"

say "3 - edits"
python3 - . <<'EDITSEOF' || die "edits did not apply"
import io, sys, os
A = sys.argv[1] if len(sys.argv) > 1 else '.'
p = os.path.join(A, 'together-city-chat/src/mail/mail.service.ts')
s = io.open(p, encoding='utf-8').read()
applied = skipped = 0


def rep(old, new):
    global s, applied, skipped
    n = s.count(old)
    if n == 1:
        s = s.replace(old, new); applied += 1; return
    if n == 0 and s.count(new) == 1:
        skipped += 1; return
    sys.stderr.write("   anchor matched %d times and its result %d times, wanted 1 of one:\n   %r\n"
                     % (n, s.count(new), old[:120]))
    sys.exit(1)


# 1 · the ceiling, beside the others this file already keeps
rep("""const SHARE_LINK_TTL_SEC = 7 * 24 * 3600;            // 7 days (S3/R2 maximum)""",
    """const SHARE_LINK_TTL_SEC = 7 * 24 * 3600;            // 7 days (S3/R2 maximum)
/**
 * How many city mailboxes ONE arriving email may be delivered to.
 *
 * The webhook is reachable by anyone who can get a message through the
 * provider's MX, and the loop below does a body fetch over the network and a
 * whole-mailbox scan PER RECIPIENT, inline, in the request. A single email
 * addressed to a thousand handles was a thousand of each, in one handler.
 * Fifty is far above any real To line and far below a useful lever.
 */
const MAX_INBOUND_RECIPIENTS = 50;""")

# 2 · isCityAddress comes into the mail service
rep("""  MAIL_DOMAIN, CITY_DOMAINS, QUOTA_BYTES, addressFor, handleFromAddress, cityRecipient, subAddressed, snippetOf, sizeOf, welcomeMail, humanBytes,
} from './mail.constants';""",
    """  MAIL_DOMAIN, CITY_DOMAINS, QUOTA_BYTES, addressFor, handleFromAddress, cityRecipient, subAddressed, snippetOf, sizeOf, welcomeMail, humanBytes, isCityAddress,
} from './mail.constants';""")

# 3 · the spoof gate
rep("""    // The reply is addressed to one or more city handles; deliver a copy to each
    // matching citizen. An address we don't recognise is ignored — it was never
    // ours to receive. handleFromAddress returns null for any domain outside
    // CITY_DOMAINS, so a stranger's address cannot name a mailbox here.""",
    """    /**
     * NOTHING THAT ARRIVES HERE MAY WEAR A CITIZEN'S NAME.
     *
     * `fromAddr` was written straight off the wire, and nothing checked what
     * it claimed to be. Mail between citizens never leaves the building —
     * `sendOne` writes both rows itself — so an inbound message whose From is
     * a city address did not come from that citizen. It came from whoever
     * handed it to the provider.
     *
     *   From: "The Mayor" <mayor@togethercity.app>
     *   To:   victim@togethercity.app
     *
     * The provider accepts it for the verified domain and fires this webhook
     * with its own valid secret. Before this gate the row landed in the
     * victim's inbox and rendered as ordinary internal mail — and worse,
     * `resolveInboundThread` matches on fromAddr and subject, so a forgery
     * spliced itself into a real conversation and inherited that thread's
     * project.
     *
     * It also walked past the only anti-abuse control this module has, the
     * connection check on the send path, because it never touched the
     * authenticated API at all.
     *
     * The rule needs no verdict header and no provider-specific field, which
     * is why it is this and not a DKIM check: internal mail has no reason to
     * arrive here, so a city From is either forged or a loop, and both should
     * be refused. (A DKIM/SPF verdict on top would let us mark ordinary
     * external mail as unverified; that needs the payload shape confirmed
     * against a live webhook and is not guessed at here.)
     */
    if (isCityAddress(mail.from.addr)) {
      this.logger.warn(`inbound mail REFUSED: From claims the city address ${mail.from.addr}`);
      return { ok: false, reason: 'from-is-a-city-address' };
    }

    // The reply is addressed to one or more city handles; deliver a copy to each
    // matching citizen. An address we don't recognise is ignored — it was never
    // ours to receive. handleFromAddress returns null for any domain outside
    // CITY_DOMAINS, so a stranger's address cannot name a mailbox here.""")

# 4 · cap the fan-out, out loud
rep("""    const handles = [...byHandle.keys()];
    if (!handles.length) {""",
    """    const allHandles = [...byHandle.keys()];
    const handles = allHandles.slice(0, MAX_INBOUND_RECIPIENTS);
    if (allHandles.length > handles.length) {
      // Said out loud rather than truncated quietly: a silent cap reads as
      // "everybody got it" to whoever is reading the logs afterwards.
      this.logger.warn(
        `inbound mail: ${allHandles.length} city recipients, delivering to the first ${MAX_INBOUND_RECIPIENTS}`,
      );
    }
    if (!handles.length) {""")

# 5 · idempotency, and one recipient's failure kept to itself
rep("""    let delivered = 0;
    for (const handle of handles) {
      const user = await this.prisma.user.findUnique({ where: { handle }, select: { id: true, name: true, deletedAt: true } });
      // A deleted account keeps its row so other citizens' conversations survive
      // (see User.deletedAt). It must not keep receiving mail.
      if (!user || user.deletedAt) continue;
      await this.ensureAccount(user.id);""",
    """    let delivered = 0;
    /**
     * ONE FAILURE MUST NOT RE-DELIVER TO EVERYBODY ELSE.
     *
     * The loop had no catch, so a write that threw halfway escaped the method,
     * Nest answered 500, and the provider re-sent the identical payload — to
     * the mailboxes that had already taken it. Each recipient is now its own
     * attempt, and the ones that worked are not undone by the one that did
     * not. `errors` is reported so a partial delivery is legible rather than
     * inferred from a count.
     */
    let errors = 0;
    for (const handle of handles) {
     try {
      const user = await this.prisma.user.findUnique({ where: { handle }, select: { id: true, name: true, deletedAt: true } });
      // A deleted account keeps its row so other citizens' conversations survive
      // (see User.deletedAt). It must not keep receiving mail.
      if (!user || user.deletedAt) continue;
      await this.ensureAccount(user.id);

      /**
       * A PROVIDER RETRY IS NOT A SECOND EMAIL.
       *
       * providerMessageId was written and never read back, and the column
       * carries no constraint — so every redelivery (a timeout on our side, a
       * partial failure, an at-least-once guarantee doing its job) put another
       * copy of the same message in the same inbox, in the same thread,
       * charging the quota again. Scoped per mailbox because the id is unique
       * to the message, not to the delivery.
       */
      if (mail.providerMessageId) {
        const already = await this.prisma.mailMessage.findFirst({
          where: { ownerId: user.id, providerMessageId: mail.providerMessageId },
          select: { id: true },
        });
        if (already) continue;
      }""")

rep("""          ...(mail.providerMessageId ? { providerMessageId: mail.providerMessageId } : {}),
        },
      });
      delivered++;
    }
    return { ok: true, delivered };
  }""",
    """          ...(mail.providerMessageId ? { providerMessageId: mail.providerMessageId } : {}),
        },
      });
      delivered++;
     } catch (e) {
      errors++;
      this.logger.error(`inbound mail: delivery to ${handle} failed - ${(e as Error).message}`);
     }
    }
    return { ok: true, delivered, ...(errors ? { errors } : {}) };
  }""")

io.open(p, 'w', encoding='utf-8').write(s)
print("   %d edit(s) applied, %d already present" % (applied, skipped))
EDITSEOF
ok "edits applied"

say "4 - the-webhook-is-not-a-citizen.spec.ts"
mkdir -p "$(dirname "$A/src/mail/the-webhook-is-not-a-citizen.spec.ts")"
cat > "$A/src/mail/the-webhook-is-not-a-citizen.spec.ts" <<'FILEEOF'
import { MailService } from './mail.service';

/**
 * THE INBOUND WEBHOOK IS UNTRUSTED INPUT, AND WAS READ AS IF IT WERE NOT.
 *
 * Three separate things were true of `ingestInbound` at once:
 *
 *  1. `fromAddr` was written straight off the wire. Mail between citizens
 *     never leaves the building, so an arriving message whose From is a city
 *     address did not come from that citizen — but it rendered as internal
 *     mail, and `resolveInboundThread` matched it into a real conversation by
 *     sender and subject.
 *  2. `providerMessageId` was written and never read. Every provider retry —
 *     a timeout on our side, an at-least-once guarantee doing its job — put
 *     another copy of the same email in the same inbox.
 *  3. The delivery loop had no catch, so one failed write escaped the method,
 *     Nest answered 500, and the provider re-sent the whole payload to the
 *     mailboxes that had already taken it.
 *
 * Nothing in the mail suites reached any of it: `mail-inbound.spec.ts` tests
 * the pure parsers in `mail-inbound.ts` and never calls the service.
 *
 * CHECKED AGAINST THE OLD CODE. With the gate, the dedupe and the catch
 * reverted, the first six assertions below fail.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness(opts: { failFor?: string } = {}) {
  const rows: any[] = [];
  const warned: string[] = [];
  let seq = 0;
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        if (opts.failFor && data.toAddr.startsWith(opts.failFor)) throw new Error('write refused');
        const row = { id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), ...data };
        rows.push(row); return row;
      },
      findFirst: async ({ where }: any) => rows.find((r) =>
        (!where.ownerId || r.ownerId === where.ownerId)
        && (!where.providerMessageId || r.providerMessageId === where.providerMessageId)) ?? null,
    },
    user: {
      findUnique: async ({ where }: any) => {
        const known: any = {
          alice: { id: 'u2', name: 'Alice', deletedAt: null },
          bob: { id: 'u3', name: 'Bob', deletedAt: null },
          somen: { id: 'u1', name: 'Somen', deletedAt: null },
        };
        // Sixty mailboxes for the cap test: h0 … h59.
        if (/^h\d+$/.test(where.handle)) return { id: `x${where.handle}`, name: where.handle, deletedAt: null };
        return known[where.handle] ?? null;
      },
    },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: (m: string) => warned.push(m), error: (m: string) => warned.push(m), log: () => undefined };
  svc.ensureAccount = async () => ({ address: 'x@togethercity.app' });
  svc.inboundBody = async () => 'the body';
  svc.usedBytes = async () => 0;
  svc.resolveInboundThread = async () => 'thread-1';
  svc.threadProject = async () => null;
  svc.subAddressProject = async () => null;
  svc.fileWholeThread = async () => undefined;
  return { svc, rows, warned };
}

const payload = (over: any = {}) => ({
  type: 'email.received',
  data: {
    to: ['alice@togethercity.app'],
    from: 'Someone <someone@example.com>',
    subject: 'hello',
    text: 'hi',
    message_id: '<abc@example.com>',
    ...over,
  },
});

describe('an arriving message may not claim to be from a citizen', () => {
  it('refuses a From on the city domain and writes nothing', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload({ from: '"The Mayor" <mayor@togethercity.app>' }));
    expect(res).toEqual({ ok: false, reason: 'from-is-a-city-address' });
    expect(rows).toHaveLength(0);
  });

  it('refuses a From on a legacy city domain too', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload({ from: 'old@togethercity.tech' }));
    expect(res.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('says so in the log rather than dropping it quietly', async () => {
    const { svc, warned } = harness();
    await svc.ingestInbound(payload({ from: 'mayor@togethercity.app' }));
    expect(warned.join(' ')).toContain('mayor@togethercity.app');
  });

  it('still delivers ordinary external mail', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload());
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(1);
    expect(rows[0].fromAddr).toBe('someone@example.com');
  });
});

describe('a provider retry is not a second email', () => {
  it('delivers once however often the same message id arrives', async () => {
    const { svc, rows } = harness();
    await svc.ingestInbound(payload());
    const again = await svc.ingestInbound(payload());
    expect(rows).toHaveLength(1);
    expect(again.delivered).toBe(0);
  });

  it('still delivers a genuinely different message from the same sender', async () => {
    const { svc, rows } = harness();
    await svc.ingestInbound(payload());
    await svc.ingestInbound(payload({ message_id: '<def@example.com>', subject: 'another' }));
    expect(rows).toHaveLength(2);
  });
});

describe('one mailbox failing does not undo the others', () => {
  it('keeps the deliveries that worked and reports the one that did not', async () => {
    const { svc, rows } = harness({ failFor: 'bob@' });
    const res = await svc.ingestInbound(payload({
      to: ['alice@togethercity.app', 'bob@togethercity.app'],
    }));
    // Before the catch this threw, Nest answered 500, and the provider re-sent
    // the payload to Alice — who already had it.
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(1);
    expect(res.errors).toBe(1);
    expect(rows.map((r) => r.ownerId)).toEqual(['u2']);
  });
});

describe('one email may not address the whole city', () => {
  it('caps the fan-out and says how many it dropped', async () => {
    const { svc, rows, warned } = harness();
    const to = Array.from({ length: 60 }, (_, i) => `h${i}@togethercity.app`);
    const res = await svc.ingestInbound(payload({ to }));
    expect(res.delivered).toBe(50);
    expect(rows).toHaveLength(50);
    expect(warned.join(' ')).toContain('60 city recipients');
  });
});
FILEEOF
ok "the-webhook-is-not-a-citizen.spec.ts written"

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
        "together-city-chat/src/mail/the-webhook-is-not-a-citizen.spec.ts" \
        land-the-webhook-is-not-a-citizen.sh

git commit -F - <<'MSG'
The webhook is not a citizen

ingestInbound read an untrusted payload as if it were not one, in four ways.

NOTHING THAT ARRIVES MAY WEAR A CITIZEN'S NAME. fromAddr was written straight
off the wire and nothing checked what it claimed to be. Mail between citizens
never leaves the building - sendOne writes both rows itself - so an inbound
message whose From is a city address did not come from that citizen. It came
from whoever handed it to the provider.

  From: "The Mayor" <mayor@togethercity.app>
  To:   victim@togethercity.app

No account, no secret, no connection: an ordinary internet email through the
verified domain's MX, and the provider fires this webhook with its own valid
secret. The row landed in the victim's inbox and rendered as internal mail.
Worse, resolveInboundThread matches on fromAddr and normalised subject, so a
forgery spliced itself into an existing real conversation and inherited that
thread's project filing. It also walked past the only anti-abuse control this
module has - the connection check on the send path - because it never touched
the authenticated API at all.

The gate needs no verdict header and no provider-specific field. Internal mail
has no reason to arrive here, so a city From is either forged or a loop, and
both should be refused. A DKIM/SPF verdict on top would let us mark ordinary
external mail as unverified; that needs the payload shape confirmed against a
live webhook and is deliberately not guessed at here.

A PROVIDER RETRY IS NOT A SECOND EMAIL. providerMessageId was written and
never read back, and the column carries no constraint - so every redelivery (a
timeout on our side, a partial failure, an at-least-once guarantee doing its
job) put another copy of the same message in the same inbox, in the same
thread, charging the quota again. The check is scoped per mailbox because the
id is unique to the message, not to the delivery.

ONE FAILURE MUST NOT RE-DELIVER TO EVERYBODY ELSE. The loop had no catch, so a
write that threw halfway escaped the method, Nest answered 500, and the
provider re-sent the identical payload to the mailboxes that had already taken
it. Each recipient is now its own attempt; the ones that worked are not undone
by the one that did not, and `errors` is reported so a partial delivery is
legible rather than inferred from a count.

ONE EMAIL MAY NOT ADDRESS THE WHOLE CITY. The recipient list had no ceiling,
and the loop does a network body-fetch and a whole-mailbox scan PER RECIPIENT,
inline, in the request. Fifty is far above any real To line and far below a
useful lever. The cap is logged rather than applied quietly: a silent
truncation reads as "everybody got it" to whoever is reading the logs
afterwards.

THE SPEC WAS RUN AGAINST THE OLD CODE BEFORE IT WAS TRUSTED. With the gate,
the dedupe and the catch reverted, six of its eight assertions fail. Nothing
in the mail suites reached any of this before: mail-inbound.spec.ts tests the
pure parsers in mail-inbound.ts and never calls the service.

STILL OPEN, and named so it is not mistaken for done: there is no bounce or
complaint path and no suppression list, the shared webhook secret is still
accepted in the query string with no signature or replay defence, and an
inbound message for a citizen over quota is still dropped with a log line.
Each is its own commit.
MSG

ok committed
say "review, then:  git push"
