#!/usr/bin/env bash
# land-a-draft-is-not-a-membership-card.sh  ·  run from the REPO ROOT
#
# SECURITY. Land this one on its own, ahead of everything else in the audit.
#
# `saveDraft` wrote the request's `threadId` verbatim, with no check that the
# writer held any message in that thread. Thread membership is this module's
# authorization boundary — `threadAttachments` and `attachmentUrl` both accept
# "the caller owns a row in this thread" as proof, and neither filters by
# folder. So a DRAFT carrying somebody else's threadId was as good as a message
# in their conversation, and a draft costs nothing to make:
#
#   POST /api/mail/draft {"threadId": "<their thread>", "to":"", "body":""}
#   GET  /api/mail/thread/<their thread>/attachments
#   GET  /api/mail/thread/<their thread>/attachments/<fileId>/url
#
# Two requests, no send, no connection with the victim, and a stranger holds a
# signed download URL for another citizen's private Drive file. The same row
# also lets `resolveThreadId` place a SENT message into that conversation.
#
# `resolveThreadId` exists to close exactly this and says so in its own doc
# comment. Both send paths route through it. This one never did.
#
# THE SPEC WAS CHECKED AGAINST THE OLD CODE. With the gate reverted, two of its
# five assertions fail; with the gate in, all five pass. It also carries its own
# harness rather than reusing mail-drafts.spec.ts's, whose `matches()` ignores
# `where.threadId` — under that harness every findFirst matches any row of the
# owner and the test would pass with or without the fix.
#
# THE MIGRATION CLEARS WHAT GOT THROUGH. A draft whose owner holds no non-draft
# row in the thread it names loses the claim and starts a fresh trail. Not one
# word of anybody's typing is touched — only the claim.
#
# Verified through the bridge: API mail suites 102 tests green, API lint at its
# 127 baseline. tsc and prisma run natively in the gates below.
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
printf '%s\n' "$LOG" | grep 'A draft is not a membership card' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A message needs something in it' >/dev/null; [ $? -eq 0 ] || die "run land-a-message-needs-something-in-it.sh first - this lands on top of it"
ok "base is here, the gate is not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) together-city-chat/(src/mail/(mail\.service\.ts|a-draft-cannot-forge-a-thread\.spec\.ts)|prisma/migrations/20260814100000_draft_thread_gate/)$'
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
verify ca734514ea0e82608a89e96e622465b5d9d9cbc13a0218c9de9063969cd03fd9 "$A/src/mail/mail.service.ts"
verify 649a8ba254f7bc495cd8edad57ffc13db89686c1e91a843810dcef1a9453167c "$A/src/mail/a-draft-cannot-forge-a-thread.spec.ts"
verify 7e1cd6d7ed744d2fa166f7a6cdf7e62b02695b58865947197f2c3bb4dfcb8f3b "$A/prisma/migrations/20260814100000_draft_thread_gate/migration.sql"

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
        $A/src/mail/a-draft-cannot-forge-a-thread.spec.ts \
        $A/prisma/migrations/20260814100000_draft_thread_gate \
        land-a-draft-is-not-a-membership-card.sh

git commit -F - <<'MSG'
A draft is not a membership card

saveDraft wrote the request's threadId verbatim, with no check that the writer
held any message in that thread.

WHY THAT IS A HOLE AND NOT A SLOPPY FIELD. Thread membership is this module's
authorization boundary. threadAttachments and attachmentUrl both accept "the
caller owns a row in this thread" as proof they belong in the conversation, and
neither filters by folder - so a draft carrying somebody else's threadId was as
good as a message in their thread. A draft costs nothing to make: no send, no
provider call, no connection with the victim.

  POST /api/mail/draft {"threadId": "<their thread>", "to": "", "body": ""}
  GET  /api/mail/thread/<their thread>/attachments
  GET  /api/mail/thread/<their thread>/attachments/<fileId>/url

Two requests and a stranger holds a signed download URL for another citizen's
private Drive file. The belt-and-braces check on the second route passes too,
because the FILE's owner genuinely is in the thread. The same forged row also
makes resolveThreadId return that thread, so a send can inject a message into
a conversation between two other people.

resolveThreadId was written to close precisely this, and says so where it
stands: "Thread membership is what gates attachment reads, so this is a
security boundary, not just tidiness." Both send paths route through it. The
draft path never did, and it is the cheaper of the two.

A THREAD THE WRITER IS NOT IN BECOMES A FRESH TRAIL, rather than an error. A
draft is unfinished work; refusing to save it would cost somebody what they had
typed over a parameter they did not choose. Nothing is lost and nothing is
announced - the claim is simply not honoured.

THE SPEC WAS RUN AGAINST THE OLD CODE BEFORE IT WAS TRUSTED. Gate reverted:
two of its five assertions fail. Gate in: all five pass. It carries its own
harness rather than reusing mail-drafts.spec.ts's, because that one's matches()
ignores where.threadId - under it every findFirst matches any row of the owner,
and this test would have passed whether or not the fix existed. A guard that
cannot fail is not a guard.

THE MIGRATION CLEARS WHAT ALREADY GOT THROUGH. A draft whose owner holds no
non-draft row in the thread it names loses the claim. That condition is the
honest one: a real reply-draft was started from a message the citizen has, so
the original sits in their own inbox or sent. A draft whose thread contains
nothing of theirs is either a forgery or a reply to something they have since
deleted, and both should start a new trail. Not a word of anybody's typing is
touched - only the claim.

Found by an audit of the whole mail surface, and independently by two of the
three reviewers, which is the only reason it is here rather than in a list of
things that might be worth checking.
MSG

ok committed
say "review, then:  git push"
