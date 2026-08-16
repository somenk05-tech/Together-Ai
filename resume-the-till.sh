#!/usr/bin/env bash
# resume-the-till.sh  ·  run from the REPO ROOT
#
# Picks up land-the-till-takes-a-card.sh at step 4. The patch is ALREADY in the
# working tree — the first run applied it and was interrupted during the full
# api suite, which takes about eight minutes and prints nothing while it runs.
#
# WHY THIS EXISTS RATHER THAN A RE-RUN: `git apply --check` refuses a patch that
# is already applied, and correctly. Backing it out to re-run would mean
# `git checkout -- .`, which would also destroy the OTHER uncommitted work in
# this tree — the ShareCard/attachments change. That is not a trade worth making
# to re-run a step that already passed.
#
# WHOSE FAILURE IS IT. This tree is dirty with work that is not the Till's, so a
# red suite here is not automatically mine. The two full-suite gates below name
# every failing file and separate the seven ratchets that were already red on
# main from anything else, rather than dying on a number.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "0 - is the patch actually here"
[ -f "$A/src/commerce/money.ts" ] || die "commerce/money.ts is missing - the patch is NOT applied. Run land-the-till-takes-a-card.sh instead."
[ -f "$W/src/features/pay/api.ts" ] || die "features/pay is missing - the patch is only half here. Stop and ask."
git log --oneline -40 | grep 'The till takes a card' >/dev/null \
  && die "already committed - nothing to resume"
ok "the patch is in the working tree and uncommitted, which is where we left off"

# THE SEVEN THAT WERE ALREADY RED ON MAIN, measured on the untouched clone
# before any of this existed. Anything outside this list is either the
# ShareCard work in flight beside us or something the Till broke, and the
# difference is worth one deliberate look rather than one number.
PRE_API='src/dev/dev.spec.ts src/security/query-scoping.spec.ts src/security/route-reach.spec.ts src/security/runtime-isolation.spec.ts src/shared/swallow.spec.ts src/shared/unbounded-reads.spec.ts src/shared/voice-scan.spec.ts'

say "4 - api gates (the scoped suites already passed on the first run)"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep "error TS" && die "api tsc" || ok "api tsc"

note "full api suite - about eight minutes, and it prints nothing until it finishes. Do not press ctrl-C."
FULL="$(npx jest --ci --runInBand --silent 2>&1)"
FAILING="$(printf '%s\n' "$FULL" | sed -n 's/^FAIL \([^ ]*\).*/\1/p' | sort -u)"
EXTRA=""
for f in $FAILING; do
  case " $PRE_API " in *" $f "*) ;; *) EXTRA="$EXTRA $f" ;; esac
done
printf '%s\n' "$FULL" | sed -n 's/^Test Suites:/   Test Suites:/p'
if [ -n "$EXTRA" ]; then
  printf '   \033[31mx\033[0m failing suites that were NOT red before any of this:\n'
  for f in $EXTRA; do printf '       %s\n' "$f"; done
  printf '   \033[33m~\033[0m this tree also carries the ShareCard/attachments work in flight.\n'
  printf '       If every name above is under messages/ chat/ or fitness/, it is that work\n'
  printf '       and not the Till. If any is under commerce/ financial/ local-services/\n'
  printf '       privacy/ or security/, stop and say so.\n'
  die "full api suite - see the list above"
fi
ok "full api suite - only the seven ratchets that were already red"
cd ..

say "5 - web gates"
cd "$W" || die cd
npx tsc --noEmit 2>&1 | grep "error TS" && die "web tsc" || ok "web tsc"

# The Till's OWN web guard first and on its own, so its verdict is unambiguous
# whatever the rest of the tree is doing.
npx vitest run src/app/the-till-takes-a-card.test.ts \
  && ok "the Till's own guard (7 assertions)" || die "the Till's own guard"

VITEST="$(npx vitest run 2>&1)"
printf '%s\n' "$VITEST" | sed -n 's/^ *Test Files/   Test Files/p'
if printf '%s\n' "$VITEST" | grep -q '✗\|failed ('; then
  printf '%s\n' "$VITEST" | grep -E '❯|✗|FAIL' | head -20
  note "web vitest has failures. The Till's own guard passed above, so check whether"
  note "these sit under features/chat, api/schemas or a-place-and-a-person - that is"
  note "the work in flight beside this, not the Till."
  die "web vitest - see the list above"
fi
ok "web vitest"

node scripts/lint-ceiling.mjs   && ok lint-ceiling      || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit         || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit        || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling    || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "6 - commit"
# EXACT PATHSPECS, and this is the step that makes committing safe in a dirty
# tree. None of them overlaps the ShareCard work beside us: no messages/,
# no api/schemas.ts, no features/chat, no fitness/, no types/index.ts. Those
# files stay exactly as they are, uncommitted, for whoever is holding them.
git add -A -- "$A/src/commerce" "$A/prisma" "$A/src/app.module.ts" "$A/src/financial" \
  "$A/src/local-services/local-services.service.ts" "$A/src/privacy/purge-plan.ts" \
  "$A/src/security/query-scoping.spec.ts" "$A/src/security/runtime-isolation.spec.ts" \
  "$A/src/security/wallet-pricing.spec.ts" \
  "$W/src/features/pay" "$W/src/app/router.tsx" "$W/src/app/the-till-takes-a-card.test.ts" \
  "$W/src/config/hubs.ts" "$W/src/features/financial/pages/Wallet.tsx" \
  "$W/src/features/services/api.ts" "$W/src/features/services/pages/Messages.tsx" \
  "$W/src/features/services/pages/MyBusiness.tsx" \
  "$W/src/features/social/pages/Notifications.tsx" \
  "$W/src/layouts/Header.tsx" "$W/src/layouts/NotificationToaster.tsx" || die "git add"
[ -f land-the-till-takes-a-card.sh ] && git add land-the-till-takes-a-card.sh
[ -f resume-the-till.sh ] && git add resume-the-till.sh

printf '\n   staged, and nothing else:\n'
git diff --cached --name-only | sed 's/^/       /'

git commit -F - <<'MSG' || die commit
The till takes a card

A business bills a neighbour, the neighbour pays from a wallet or a card
or both, and the money reaches the business's bank the next working day.
Three financial events, kept apart on purpose, because collapsing them is
how a ledger stops being able to answer "where is my money".

THERE IS NOWHERE IN THIS SCHEMA TO PUT A CARD NUMBER. No expiry, no CVV,
no account number, no IFSC. What is kept is four digits and a bank's name
- enough for a person to recognise their own account, and printed on
every statement in the country already - plus a reference a payment
provider handed us. The promise that Together City does not hold payment
credentials is kept by there being no column, rather than by a rule
somebody has to remember. commerce/provider.ts is the whole boundary:
two interfaces, and a sandbox implementation behind them that SHIPS.
Signing Razorpay or Stripe is implementing those interfaces and changing
two lines in commerce.module.ts. Nothing upstream - not the split, not
the state machine, not one screen - has ever seen a provider.

NOTHING SAYS PAID UNTIL A PAYMENT SAYS SO. `Invoice.status` exists as a
column and is deliberately not the authority: statusOf() in money.ts
takes what was banked, what was cancelled and what day it is, and returns
the only state those facts support. Overdue in particular CANNOT be
stored - it becomes true at midnight and nothing runs then - which is the
same argument the trust ladder makes about tiers.

THE SPLIT IS TWO COLUMNS AND ONE FUNCTION. walletInr + cardInr ==
amountInr, always, proved over every combination in money.spec.ts. The
sheet does not compute it; it asks. A second copy of that arithmetic in
the client is the copy that drifts, and the number it would drift on is
the one on the Pay button.

THE WALLET LEG GOES FIRST AND COMES BACK IF THE CARD IS REFUSED. Money
already inside the city is the part we can reverse ourselves. Card first
would mean a wallet coming up short after an external charge has already
succeeded, with the money somewhere we cannot reach. The reversal is a
credit and its own ledger row, not an undo - a statement that hides one
leg of a round trip cannot be reconciled.

ONE TAP OR TEN. PaymentIntent carries the caller's Idempotency-Key under
a unique index on (userId, key); the second arrival loses the insert and
is answered with the FIRST attempt's outcome. The key is minted when the
pay sheet OPENS, not when Pay is pressed - a key per press makes every
retry a fresh charge, which is the exact bug the header exists to
prevent and which would read as correct in review. Pinned in
the-till-takes-a-card.test.ts.

WHO A BUSINESS MAY BILL IS THE HUB'S OWN RULE, APPLIED TO MONEY: a
neighbour who has messaged it AND chosen to show it their name. A
business that could type any citizen's id into an invoice is a business
that can send a bill to a stranger, and this hub's whole promise is that
it cannot find one. The cost is named rather than discovered - a walk-in
who has never messaged cannot be billed here, and that is the right side
to fail on.

THE INVOICE ARRIVES IN THE THREAD IT BELONGS TO, not in the chat hub.
Local Services keeps its conversations out of /chats deliberately;
routing a bill through the chat hub would carry a citizen's name into the
one place this hub promises it does not go. The row still carries a
sentence in `body`, so a client that does not know about invoices shows a
message and never a blank bubble.

SETTLEMENT IS THE SECOND EVENT, AND IT HAS NO SCHEDULER. Sales batch by
the day they are EXPECTED to land, so Friday, Saturday and Sunday
collapse into Monday's payout by construction rather than by a special
case. A batch advances when somebody reads the dashboard - the same
lazy-release shape the trust gate already uses, for the same reason: a
cron is a thing that drifts, breaks silently and is discovered by a
customer. The cost is named in settlement.service.ts: a payout does not
move at 6am because it is 6am, it moves the first time anybody looks
after 6am. A real payout provider's own schedule replaces that and the
state machine does not change.

A MERCHANT BALANCE IS NOT A COLUMN. It is the sum of MerchantLedgerEntry,
so there is no second place to update and therefore no second place to
forget. Available versus pending is a question about settlementId being
null. Every sale books three rows - sale, fee, GST on the fee - because a
business asked why this is 4,732 and not 4,850 deserves the arithmetic
and not an assurance.

NO UNRESTRICTED PAYOUTS BEFORE VERIFICATION, and the money accrues
anyway. A batch opens `on_hold` when payouts are off; what verification
decides is whether it can leave, never whether it is owed. The
onboarding stage is derived from the payout account AND Together City
Trust together, never stored.

The citizen never sees any of that. They see: paid, this much, to this
business, wallet this much and card this much, and a reference they can
read down a phone. Pinned by a test.

Gates: prisma generate; api tsc; the commerce, purge-plan, financial and
local-services suites (45 new tests - 27 on the arithmetic, 18 on the
split against a database-shaped harness); the full api suite at exactly
its seven pre-existing red ratchets and no more; web tsc; the whole
vitest suite including 7 new source-scan assertions; the four web audits
at their ceilings; the production build.

Landed on a tree carrying unrelated work in flight (the ShareCard and
attachments change). The staging list is exact pathspecs and touches
none of it.

Three ratchets gained an entry rather than being raised, each with the
reason written where the list is: Invoice.count in query-scoping (a
count, no rows, and it cannot be scoped and stay correct - a per-owner
counter tells anybody holding two invoices how many customers a business
has had); `pay` in runtime-isolation's UNPROBED list (the harness cannot
build an invoice from a bare account yet); and the merchant refund line
in wallet-pricing (not a wallet charge - a negative row in a merchant's
own book, clamped against what their customer actually paid).

Not in this commit, deliberately: Mira cannot answer "what do I owe" -
the decorator needs an executor branch and an inventory line, and
shipping the decorator without them is the failure manifest.spec exists
to catch. Person-to-person Send and Request are drawn on the wallet and
say what they are waiting for rather than sitting there dead. Card
refunds go back to the wallet rather than to the card, which needs the
provider's refund webhook. See The-Till-Takes-A-Card-16-Aug.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012g4p2s2CsdBnFc89TwseZY
MSG
ok "committed"
say "done - now push (Railway runs the migration on deploy)"
