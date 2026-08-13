#!/usr/bin/env bash
# land-the-thread-is-the-unit.sh  ·  run from the REPO ROOT
#
# Audit finding 6, with the owner's call on the open question: replying from
# inside a project files the WHOLE conversation into it, not just the reply.
#
# THE INVARIANT WAS STATED AND NOT KEPT. `MailProject` filing lives on the
# THREAD — fileThread says so and moves every row at once, and the whole
# denormalised `projectId` column depends on it. But the send path stamped only
# the row it was writing. Reply from inside ABG to a six-message conversation
# sitting in All Emails and ONE message moved: the project showed a fragment of
# a correspondence, and nothing said why.
#
# `threadProject` then had no orderBy, so once a trail carried two different
# rooms the one a later reply inherited was whatever the database returned
# first — and could differ between two identical requests.
#
# BOTH PATHS, ONE RULE. A send that names a room files the trail; an arrival
# addressed to you+abg@ files the trail. Pressing "Compose in ABG" on a
# conversation means the conversation belongs to ABG, and that is now what
# happens. Reversible from the reader with Move, as it always was.
#
# THE PRIVATE HELPER SKIPS THE PARTICIPATION CHECK ON PURPOSE: every caller has
# already established ownership of the trail (resolveThreadId for a send,
# resolveInboundThread for an arrival) and the updateMany is scoped to ownerId
# besides. The public fileThread keeps its checks, because its threadId arrives
# in a request.
#
# The new assertion was run against the old code and fails there.
#
# Verified through the bridge: API mail suites 112 green, tsc clean.
set -uo pipefail
A=together-city-chat

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] || die "run me from the repo root (no $A/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The thread is the unit' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'One message is one message' >/dev/null; [ $? -eq 0 ] || die "run land-one-message-is-one-message.sh first - this lands on top of it"
ok "the send path is fixed, the filing is not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-chat/src/mail/(mail\.service\.ts|one-message-one-thread\.spec\.ts)$'
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
verify 4ed2017e137bfb27a137b1f290d1ed2ae27da489353249bafb6a5e6316a855bd "$A/src/mail/mail.service.ts"
verify 419314710d534823a9d957cc260de1ee8e13e473d413a9103d6e76876cf53896 "$A/src/mail/one-message-one-thread.spec.ts"

say "4 - gates"
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

say "5 - commit"
git add $A/src/mail/mail.service.ts \
        $A/src/mail/one-message-one-thread.spec.ts \
        land-the-thread-is-the-unit.sh

git commit -F - <<'MSG'
The thread is the unit

Replying from inside a project files the whole conversation into it, not just
the reply. Audit finding 6, with the owner's call on the open question.

THE INVARIANT WAS STATED AND NOT KEPT. Project filing lives on the THREAD:
fileThread says so, moves every row of a trail in one statement, and the whole
denormalised projectId column rests on that being true. The send path stamped
only the row it was writing. So replying from inside ABG to a six-message
conversation sitting in All Emails moved ONE message — the project showed a
fragment of a correspondence, the other five stayed where they were, and
nothing on any screen said why.

threadProject made it worse by having no orderBy. Once a trail carried two
different rooms, the one a later reply inherited was whatever the database
handed back first, and could differ between two identical requests. It is
ordered newest-first now, which is a real answer rather than an arbitrary one.

BOTH PATHS FOLLOW ONE RULE. A send that names a room files the trail; an
arrival addressed to you+abg@ files the trail. Pressing "Compose in ABG" on a
conversation means the conversation belongs to ABG — that is what somebody is
saying when they press it, and now it is what happens. A brand-new thread has
no rows yet, so the updateMany is a no-op there and the row being created
carries the filing on its own. Nothing is one-way: Move puts a conversation
back in All Emails from the reader, as it always could.

THE PRIVATE HELPER SKIPS THE PARTICIPATION CHECK, deliberately and not by
omission. Every caller has already established that this citizen owns the
trail — resolveThreadId for a send, resolveInboundThread for an arrival — and
the updateMany is scoped to ownerId regardless. The public fileThread keeps
its checks, because its threadId comes in on a request; this one's never does.

The new assertion was run against the old code and fails there, which is the
only reason it is worth having.
MSG

ok committed
say "review, then:  git push"
