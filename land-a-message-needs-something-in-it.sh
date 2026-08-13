#!/usr/bin/env bash
# land-a-message-needs-something-in-it.sh  ·  run from the REPO ROOT
#
# Found by opening the live site rather than by a gate.
#
# ONE THREAD IN THIS MAILBOX HOLDS EIGHT BLANK MESSAGES. Each is a name, a
# date, and nothing — no subject line, no preview, no body. They were sent by a
# finger already on the key, because Send's whole test was
# `to.trim() && !send.isPending`. An empty recipient was refused and an empty
# MESSAGE was not, so the composer would dispatch a letter with nothing in it,
# to a real external address, without a word of warning. Eight times.
#
# THREE FIXES, ALL SMALL:
#
# 1 · Send requires something to send — body or attachment. A file with no
#     covering note IS a message; a subject alone is the slip being caught.
#     The city's CHAT composer has required a body since it was written; its
#     mail composer never did.
#
# 2 · A reply waits for its thread. The quotation is built from the trail, so
#     pressing Send in the half-second before it arrives sends a reply carrying
#     no history, with nothing on screen saying the history was missing. Same
#     race the project key had; same answer — the key is not live until the
#     fact it needs is in hand. It reads "Loading the thread…" meanwhile.
#
# 3 · An empty message renders as `(no text)` rather than as a void. Eight of
#     them already exist and cannot be un-sent; a row that is a name and a
#     blank is indistinguishable from one still loading, and from a bug.
#     collapse.test.ts asserted '' for this since it was written — that
#     assertion is updated with the reason, not deleted.
#
# ALSO CONFIRMED ON THE LIVE SITE, and worth writing down: the round trip
# works. Sent from the `together` project at 2:05 am; the Gmail reply at 2:06
# arrived in THAT PROJECT'S inbox, not merely in All Emails. That is the one
# thing no gate here can test, and it is now known rather than assumed.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling.
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A message needs something in it' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A reply carries its thread' >/dev/null; [ $? -eq 0 ] || die "run land-a-reply-carries-its-thread-2.sh first - this lands on top of it"
ok "the quotation is in, the empty send is not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/mail/(collapse\.ts|collapse\.test\.ts|pages/Compose\.tsx)$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  echo "   (The chat-audit session's files live here too - park them with"
  echo "    git stash push -u -- <paths> if you want this to land first.)"
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
verify 80fe55fb44adaba7cea799c751e329cae842d7e90843660cbb8c8039007d11f6 "$W/src/features/mail/pages/Compose.tsx"
verify 83c44c6d7e0aeebaa3f902b3b9013d61416d1f855cd672b906c62a07a4105f10 "$W/src/features/mail/collapse.ts"
verify 3fcf846c13ce5c6018e048d0bec6e99d216f1b691f971e9c1466d22e5a7a8186 "$W/src/features/mail/collapse.test.ts"

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "5 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/mail/pages/Compose.tsx \
        $W/src/features/mail/collapse.ts \
        $W/src/features/mail/collapse.test.ts \
        land-a-message-needs-something-in-it.sh

git commit -F - <<'MSG'
A message needs something in it

Found by opening the live site, which is the only place it could have been
found: every gate in this repo passed while it was happening.

ONE THREAD IN THIS MAILBOX HOLDS EIGHT BLANK MESSAGES. Each one is a name, a
date and nothing at all - no preview, no body, no indication of what it was
meant to be. They went to a real external address. Send's whole test was
`to.trim() && !send.isPending`: an empty RECIPIENT was refused and an empty
MESSAGE was not, so the composer would dispatch a letter with nothing in it,
without a word, as fast as somebody could press the key. The city's chat
composer has required a body since the day it was written. Its mail composer
never did, and nothing noticed until the thread was read.

SEND NOW REQUIRES SOMETHING TO SEND - a body or an attachment. A file with no
covering note IS a message and still goes; a subject line on its own is the
slip being caught. Nothing is warned about and then sent anyway: the key is
simply not live until there is something under it, which is the same shape as
every other disabled control in this application.

A REPLY WAITS FOR ITS THREAD. The quotation is built from the trail, so
pressing Send in the half-second before the trail arrives sends a reply
carrying no history at all, with nothing on screen to say the history was
missing. That is the same race the project key had one commit ago and it gets
the same answer - the key is not live until the fact it needs is in hand - and
it says "Loading the thread…" rather than looking broken.

AN EMPTY MESSAGE RENDERS AS `(no text)`. The eight already sent cannot be
un-sent, and a row that is a name and a blank is indistinguishable from a row
still loading and from a bug. collapse.test.ts has asserted '' for this since
it was written; that assertion is updated with the reason rather than deleted,
because '' was a considered answer once and it is worth recording why it
stopped being one.

CONFIRMED ON THE LIVE SITE WHILE LOOKING FOR THIS, and worth writing down
somewhere permanent: the round trip works. A message sent from the `together`
project at 2:05 am was replied to from Gmail at 2:06, and the reply arrived in
THAT PROJECT'S inbox rather than only in All Emails. Reply-To carried the room
in the address exactly as it was built to. That is the one claim in this whole
feature that no gate here can make.
MSG

ok committed
say "review, then:  git push"
