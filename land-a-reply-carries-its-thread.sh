#!/usr/bin/env bash
# land-a-reply-carries-its-thread.sh  ·  run from the REPO ROOT
#
# A reply quotes what it is answering — and the two holes in the rail that
# land-the-rail-belongs-to-the-room.sh was going to fix land with it, because
# both touch Compose.tsx and that script never ran. Ignore it; this replaces it.
#
# 1 · A REPLY CARRIES ITS THREAD. Replies left this city with nothing under
#     them. Inside the app that was survivable — the trail is on the screen
#     behind you — but the recipient is usually OUTSIDE it, and what landed in
#     their Gmail was a bare "yes, Tuesday works" with nothing saying what
#     Tuesday was. The quotation is written in the exact shape quoted.ts
#     already parses, and replyQuote.test.ts asserts the ROUND TRIP rather than
#     trusting two files to agree.
#
# 2 · COMPOSE LEFT THE ROOM. Pressing Compose in a project's rail goes to
#     /mail/compose?project=<key>, which does not start with /mail/p/, so the
#     sidebar reverted to the whole mailbox's mid-task. Replying from a filed
#     conversation had the same hole from the other side.
#
# 3 · "PROJECTS" WAS IN ALL EMAILS' NUMBERED RAIL as though it were one of its
#     folders. It is the door back to the wall, so it moves below the hairline
#     where the project rail already keeps its own way out. All Emails
#     renumbers 01-07.
#
# Verified through the bridge: tsc clean, lint 0 (one rules-of-hooks error was
# introduced and fixed here, not shipped), a11y 0, nav-audit clean, motion at
# ceiling; replyQuote.test.ts's 9 assertions run and pass, including both
# round trips; the new CSS carries no hex, no rgba and no box-shadow at all;
# and one-bag's contiguous-index rule was re-checked against the renumber.
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
printf '%s\n' "$LOG" | grep 'A reply carries its thread' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Every room has its own rail' >/dev/null; [ $? -eq 0 ] || die "run land-every-room-has-its-own-rail.sh first - this lands on top of it"
ok "the rails are in, the quotation is not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) together-city-react/src/(index\.css|config/hubs\.ts|layouts/Sidebar\.tsx|app/a-read-section-folds-itself\.test\.ts|features/mail/(replyQuote\.ts|replyQuote\.test\.ts|pages/(Compose|MessageView)\.tsx))$'
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

say "3 - sha256 (eight files)"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 0afdbf02d3a9bae8b91ffd11046acdd370050fc64c2bd92058e227928afb7edd "$W/src/features/mail/replyQuote.ts"
verify 2a1587d242e6455fe07ef5874cd195e3b7543a48ff4691e7bdd4c03e9383ff46 "$W/src/features/mail/replyQuote.test.ts"
verify eed4c93773f563347442f8777d987c6952abc4d15ec735bf7bf4de1e04cfb711 "$W/src/features/mail/pages/Compose.tsx"
verify 7d595ddf3e8b8c0165f5999784ef1155f17f37a5b1a05059eb8bbd37ba6a75eb "$W/src/features/mail/pages/MessageView.tsx"
verify 6236e803f4e90683cfa1cab674d30f0d44851f4aa0aa042434c562bfa02ea6ed "$W/src/app/a-read-section-folds-itself.test.ts"
verify a910c00480ea2639df061cc8bf2dcf93995b72c0b4266e3f989fc580bacecb5a "$W/src/index.css"
verify 8e5a3b20c2e2754a94c48a7bf9991472b198fdde7519096fb57fbf92ef68e531 "$W/src/layouts/Sidebar.tsx"
verify e685c6411cf3b4161de9e79e61d6ac4774eab5a0c214ab3e9a71d7283bc6b305 "$W/src/config/hubs.ts"

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
git add $W/src/features/mail/replyQuote.ts \
        $W/src/features/mail/replyQuote.test.ts \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/features/mail/pages/MessageView.tsx \
        $W/src/app/a-read-section-folds-itself.test.ts \
        $W/src/index.css \
        $W/src/layouts/Sidebar.tsx \
        $W/src/config/hubs.ts \
        land-a-reply-carries-its-thread.sh

git commit -F - <<'MSG'
A reply carries its thread

Replies left this city with nothing under them.

INSIDE THE APP THAT WAS SURVIVABLE, because the trail is on the screen behind
you. The recipient is usually OUTSIDE it, and what landed in their Gmail was a
bare "yes, Tuesday works" with nothing anywhere in the message saying what
Tuesday was. Every mail client on earth quotes what it is answering; the
absence here was not restraint, it was a message that could not be read on its
own. Worse on the second exchange, where a stranger is looking at two
unattributed sentences.

THE SHAPE IS THE ONE OUR OWN PARSER ALREADY LOOKS FOR. quoted.ts has collapsed
inbound quotations since it was written, by recognising `On <date> <person>
wrote:` followed by `>`-prefixed lines - the shape Gmail and Apple Mail send.
replyQuote.ts writes exactly that, so a reply we send and a reply we receive
collapse identically when ours comes back to us. Two files agreeing by
inspection is how they drift, so replyQuote.test.ts asserts the ROUND TRIP:
what we write, our own reader splits back apart, at one exchange and at two.

QUOTED AT SEND, NOT TYPED INTO THE BOX. Gmail puts the history inside the
editable body, which is why a four-word reply there is fifty lines tall before
you begin. quoted.ts already argues the other side of this for READING - "show
what is new, and put the rest behind one small control" - and the same
argument holds for writing. The box holds what you are writing; the quotation
sits under it behind the three dots every client uses for it, read-only,
because it is a record of what was actually sent and the place to change your
own words is the box above. The two are joined on the way out.

THE NEWEST MESSAGE IS THE ONE QUOTED. The ones before it are already inside
its own quotation - which is how every client does it, and why a thread does
not grow quadratically. A single message can still be enormous, so the quote
stops at sixty lines and SAYS it stopped: a quotation that ends without saying
so reads as the whole of what was written.

TWO HOLES IN THE RAIL RIDE ALONG, because they are in the same file and the
script that carried them alone never ran.

Compose left the room: pressing Compose in a project's own rail goes to
/mail/compose?project=<key>, and the sidebar decided which room you were in
from the PATH alone, so a URL that does not begin /mail/p/ reverted the rail
to the whole mailbox's, mid-task. The one moment somebody is most certain they
are still inside a project is the moment they got there from its own menu.
Replying from a filed conversation had the same hole from the other side, and
now carries the room in its link too - the SEND already inherited the project,
because the thread is filed, but the rail did not, and a composer whose
sidebar says All Emails while it writes into ABG is the same lie the rail
commit went to remove.

And "Projects" was sitting in All Emails' numbered rail as though it were one
of its folders. It is not: that list is the folders of the room you are
standing in, and Projects is the door back to the wall of rooms. It moves
below the hairline - where the project rail already keeps its own way out, for
the same reason - and All Emails renumbers 01-07. The two rails are the same
shape as each other now, which is the point.

Compose joins the named list in a-read-section-folds-itself.test.ts, and it is
the one genuine disclosure on that list that is deliberately not a Fold: a Fold
is a titled section of a page, and this is a three-dot control inside a form.
MSG

ok committed
say "review, then:  git push"
