#!/usr/bin/env bash
# land-one-message-is-one-message.sh  ·  run from the REPO ROOT
#
# Audit findings 2, 3 and 4 — everything about sending to more than one person,
# and about the copy lists. One commit because they are all the same two
# functions.
#
#  1 · ONE THREAD FOR THE WHOLE MESSAGE. sendOne resolved the thread once per
#      RECIPIENT, and for a new message dto.threadId is undefined — so three
#      recipients got three unrelated conversations. Attachments link to a
#      thread and attachedId is one column, so the last recipient's trail won
#      and the sender's own Sent copy showed files that 404. Replies arrived in
#      a trail the sender's copy was not in.
#
#  2 · ONE SENT ROW. `keepSentCopy` has been in sendExternal's parameter type
#      since fanOut was written and was never read, so one external message
#      with two Cc's wrote THREE rows to Sent and charged the 10 GB quota three
#      times.
#
#  3 · THE COPY LISTS ARE RETURNED. shape() never emitted ccAddrs or bccAddrs.
#      The columns were written on every send, the client declared both, and
#      MessageView rendered both behind a truthiness check — rows there, UI
#      there, the field in between missing.
#
#  4 · RETRY CARRIES THEM. It rebuilt a send without Cc or Bcc, so a message
#      that succeeded on the second attempt reached fewer people than the one
#      that failed on the first.
#
#  5 · A SELF-CC IS NOT A SECOND COPY. Cc'ing yourself alongside somebody else
#      enqueued a pass that wrote nothing at all and still reported the address
#      as delivered.
#
#  6 · REFUSED ADDRESSES ARE SHOWN. send() throws only when EVERY recipient is
#      refused; otherwise it returns 200 with a `failed` list the composer
#      never read. Five recipients, two rejected, page closes, nobody told.
#      The composer now stays put and names them.
#
# WHAT THIS DOES NOT FIX, said plainly: Cc still does not reach EXTERNAL
# recipients as Cc. Passing a cc list to the provider makes the provider
# deliver to it, which would double-send everyone the fan-out already reaches —
# so fixing it properly means one provider call carrying to/cc/bcc instead of a
# fan-out. That is a change to the delivery topology and gets its own commit.
# Until then, an external Cc behaves as a Bcc, and the recipient cannot
# reply-all. Related residue in sendExternal: if the FIRST recipient is refused
# and a later one accepted, the Sent row is filed under Failed. Both are
# commented where they live.
#
# THE SPEC WAS RUN AGAINST THE OLD CODE: 4 of its 8 assertions fail without
# these changes. The four that pass either way cover the internal path, which
# was already correct — the external N-rows bug needs a provider stub this
# harness does not have, so item 2 is fixed and commented but not pinned.
#
# Verified through the bridge: API mail suites 110 green, API lint at its 127
# baseline, web tsc clean, lint 0, a11y 0, nav-audit clean, motion at ceiling.
set -uo pipefail
A=together-city-chat
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'One message is one message' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A draft is not a membership card' >/dev/null; [ $? -eq 0 ] || die "run land-a-draft-is-not-a-membership-card.sh first - the security fix lands ahead of this"
ok "the gate is in, the fan-out is not fixed"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-chat/src/mail/(mail\.service\.ts|one-message-one-thread\.spec\.ts)|together-city-react/src/(index\.css|features/mail/(api\.ts|pages/Compose\.tsx)))$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi
TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  printf '   \033[31mx\033[0m Tracked files outside the packages have uncommitted changes:\n'
  echo "$TRACKED_ELSEWHERE"
  exit 1
fi
ok "packages carry only this change"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 5e0b81514906e4500007ec6d51d6932db8016be081a64bd80af8146e440a5ea2 "$A/src/mail/mail.service.ts"
verify dcfcdc20a86127ade3a4c30bad850233a931f48701f2864e24daf7f960ca7063 "$A/src/mail/one-message-one-thread.spec.ts"
verify bc6f2b661a334e9ad7bb38172a33436c4786a7db18a8fd5bb70a23cdecc88ac8 "$W/src/features/mail/api.ts"
verify 386fe53af0478ac2b942f7f7d9d2a0a82bf2ed89d4b8063159a6b51d7db3e023 "$W/src/features/mail/pages/Compose.tsx"
verify d84191f2b87afe9c1abf2aa3a51c1a045997a18f83446506d18694bd604171d7 "$W/src/index.css"

say "4 - gates: the API"
cd "$A" || die cd
npx prisma validate            && ok "prisma validate" || die "prisma validate"
npx prisma generate            && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit               && ok "api tsc"         || die "api tsc"
npx jest src/mail --silent     && ok "api jest (mail)" || die "api jest (mail)"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (main: $API_BASELINE)"
npm run build                  && ok "api build"       || die "api build"
cd ..

say "5 - gates: the web app"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build
cd ..

say "6 - commit"
git add $A/src/mail/mail.service.ts \
        $A/src/mail/one-message-one-thread.spec.ts \
        $W/src/features/mail/api.ts \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/index.css \
        land-one-message-is-one-message.sh

git commit -F - <<'MSG'
One message is one message

However many people it goes to. Audit findings 2, 3 and 4, in one commit
because they are all the same two functions.

ONE THREAD FOR THE WHOLE SEND. fanOut calls sendOne once per address, and
sendOne resolved the thread itself — so for a NEW message, where dto.threadId
is undefined, every recipient got a fresh uuid. One press of Send, three
recipients, three unrelated conversations. Not cosmetic: attachments are
linked to a THREAD and attachedId is one column, so the last recipient's trail
won and the sender's own Sent copy showed a message whose files 404; and a
reply came back into a trail the sender's copy was not in, with no original
beside it. The room is resolved once for the same reason — resolving it per
recipient also read threadProject before the first row existed, which made the
answer depend on write order.

ONE SENT ROW. keepSentCopy has sat in sendExternal's parameter type since
fanOut was written and was never read there, so the internal path kept one
copy per message and this one kept one per recipient. A single external
message with two people Cc'd wrote THREE rows to Sent and charged the 10 GB
quota three times — and if the third was refused, the citizen was looking at
two Sent rows and one Failed row for one message they wrote once.

THE COPY LISTS ARE RETURNED. shape() never emitted ccAddrs or bccAddrs. The
columns have been written on every send since Cc shipped, the client declares
both on MailItem, and MessageView renders both behind a truthiness check — so
the rows were there, the UI was there, and the field in between was missing.
Safe to emit: bccAddrs is only ever written to the sender's own Sent row, and
every read is already scoped to ownerId.

RETRY CARRIES THEM TOO. It rebuilt the message from recipient, subject, body,
thread and files, and dropped the copy lists — so a message that succeeded on
the second attempt reached fewer people than the one that failed on the first,
silently.

A SELF-CC IS NOT A SECOND COPY. Cc'ing your own address alongside somebody
else enqueued a pass that wrote NOTHING — no Sent row, that was the first
pass's job; no inbox row, the internal path skips it when the recipient is the
sender — and still reported the address as delivered. Writing to yourself
alone still works: you are then the first recipient and the Sent copy IS the
message.

REFUSED ADDRESSES ARE SHOWN. send() throws only when EVERY recipient is
refused; otherwise it returns 200 with a `failed` list, and the composer never
read it. A message to five people where two were rejected closed the page and
navigated to Sent. The composer stays put now and names them, next to the
field they were typed into — putting that in a toast on the next screen is the
same silence with an animation on it. The response is also an object now: it
used to spread an array into an object literal, so the body was
{0:…, 1:…, delivered, failed} while the client typed it as MailItem[].

WHAT THIS DOES NOT FIX, because it is a different change. Cc still does not
reach EXTERNAL recipients as Cc: passing a cc list to the provider makes the
provider deliver to it, which would double-send everyone the fan-out already
reaches, so the real repair is one provider call carrying to/cc/bcc instead of
a fan-out — a change to the delivery topology, with its own commit. Until
then an external Cc behaves as a Bcc and nobody can reply-all. Related residue:
if the FIRST recipient is refused and a later one accepted, the row is filed
under Failed though the message did reach somebody. Both are commented where
they live rather than left to be rediscovered.

THE SPEC WAS RUN AGAINST THE OLD CODE. Four of its eight assertions fail
without these changes. The four that pass either way cover the internal path,
which was already right; the external N-rows bug needs a provider stub this
harness does not have, so that one is fixed and commented but not pinned, and
saying so is better than implying coverage that is not there.
MSG

ok committed
say "review, then:  git push"
