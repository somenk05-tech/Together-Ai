#!/usr/bin/env bash
# land-a-reply-happens-in-the-thread.sh  ·  run from the REPO ROOT
#
# The mail hub against Gmail, where the citizen was actually comparing it
# (screenshots, 14 Aug, a thread of twelve blank "You (no text)" rows and a
# reply that left the page). Three fixes, two packages, one argument:
#
# A REPLY HAPPENS IN THE THREAD. Reply navigated to the Compose page — a
# different screen, the conversation gone from behind it, for what is nearly
# always a few sentences. Every mail client answers at the foot of the thread.
# MessageView now carries the reply box itself: recipient shown, quoted trail
# behind the ··· control exactly as Compose draws it, joined at send, and the
# thread refetches in place so the reply appears above the box that wrote it.
# The full composer is one press away for Cc, Bcc and attachments, offered
# BESIDE the box before there is anything typed to lose to the navigation.
#
# ONE MESSAGE CAN LEAVE A CONVERSATION. The twelve blank messages were
# undeletable without taking the whole thread: the page's only bin acts on the
# thread's opening message. Each trail message now carries its own bin — move
# to Trash, never destroy (hidden in Trash where the same press would be
# permanent, and on single messages where the page's Delete is the same act).
#
# A MESSAGE NEEDS SOMETHING IN IT — NOW SAID BY THE SERVER. The web composer
# stopped offering Send on an empty box, but the rule lived in one client and
# the blank dozen arrived through the public door. send() now refuses a body
# with no words and no files, in the composer's own words. Checked against the
# old code: with the guard removed, the new spec's first two cases fail.
#
# FILES ARRIVED VIA THE COWORK BRIDGE and were verified there: web tsc clean,
# lint 0, a11y 0, nav-audit clean, motion at ceiling, source-guards green via
# the node shim (vitest cannot run in the bridge VM); api tsc clean, all 15
# mail suites green (150 tests). This script re-verifies the files by sha256,
# then runs the real gates on the Mac.
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
# Captured first: `git log | grep -q` exits early, git dies on SIGPIPE, and
# under pipefail the pipeline reports THAT. Every land script here does this.
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'A reply happens in the thread' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - scope"
# Only the four files this change wrote may be dirty inside the two packages.
# Anything else is somebody else's work in flight; do not force past this.
STRAY="$(git status --porcelain -- "$W/src/" "$A/src/" \
  | grep -Ev '(src/features/mail/pages/MessageView\.tsx|src/app/a-reply-happens-in-the-thread\.test\.ts|src/mail/mail\.service\.ts|src/mail/a-message-needs-something-in-it\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m the packages carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the packages carry only this change, or nothing"

say "3 - sha256"
# The tree must be byte-identical to what was verified through the bridge. If
# a file moved on after these hashes were taken, stop rather than commit
# something unreviewed.
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/mail/pages/MessageView.tsx"            b1d85370285e3d6140d902e34166b1f8f63279424ba0c86d308329a5ac40c3ea
check "$W/src/app/a-reply-happens-in-the-thread.test.ts"      9a2ef9679298c6a2ea97beaeaae6b0122bdcc3534d26c6967d7c4dcb9bc364e6
check "$A/src/mail/mail.service.ts"                           feccc3e50858713360b47e55f39a76e15758f3e3addbbd9c2606cec4fd847f4a
check "$A/src/mail/a-message-needs-something-in-it.spec.ts"   52d993b6f254bd000c7fcea83681a3d133bb7b047f3119150fec77348c6d5787

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

say "6 - commit"
git add "$W/src/features/mail/pages/MessageView.tsx" \
        "$W/src/app/a-reply-happens-in-the-thread.test.ts" \
        "$A/src/mail/mail.service.ts" \
        "$A/src/mail/a-message-needs-something-in-it.spec.ts" \
        land-a-reply-happens-in-the-thread.sh

git commit -F - <<'MSG'
A reply happens in the thread

The mail hub against Gmail, where the citizen was actually comparing it: a
thread of twelve blank "You (no text)" rows, and a Reply key that left the
page. Three fixes, one argument - the thread is the room a conversation
happens in, and answering, cleaning and refusing nonsense all belong to it.

THE REPLY BOX LIVES AT THE FOOT OF THE THREAD. Reply navigated to the Compose
page - a different screen, the conversation gone from behind it, for what is
nearly always a few sentences. Every mail client answers in place; now this
does too. The box shows who it answers, requires something in it, holds the
quoted trail behind the same ... control Compose uses, joins the quote at
send, and stays on the page: the reply appears in the trail above the box
that wrote it, because the mail queries invalidate and the thread refetches.
Both Reply keys open it; focus lands in the box, and focusing scrolls it into
view without any motion.

What it deliberately does not carry: Cc, Bcc, attachments, a subject field. A
reply's subject is the thread's subject, and the moment somebody needs the
rest they need the full composer - one press away, recipient, subject, thread
and project all pre-filled, offered BESIDE the box from the start because
words typed in the thread cannot follow it through the URL.

ONE MESSAGE CAN LEAVE A CONVERSATION. The blank dozen were undeletable except
by deleting the thread: the page's bin acts on the opening message. Every
trail message now carries its own bin, sibling to the fold toggle rather than
nested in it (a button inside a role="button" is markup the browser repairs by
pulling one out of the other). It MOVES to Trash, never destroys - hidden on
rows already in Trash, where the same press would be permanent, and on
single-message trails, where the page's own Delete is the same act.

A MESSAGE NEEDS SOMETHING IN IT - NOW SAID WHERE THE ROW IS WRITTEN. The web
composer stopped offering Send on an empty box; the rule lived in one client
while the door stayed public, and the mobile app and every future caller walk
through the same door. send() now refuses a body with no words and no files,
in the composer's own words. An attachment counts: a file with no covering
note is a message. A subject alone is not - that is the slip this catches.

The new spec was checked against the old code: with the guard removed, its
first two cases fail because fanOut runs and the blank message goes. The new
web guard reads the source as text, like the rest of src/app, and pins the
decisions: the box exists, the quote goes out, nothing empty sends, the bin
moves rather than destroys.

Verified through the Cowork bridge before landing: web tsc clean, lint 0,
a11y 0, nav-audit clean, motion at ceiling, source-guards green under the
node shim; api tsc clean, 15 mail suites, 150 tests. This script re-verified
the files by sha256 and ran the real gates.

STILL OPEN in the hub, named so it is not mistaken for done: a draft resumed
from Drafts still loses its attachments and its Bcc (saveDraft's schema does
not carry them); external Cc still fans out as separate sends rather than one
provider call carrying to/cc/bcc; there is no forward and no reply-all key;
and the blank rows already in the mailbox are now deletable but not deleted -
that is the citizen's call, one bin each.
MSG

ok committed
say "review, then:  git push"
