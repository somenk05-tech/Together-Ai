#!/usr/bin/env bash
# land-every-room-has-its-own-rail.sh  ·  run from the REPO ROOT
#
# Each project gets a completely new side rail; every project carries an id;
# and a reply to a project's mail comes home to that project.
#
# WHY THIS IS A NEW SCRIPT RATHER THAN A -4. "A project is a folder" landed as
# 785862b3 — the -2 script ran and I read the terminal wrong, so the -3 I wrote
# on top of it correctly refused itself with "already landed". Everything -3
# was going to add is here under its own name, on top of the folders rather
# than beside them. -2 and -3 are history and scratch respectively.
#
# 1 · EVERY ROOM HAS ITS OWN RAIL. Standing inside a project the sidebar was
#     still the whole mailbox's — Compose, Sent, Drafts & Failed, Starred,
#     Trash, Drive — and every one of those links quietly left the room.
#     "Sent" is the one that mattered: it looked like the project's own and it
#     was the mailbox's, so a project's mail appeared to be missing from a
#     folder that was never showing it.
#
# 2 · EVERY PROJECT CARRIES AN ID, and the id is the same mailbox:
#     you+abg@togethercity.app. One address, one inbox, one 10 GB quota. On by
#     default now, because of (3).
#
# 3 · A REPLY COMES HOME. Mail sent from a project goes out Reply-To that id,
#     so the room travels in the ADDRESS. Thread inheritance already handled
#     the ordinary case but leans on matching an arrival to a trail by sender
#     and normalised subject — which misses exactly where it costs most.
#
# 4 · THE COMPOSER SENDS THE PROJECT KEY, NOT ITS ID, which closes a race: the
#     key is in the URL, the id needed a list that had not always loaded.
#
# Verified through the bridge: web tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling; API mail suites 97 tests green, API lint at its 127
# baseline. The API's TYPES cannot be checked here (prisma generate needs
# network the bridge lacks), so the gates below run validate → generate → tsc
# first, natively; nothing commits if the schema and the service disagree.
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
printf '%s\n' "$LOG" | grep 'Every room has its own rail' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A project is a folder' >/dev/null; [ $? -eq 0 ] || die "run land-a-project-is-a-folder-2.sh first - this lands on top of it"
ok "the folders are drawn, the rails are not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-chat/(prisma/(schema\.prisma|migrations/20260814030000_project_id_on/)|src/mail/(mail\.service\.ts|dto/mail\.dto\.ts))|together-city-react/src/(index\.css|layouts/Sidebar\.tsx|features/mail/(api\.ts|ProjectRail\.tsx|pages/(Projects|Folders|Compose)\.tsx)))$'
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

say "3 - sha256 (eleven files)"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 29b6453438af5858929ac7812c2aefa989600e8f793cc4de041234651a38168c "$A/prisma/schema.prisma"
verify 97f488deeec06584fd7b4905f4ea0442f259570e8c7d883884f80f624c2dfc43 "$A/prisma/migrations/20260814030000_project_id_on/migration.sql"
verify d6abbaa218b2ad8f908874bf56a71dac28b9ea24be5dd44b14f1b23b2fbbd1a5 "$A/src/mail/dto/mail.dto.ts"
verify be93754422805ecdcb9e7e0a929748e34ee3b966edcb4f6da04dc32215711064 "$A/src/mail/mail.service.ts"
verify 7c72e96d54a7ddfb627e0d44bad9594f9f7b0f54992d88b09dc585cc601aaafe "$W/src/features/mail/api.ts"
verify dcc94880f8a34bfde7a0276a69d22d7fdfe1453077267115d537b6ef9757bda1 "$W/src/features/mail/ProjectRail.tsx"
verify de7e06278f6e533c7ca323a568f45b004dea2b8f972166692c9ac3e7f8592efe "$W/src/features/mail/pages/Projects.tsx"
verify 7285d7ad218a1c5becdb81a12e18a4fee4cb2aad1395a3e091045e2aebbca520 "$W/src/features/mail/pages/Folders.tsx"
verify fbb643c8a3f96fae6ed8030acdec37baf31df3dea17c23f0e9460c40d5382a87 "$W/src/features/mail/pages/Compose.tsx"
verify 15cca4bd35f4b3a4ca8acf977a0ca6915dda0bb0bb6c216e361b4acc08bb0d0a "$W/src/layouts/Sidebar.tsx"
verify 6fc779d0f850e254b124e58140b7b7e236340db4a35baa7ec6a74846efacc13e "$W/src/index.css"

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

say "6 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "7 - commit"
git add $A/prisma/schema.prisma \
        $A/prisma/migrations/20260814030000_project_id_on \
        $A/src/mail/dto/mail.dto.ts \
        $A/src/mail/mail.service.ts \
        $W/src/features/mail/api.ts \
        $W/src/features/mail/ProjectRail.tsx \
        $W/src/features/mail/pages/Projects.tsx \
        $W/src/features/mail/pages/Folders.tsx \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/layouts/Sidebar.tsx \
        $W/src/index.css \
        land-every-room-has-its-own-rail.sh

git commit -F - <<'MSG'
Every room has its own rail

Each project gets a completely new side rail, every project carries an id, and
a reply to a project's mail comes home to that project.

THE SIDEBAR WAS STILL THE WHOLE MAILBOX'S, standing inside a project, and that
is the bug this commit exists for. Compose, Sent, Drafts & Failed, Starred,
Trash, Drive - every one of those links quietly left the room you were in.
"Sent" is the one that mattered: it looked like the project's Sent and it was
the mailbox's, which is the most expensive kind of wrong a navigation can be,
because nothing about it appears broken. A citizen would have found a
project's mail missing from a folder that was never showing it, and concluded
the filing had failed.

So Mail is the one hub whose rail changes with the room. Inside a project it
is that project's Inbox, Compose, Sent, Drafts & Failed, Starred and Trash -
every one scoped - under a header wearing the folder's own colour and mark,
with the way back to All Emails at its foot. Everywhere else `hub.items` is
untouched, exactly as the other twenty-four hubs declare it. Only All Emails
shows every project's mail combined, which is what it has always meant; now
the navigation says so rather than only the copy.

THE IN-PAGE CHIP RAIL GOES BACK TO BEING THE PHONE'S COPY, at 1100px - the
width `.hub-chips` uses and the width where the sidebar becomes a drawer. It
was shown at every width for exactly one commit, because the sidebar could not
yet say which room you were in. It can now.

EVERY PROJECT CARRIES AN ID, AND THE ID IS THE SAME MAILBOX.
you+abg@togethercity.app: one address, one inbox, one 10 GB quota. It grants
nothing - mail sent to it lands where mail to you@ lands - and the tag only
says which room. It is ON now rather than offered, and the next paragraph is
why.

A REPLY TO A PROJECT'S MAIL COMES HOME TO THE PROJECT, and Reply-To is what
makes that true rather than likely. Mail sent from a project goes out
Reply-To its id, so the room travels in the ADDRESS. Thread inheritance
already handled the ordinary case, but it leans on matching an arrival to a
trail by sender and normalised subject, and that misses exactly where it costs
most: a recipient who rewrites the subject, replies from a client that drops
the thread, or forwards it to a colleague who writes back cold. From stays the
plain city address because that is the DKIM-aligned one and the note above it
says so; Reply-To was the lever, and it was sitting unused pointing at the
same address it came from.

The existing projects are switched on by the migration. That moves no mail: it
only lets a future arrival name a room.

THE COMPOSER SENDS THE PROJECT KEY, NOT ITS ID, which removes a race rather
than saving a character. The key is in the URL and is known the instant
Compose mounts; the id had to be found in the project list, so somebody who
opened Compose from a project, typed fast and pressed Send before that list
resolved sent an UNFILED message from inside a project - with nothing on
screen to say so. The server resolves keys already, and resolveSendProject now
returns the row rather than an id because the Reply-To needs the key too. The
label above the composer reads off the URL for the same reason: it is right
from the first paint instead of a moment later.
MSG

ok committed
say "review, then:  git push"
echo
echo "   Railway applies both migrations on boot; Vercel rebuilds the web app."
echo "   Then: open a project, Compose from ITS rail, send to an outside address,"
echo "   and check the reply lands in that project rather than in All Emails."
