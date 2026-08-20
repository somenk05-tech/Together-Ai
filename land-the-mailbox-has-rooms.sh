#!/usr/bin/env bash
# land-the-mailbox-has-rooms.sh  ·  run from the REPO ROOT
#
# Project folders in Together City Mail.
#
# WHAT IT IS. /mail stops being a hub landing that redirects past itself and
# becomes the project cards: All Email first and inked, then one card per room.
# A room is a real mailbox — its own Inbox, Sent, Drafts, Starred and Trash,
# its own search, its own Compose — and it is drawn with the furniture Mail
# already owns.
#
# WHAT FILLS A ROOM, and it is the short list the owner asked for: you composed
# from inside it, the trail is already filed and this message inherited it, or
# you moved it in by hand. Nothing guesses. There are no sender lists, no
# domain matching and no subject scoring, so no message can land in a room
# nobody named. A new project therefore opens EMPTY and its empty state is the
# instruction.
#
# ONE ADDRESS. A project can optionally accept you+<key>@togethercity.app —
# off by default, one mailbox, never a second account. Which uncovered a real
# bug: the inbound parser scrubbed the `+` out of a local part, so
# `you+abg@togethercity.app` resolved to a handle nobody has and sub-addressed
# mail has been silently dropped for as long as the webhook has existed.
# mail-subaddress.spec.ts is that fix, and it stands whether or not projects
# exist.
#
# DELETING A PROJECT DELETES NOTHING ELSE — the filing is cleared, every
# conversation returns to All Email, and the confirmation says how many.
#
# VERIFIED THROUGH THE BRIDGE: the web app is clean on tsc, lint 0, nav-audit,
# a11y and motion all at their ceilings; the API is at its lint baseline (127)
# and the new mail spec passes with the existing mail suites. The API's TYPES
# could not be checked there — `prisma generate` needs network the bridge does
# not have — so the gates below run it first, natively, before tsc. If the
# schema and the service disagree, this script stops and nothing is committed.
#
# KNOWN RED, AND NOT MINE: src/security/route-reach.spec.ts already fails on
# main because the spend-log routes (/financial/log) have no caller in the web
# app. This commit's five new routes ARE called; the spec was re-run to confirm
# it. That failure is left alone rather than papered over here.
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
printf '%s\n' "$LOG" | grep 'The mailbox has rooms' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Both keys on the left' >/dev/null; [ $? -eq 0 ] || die "run land-both-keys-on-the-left.sh first - this lands on top of it"
ok "the composer is in, the rooms are not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-chat/(prisma/(schema\.prisma|migrations/20260814090000_mail_projects/)|src/mail/(mail\.constants|mail\.service|mail\.controller|mail-subaddress\.spec)\.ts|src/mail/dto/mail\.dto\.ts)|together-city-react/src/(index\.css|app/router\.tsx|config/hubs\.ts|layouts/Sidebar\.tsx|features/mail/(api\.ts|MoveToProject\.tsx|ProjectRail\.tsx|pages/(Folders|Projects|Compose|MessageView)\.tsx)))$'
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

say "3 - sha256 (eighteen files)"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 544bb522840097e20371f022e3a344e5edf46813f134a7082707b7193964558c "$A/prisma/schema.prisma"
verify c7a56ecb5bd8d5b0e16a601ce7ff30342ae5f76d23830f8b2b168d3b7944b41f "$A/prisma/migrations/20260814090000_mail_projects/migration.sql"
verify 52387e193bc1a46102cb726d594af949b772df38556be57a87661a812cbc71c4 "$A/src/mail/mail.constants.ts"
verify 0d07aa3fc9ea72e22765d4929fbb954d97e74b95d8db4614e2e2c2aaeecfa3ea "$A/src/mail/dto/mail.dto.ts"
verify c678fbb5549f78433aa485486c97b8c5e40182471ad55a43ab34e044222408a0 "$A/src/mail/mail.service.ts"
verify 6f63a1c855c740b96ddc6f4dc6395c54c390aa0995ebfd675082a6274efe132d "$A/src/mail/mail.controller.ts"
verify 285406c0939545db024dfda4627840d0dd683d9109f713af839904b29910c560 "$A/src/mail/mail-subaddress.spec.ts"
verify 0dde45f53e904830628a799a8bd984e7d2babab131e57ec710f247c2df6fd5bb "$W/src/features/mail/api.ts"
verify 96ec89a97dd222888dd656c5094c368c2aaeb80515ad3ee420673005caff83e4 "$W/src/features/mail/pages/Folders.tsx"
verify 5554898e49aa7f01708d9f500bb8d7b79b58d483742692608f765290e1c57d47 "$W/src/features/mail/pages/Projects.tsx"
verify bef108f2a522954555fc916de4094fe3b221641055ded7a5bff23a2e8ebde288 "$W/src/features/mail/pages/Compose.tsx"
verify 6b18ae8b048adbd72e6681f55d06b0ded093be4015eb02e6f91fb1cc751f8eef "$W/src/features/mail/pages/MessageView.tsx"
verify a415ab3d017fa0b35fb63e36189175fb8156aa247f2eccf9ef3e6abba0dfe59a "$W/src/features/mail/MoveToProject.tsx"
verify 4af66928a0dcf04ca7920b989cad85a00908c9735510feceed0ff6cb4fb11179 "$W/src/features/mail/ProjectRail.tsx"
verify 9bc625e169c559a63965afa987bda7f430a7e64091d8ac8313e20ba77c9f221d "$W/src/layouts/Sidebar.tsx"
verify b67510d5d9da246640b2ad5f7a9d4590a3da2b924ebc7f177cf58a627be554a7 "$W/src/app/router.tsx"
verify c4f738a1f7b6330ce8f698609df412adc2e0cfab988814a110894cd4522ca0c5 "$W/src/config/hubs.ts"
verify 8bb615857d191ccade97e83fa2d6d8d89074f36d9b6f39a9786d530bcef1b0fd "$W/src/index.css"

say "4 - gates: the API"
cd "$A" || die cd
# generate FIRST. The client in node_modules predates MailProject, and every
# type error the bridge reported was that and nothing else. If this schema is
# wrong, it stops here.
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
        $A/prisma/migrations/20260814090000_mail_projects \
        $A/src/mail/mail.constants.ts \
        $A/src/mail/dto/mail.dto.ts \
        $A/src/mail/mail.service.ts \
        $A/src/mail/mail.controller.ts \
        $A/src/mail/mail-subaddress.spec.ts \
        $W/src/features/mail/api.ts \
        $W/src/features/mail/pages/Folders.tsx \
        $W/src/features/mail/pages/Projects.tsx \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/features/mail/pages/MessageView.tsx \
        $W/src/features/mail/MoveToProject.tsx \
        $W/src/features/mail/ProjectRail.tsx \
        $W/src/layouts/Sidebar.tsx \
        $W/src/app/router.tsx \
        $W/src/config/hubs.ts \
        $W/src/index.css \
        land-the-mailbox-has-rooms.sh

git commit -F - <<'MSG'
The mailbox has rooms

Project folders in Together City Mail: a room inside one citizen's mailbox,
with its own Inbox, Sent, Drafts, Starred, Trash, search and Compose.

THE DOOR MOVED, AND THAT IS THE DESIGN. /mail was a hub landing - a
photograph, an Explore button, and a redirect straight past itself on every
visit after the first - so the mailbox had a front door nobody ever stood in.
It is the project cards now: All Email first and inked, because it is the
mailbox and everything else is a room in it, then one card per project. You
choose a room and THEN you are in the mail. That single screen is the whole
difference between entering the ABG mailbox and opening an ABG filter.

NOTHING GUESSES, WHICH IS THE SHORT LIST THIS COMMIT IS BUILT ON. A
conversation is in a room for exactly three reasons: you composed it from
inside the room, the trail was already filed and this message inherited it, or
you moved it in by hand. There are no sender rules, no domain matching and no
subject scoring anywhere in it - so there is no path by which a message can
arrive somewhere nobody named. A false positive is worse than an unfiled
message, and the only way to have none is to own no machinery that could
produce one.

SO A NEW PROJECT IS EMPTY, and its empty state is the instruction rather than
an apology. No back-fill, no sweep of old mail, no "we found 40 messages that
might belong here" - it fills with what you send from it and every reply that
comes back. That is a narrower promise than "projects" usually make, and it is
the one this can keep.

THE FILING IS ON THE THREAD AND THE COLUMN IS ON THE MESSAGE, which reads like
a contradiction and is not. There is no MailThread table here - a thread is a
shared threadId across rows - so the room is denormalised onto every row of a
trail, and fileThread() is the ONLY writer, moving all of them in one
statement. A join table would have put a growing IN (...) in front of the one
query a mailbox runs on every single screen. Half a conversation in one room
and half in another is the bug this shape could otherwise have, and it is the
bug a per-message move produces the first time somebody files one row of
three. It is also per-mailbox, always: a recipient's copy is never stamped
with the sender's project.

THE SCOPE IS ONE CLAUSE. list() takes ?project=<key> and adds one where; the
folder rules, the search, the cap and the thread grouping are untouched, which
is why Sent and Trash and Starred all work one room in without a second
implementation each. An unknown key is a 404 rather than an empty list -
"the ABG inbox is empty" and "there is no ABG" are different sentences and a
citizen deserves the right one.

ONE ADDRESS, AND A BUG FOUND ON THE WAY TO IT. A project can optionally accept
you+<key>@togethercity.app - off by default, and one mailbox rather than a
second account. Writing it uncovered that the inbound parser scrubbed
everything outside [a-z0-9._-] from a local part, so you+abg@togethercity.app
resolved to the handle "youabg", matched no citizen, and was dropped as having
no city recipient. Sub-addressed mail has therefore never arrived here, silently,
for as long as the webhook has existed. mail-subaddress.spec.ts is that fix and
it stands whether or not anybody ever makes a project.

DELETING A PROJECT DELETES NOTHING ELSE. The filing is cleared, every
conversation returns to All Email where it has been the whole time, and the
confirmation says how many before it does it. Archive is offered first,
because most "delete this project" impulses are really "I have finished with
this project". Fifty per citizen, counted out loud from the first one rather
than sprung at the limit.

NO NEW VISUAL LANGUAGE, and no new material. The cards are the city's .card in
the grid the districts screen uses; the project's folders ride the hub chip
rail a phone already has; the sidebar run is .side-menu under a hairline, and
Mail is the one hub whose rail carries entries that are not in config - so
hub.items keeps the same shape for all twenty-five. Every new rule in
index.css is geometry: no hex, no rgba, one named shadow.

The chip on a row is drawn in All Email and nowhere else - inside ABG every
row is ABG, and a chip that never varies says nothing - and it is a label
rather than a control, because deciding which room a conversation belongs in
is a decision about what it SAYS. Move therefore lives in the reader, where
the message can be read before it is filed.
MSG

ok committed
say "review, then:  git push"
echo
echo "   Railway applies the MailProject migration on boot; Vercel rebuilds"
echo "   the web app. Then open Mail: you land on the cards."
