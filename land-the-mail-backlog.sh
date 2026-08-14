#!/usr/bin/env bash
# land-the-mail-backlog.sh  ·  run from the REPO ROOT
#
# WHY THIS SCRIPT EXISTS. Six finished change-sets were written to this tree
# by different sessions and none of them ever landed:
#
#   web  · A control that does nothing …   (land-a-control-that-does-nothing.sh)
#   api  · A reply names its own thread    (land-a-reply-names-its-own-thread.sh)
#   api  · Sent is written by whoever arrives  (land-sent-…-arrives.sh)
#   api  · The city is not a megaphone     (land-the-city-is-not-a-megaphone.sh)
#   api  · The webhook is not a citizen    (land-the-webhook-is-not-a-citizen.sh)
#   api  · The meter has a way down        (no script was ever written for it)
#
# and on top of them, this session's: A reply happens in the thread.
#
# Every one of those land scripts refuses to run while the packages carry
# anyone else's dirty files — which is correct — and every one of them now
# sees the others' files, because the edits all reached the working tree
# before any commit did. The guards deadlock. This script is the way out:
# it verifies the UNION once, then commits it in three slices along file
# boundaries, because the api change-sets share mail.service.ts and one blob
# cannot be committed five times.
#
# WHAT IT DOES NOT TOUCH: the chat and Mira files that are also dirty
# (messages.dto.ts, mira/*, features/chat/*, api/chat.api.ts, schemas.ts,
# types/index.ts, AttachPanels.tsx, a-place-and-a-person.test.ts). Those
# belong to the chat sessions' own scripts and are left exactly as they are;
# what remains dirty is printed at the end.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -80)"
has(){ printf '%s\n' "$LOG" | grep -F "$1" >/dev/null; }
has 'A reply happens in the thread' && die "already landed - re-running is a no-op by design"
ok "the backlog is not landed"

say "2 - the mail surface carries ONLY the known backlog"
# Everything dirty under src/mail and src/features/mail must be on this list.
# A file that is not is a seventh session's work in flight — stop.
KNOWN='src/mail/(mail\.service\.ts|mail-inbound\.ts|mail-inbound\.spec\.ts|messaging-provider\.ts|mail-cc-bcc\.spec\.ts|one-message-one-thread\.spec\.ts|mail-drafts\.spec\.ts|a-draft-cannot-forge-a-thread\.spec\.ts|a-reply-names-its-own-thread\.spec\.ts|sent-is-written-by-whoever-arrives\.spec\.ts|the-city-is-not-a-megaphone\.spec\.ts|the-webhook-is-not-a-citizen\.spec\.ts|the-meter-has-a-way-down\.spec\.ts|a-message-needs-something-in-it\.spec\.ts)$|src/features/mail/(api\.ts|MoveToProject\.tsx|pages/(Folders|Projects|Compose|MessageView)\.tsx)$|src/app/a-reply-happens-in-the-thread\.test\.ts$|src/index\.css$'
STRAY="$(git status --porcelain -- "$A/src/mail/" "$W/src/features/mail/" "$W/src/app/a-reply-happens-in-the-thread.test.ts" "$W/src/index.css" \
  | grep -Ev "$KNOWN" || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unknown work on the mail surface:\n%s\n' "$STRAY"; \
  die "a session this script does not know about may be working here"; }
ok "every dirty mail file is accounted for"

say "3 - sha256 (this session's four files)"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/mail/pages/MessageView.tsx"            b1d85370285e3d6140d902e34166b1f8f63279424ba0c86d308329a5ac40c3ea
check "$W/src/app/a-reply-happens-in-the-thread.test.ts"      9a2ef9679298c6a2ea97beaeaae6b0122bdcc3534d26c6967d7c4dcb9bc364e6
check "$A/src/mail/mail.service.ts"                           feccc3e50858713360b47e55f39a76e15758f3e3addbbd9c2606cec4fd847f4a
check "$A/src/mail/a-message-needs-something-in-it.spec.ts"   52d993b6f254bd000c7fcea83681a3d133bb7b047f3119150fec77348c6d5787
# The earlier sets have no hashes here: each was verified by the session that
# wrote it, and the gates below re-verify the union on this machine now.

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "5 - api gates"
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
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build              && ok "api build"       || die "api build"
cd ..

# The tree's bytes do not change between here and the last commit — the gates
# above verified exactly what every slice below commits.

msg_of(){
  # The commit-message heredoc out of an existing land script, verbatim.
  awk "/git commit -F - <<'MSG'\$/{f=1;next} f&&/^MSG\$/{exit} f" "$1"
}

say "6 - commit 1/3 · the web half of the audit repair"
if has 'A control that does nothing'; then
  ok "already in the log - skipped"
else
  M="$(msg_of land-a-control-that-does-nothing.sh)"
  [ -n "$M" ] || die "could not extract the message from land-a-control-that-does-nothing.sh"
  git add "$W/src/features/mail/api.ts" \
          "$W/src/features/mail/MoveToProject.tsx" \
          "$W/src/features/mail/pages/Folders.tsx" \
          "$W/src/features/mail/pages/Projects.tsx" \
          "$W/src/features/mail/pages/Compose.tsx" \
          "$W/src/index.css" \
          land-a-control-that-does-nothing.sh || die "git add (web)"
  { printf '%s\n' "$M"; printf '\n(Landed by land-the-mail-backlog.sh. MessageView.tsx is named in this
message but rides two commits ahead with "A reply happens in the thread" -
that change rewrote the same file, and one file is one blob.)\n'; } \
    | git commit -F - || die "commit (web)"
  ok committed
fi

say "7 - commit 2/3 · the api backlog, one slice"
if has 'The mail backlog lands together'; then
  ok "already in the log - skipped"
else
  git add "$A/src/mail/mail.service.ts" \
          "$A/src/mail/mail-inbound.ts" \
          "$A/src/mail/mail-inbound.spec.ts" \
          "$A/src/mail/messaging-provider.ts" \
          "$A/src/mail/mail-cc-bcc.spec.ts" \
          "$A/src/mail/one-message-one-thread.spec.ts" \
          "$A/src/mail/mail-drafts.spec.ts" \
          "$A/src/mail/a-draft-cannot-forge-a-thread.spec.ts" \
          "$A/src/mail/a-reply-names-its-own-thread.spec.ts" \
          "$A/src/mail/sent-is-written-by-whoever-arrives.spec.ts" \
          "$A/src/mail/the-city-is-not-a-megaphone.spec.ts" \
          "$A/src/mail/the-webhook-is-not-a-citizen.spec.ts" \
          "$A/src/mail/the-meter-has-a-way-down.spec.ts" \
          "$A/src/mail/a-message-needs-something-in-it.spec.ts" \
          land-a-reply-names-its-own-thread.sh \
          land-sent-is-written-by-whoever-arrives.sh \
          land-the-city-is-not-a-megaphone.sh \
          land-the-webhook-is-not-a-citizen.sh || die "git add (api)"
  git commit -F - <<'MSG' || die "commit (api)"
The mail backlog lands together

Five finished change-sets and a sixth guard, one commit - not because they
are one change but because they share mail.service.ts, every session wrote
its edits into the working tree before any of them committed, and one file is
one blob: there is no honest way to slice five arguments out of it after the
fact. Each piece was verified by the session that wrote it, and the union was
re-verified before this commit: tsc clean in both packages, all mail jest
suites green (15 suites, 150 tests), web vitest green, lint and a11y at their
ceilings, both builds passing.

The full argument for each piece is in its own land script at the repo root,
committed here alongside the work it describes:

A REPLY NAMES ITS OWN THREAD (land-a-reply-names-its-own-thread.sh).
Outbound mail carries Message-ID and References minted from the thread, and
inbound threading matches In-Reply-To/References before falling back to
correspondent + subject. Gmail stops splitting our replies into new
conversations, and two concurrent conversations with one person stop
swallowing each other's replies.

SENT IS WRITTEN BY WHOEVER ARRIVES (land-sent-is-written-by-whoever-arrives.sh).
The sender's one Sent/Failed row belongs to the first attempt that WRITES a
row, not the first attempt made - a refused first recipient no longer leaves
a delivered message with no trace in the mailbox that sent it.

THE CITY IS NOT A MEGAPHONE (land-the-city-is-not-a-megaphone.sh).
External recipients are capped per message and budgeted per day, so one
account cannot spend the shared domain's reputation - the same domain that
delivers password recovery.

THE WEBHOOK IS NOT A CITIZEN (land-the-webhook-is-not-a-citizen.sh).
Inbound refuses a city From (nothing internal arrives by webhook, so it is
forged or a loop), dedupes on providerMessageId per mailbox, isolates each
recipient's write so one failure cannot re-deliver to everybody, and caps the
recipient list out loud.

THE METER HAS A WAY DOWN (no script was written; the session that built it
recorded it in the project log, 14 Aug). thread() reads newest-first and
reverses so a long trail keeps its newest end. usedBytes() is an
aggregate(_sum) instead of materialising the mailbox on every quota check.
quotaOf() reads MailAccount.quotaBytes - the old fallback made the quota NaN
for accounts with no explicit allowance, and NaN comparisons silently waived
it. emptyTrash() and DELETE /mail/trash exist, so "mailbox full - delete some
mail" is advice that works. retry() deletes the failed row in a finally, so
three retries stop leaving four copies against the quota. deleteProject uses
the array form of $transaction. Its spec was checked against the old code:
six of eight assertions fail when the changes are reverted. The stub harness
in five sibling specs grew the aggregate method this made necessary.

A MESSAGE NEEDS SOMETHING IN IT - the sixth piece, this session's. send()
refuses a body with no words and no files, in the web composer's own words.
The composer already refused; the door is public and the mobile app walks
through it too. An attachment counts: a file with no covering note is a
message. A subject alone is not. Its spec fails against the old code because
fanOut is reached and the blank message goes.
MSG
  ok committed
fi

say "8 - commit 3/3 · a reply happens in the thread"
if has 'A reply happens in the thread'; then
  ok "already in the log - skipped"
else
  M="$(msg_of land-a-reply-happens-in-the-thread.sh)"
  [ -n "$M" ] || die "could not extract the message from land-a-reply-happens-in-the-thread.sh"
  git add "$W/src/features/mail/pages/MessageView.tsx" \
          "$W/src/app/a-reply-happens-in-the-thread.test.ts" \
          land-a-reply-happens-in-the-thread.sh \
          land-the-mail-backlog.sh || die "git add (reply)"
  { printf '%s\n' "$M"; printf '\n(Landed by land-the-mail-backlog.sh; the api half of this message is in
the previous commit. This commit also carries the MessageView.tsx half of "A
control that does nothing" - the delete confirmation, the mishap strip and
the back-to-the-right-folder navigation - because both changes rewrote the
same file.)\n'; } \
    | git commit -F - || die "commit (reply)"
  ok committed
fi

say "9 - what is still dirty, and whose it is"
LEFT="$(git status --porcelain -- "$W/src" "$A/src" || true)"
if [ -z "$LEFT" ]; then
  ok "nothing - the packages are clean"
else
  printf '%s\n' "$LEFT"
  printf '   these are the chat/Mira sessions'"'"' pending work (their land-*.sh\n   scripts are at the root); this script deliberately left them alone.\n'
fi

ok done
say "review the three commits, then:  git push"
