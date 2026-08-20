#!/usr/bin/env bash
# land-a-project-is-a-folder-3.sh  ·  run from the REPO ROOT
#
# The mailbox door becomes a wall of folders, and the project mailbox gets its
# folders back on a desktop.
#
# WHY THERE IS A -3, and -2 never ran. The owner read the -2 build on the live
# site and named three things it still got wrong or had not done:
#
#   · standing inside a project the SIDEBAR was still the whole mailbox's, so
#     every link left the room without saying so — "Sent" in particular looked
#     like the project's own and was the mailbox's;
#   · a message composed from inside a project could go out unfiled, because
#     the composer sent the project's id and the id needed a list that had not
#     always loaded by the time somebody pressed Send;
#   · every project should carry an id — one address, the same mailbox — and
#     replies to a project's mail should come home to that project.
#
# All three are in here. The commit message has the reasoning for each.
#
# WHY THERE WAS A -2. The first script reached the web app's vitest and stopped
# there, before the commit, so nothing landed. One test failed, and it failed
# for the right reason: a-read-section-folds-itself.test.ts keeps a NAMED list
# of every component in the app that owns an `aria-expanded={open}` of its own,
# and it says in as many words that a new entry has to argue for itself. The
# ... key on a folder is a new one.
#
# It argues, and it is better for having had to. A menu button and a fold both
# carry aria-expanded; what tells them apart is `aria-haspopup`, which neither
# the folder's ... key nor the Move key was carrying — so a screen reader
# announced both as a button that appears to do nothing. Both now say they open
# a menu, and the list entry is what the file asked for: a reason, not a count.
#
# 1 · A PROJECT IS DRAWN AS A FOLDER, to the owner's reference. Tab, mark,
#     count, name, a line saying what it is for, and a ⋯ key. A row in a list
#     is a thing you scan; a folder is a thing you open, and this screen exists
#     so somebody chooses a room BEFORE reading any mail.
#
# 2 · NINE TINTS, PICKED WHEN YOU MAKE ONE. The owner chose the coloured
#     variant, so this is the first genuinely chromatic set since the hub
#     accents — and it earns it: nine folders in a grid are told apart by hue
#     long before they are told apart by name. Every tint lives in tokens.css
#     with its contrast measured against the two inks that land on it
#     (worst case 17.85:1 for the title, 4.88:1 for the line under it).
#     The mark is INK on a white chip, not the tint: drawn in the tint it
#     measures 1.68:1 on amber, which is a picture you have to already know.
#
# 3 · THE MARK IS DERIVED FROM THE NAME, also the owner's call. Whole-word
#     matching, first rule wins, and a plain folder when nothing matches —
#     "Legal" gets a document and "ABG" gets a folder, because ABG is a name
#     and not a word. folderLook.test.ts pins that, including the failure.
#
# 4 · THE PROJECT'S OWN FOLDERS WERE INVISIBLE ON A DESKTOP — a real bug in
#     what shipped last night. They were drawn with `.hub-chips`, which every
#     hub hides at 900px because the sidebar carries the same links there. The
#     sidebar does NOT carry these: they are one project's Inbox, Sent, Drafts,
#     Starred and Trash. So on the screen most of this is read on, a project
#     had an inbox and no way to reach anything else in it. Own rail now,
#     shown at every width.
#
# 5 · A PROJECT NAME IS A NAME. The bar was inheriting `.mail-account-addr`,
#     which is monospace because an email address is read character by
#     character. A project called "together" is not.
#
# VERIFIED THROUGH THE BRIDGE: web tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling; folderLook.test.ts's 8 assertions run and pass; the new
# CSS carries no hex, no rgba and no unnamed box-shadow (relief.spec's three
# rules, checked by hand here since vitest cannot run in the bridge); the
# folder wall was rendered in a real browser and read against the reference.
# `.fold` was renamed `.mfold` before landing — layout.css has owned `.fold`
# as an accordion row since long before this, and both stylesheets are global.
#
# The API's TYPES cannot be checked in the bridge (prisma generate needs
# network it does not have), so the gates below run validate → generate → tsc
# first, natively. If the schema and the service disagree, nothing commits.
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
printf '%s\n' "$LOG" | grep 'A project is a folder' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The key is yours to type' >/dev/null; [ $? -eq 0 ] || die "run land-the-key-is-yours-to-type.sh first - this lands on top of it"
ok "the sheet is fixed, the folders are not drawn yet"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-chat/(prisma/(schema\.prisma|migrations/20260814020000_mail_project_look/|migrations/20260814030000_project_id_on/)|src/mail/(mail\.service\.ts|dto/mail\.dto\.ts))|together-city-react/src/(index\.css|styles/tokens\.css|components/ui/Icon\.tsx|app/a-read-section-folds-itself\.test\.ts|layouts/Sidebar\.tsx|features/mail/(api\.ts|folderLook\.ts|folderLook\.test\.ts|MoveToProject\.tsx|ProjectRail\.tsx|pages/(Projects|Folders|Compose)\.tsx)))$'
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
verify 29b6453438af5858929ac7812c2aefa989600e8f793cc4de041234651a38168c "$A/prisma/schema.prisma"
verify 96d94d482a2853cc03207930cf9f784c5708cb47a46a2038ae92806e0e22197a "$A/prisma/migrations/20260814020000_mail_project_look/migration.sql"
verify 97f488deeec06584fd7b4905f4ea0442f259570e8c7d883884f80f624c2dfc43 "$A/prisma/migrations/20260814030000_project_id_on/migration.sql"
verify d6abbaa218b2ad8f908874bf56a71dac28b9ea24be5dd44b14f1b23b2fbbd1a5 "$A/src/mail/dto/mail.dto.ts"
verify be93754422805ecdcb9e7e0a929748e34ee3b966edcb4f6da04dc32215711064 "$A/src/mail/mail.service.ts"
verify f2586ed55b6a7fe9d7381197cc52f56bb19d95e6fdfbcdc5a8250d5a8f0cd54b "$W/src/components/ui/Icon.tsx"
verify 81fa99b54a4c62e9539c669b808351194393b3cb9ad56b34ca22e5fd2608e685 "$W/src/features/mail/folderLook.ts"
verify 62b170218957601879e3dd183442437cfcff075b7fd915a6162cd4df13022ada "$W/src/features/mail/folderLook.test.ts"
verify 7c72e96d54a7ddfb627e0d44bad9594f9f7b0f54992d88b09dc585cc601aaafe "$W/src/features/mail/api.ts"
verify 86969d837fd1758dde71135eb0cc9290bb183d3de90c58d5322e445d76ee4551 "$W/src/features/mail/MoveToProject.tsx"
verify dcc94880f8a34bfde7a0276a69d22d7fdfe1453077267115d537b6ef9757bda1 "$W/src/features/mail/ProjectRail.tsx"
verify de7e06278f6e533c7ca323a568f45b004dea2b8f972166692c9ac3e7f8592efe "$W/src/features/mail/pages/Projects.tsx"
verify 7285d7ad218a1c5becdb81a12e18a4fee4cb2aad1395a3e091045e2aebbca520 "$W/src/features/mail/pages/Folders.tsx"
verify fbb643c8a3f96fae6ed8030acdec37baf31df3dea17c23f0e9460c40d5382a87 "$W/src/features/mail/pages/Compose.tsx"
verify 15cca4bd35f4b3a4ca8acf977a0ca6915dda0bb0bb6c216e361b4acc08bb0d0a "$W/src/layouts/Sidebar.tsx"
verify 8dd92218a504f8a285297aef5c7f2e81d11b30db3f92577676747fa0ef10e01e "$W/src/app/a-read-section-folds-itself.test.ts"
verify c2a0d81cc856f546799ce9f0d147638f96ce51c271761165901f50eaeea0bca1 "$W/src/styles/tokens.css"
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
        $A/prisma/migrations/20260814020000_mail_project_look \
        $A/prisma/migrations/20260814030000_project_id_on \
        $A/src/mail/dto/mail.dto.ts \
        $A/src/mail/mail.service.ts \
        $W/src/components/ui/Icon.tsx \
        $W/src/features/mail/folderLook.ts \
        $W/src/features/mail/folderLook.test.ts \
        $W/src/features/mail/api.ts \
        $W/src/features/mail/pages/Projects.tsx \
        $W/src/features/mail/MoveToProject.tsx \
        $W/src/app/a-read-section-folds-itself.test.ts \
        $W/src/features/mail/pages/Folders.tsx \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/features/mail/ProjectRail.tsx \
        $W/src/layouts/Sidebar.tsx \
        $W/src/styles/tokens.css \
        $W/src/index.css \
        land-a-project-is-a-folder-3.sh

git commit -F - <<'MSG'
A project is a folder

The mailbox door becomes a wall of folders, to the owner's reference, and the
project mailbox gets its own folders back on a desktop.

IT IS DRAWN AS THE OBJECT IT IS. Tab, mark, count, name, a line saying what
the room is for, and a ... key. A row in a list is a thing you scan; a folder
is a thing you open, and this screen exists so somebody chooses a room BEFORE
they read any mail. The shape does the explaining a paragraph would otherwise
have to do. One element, one pseudo-element for the tab, and no asset.

NINE TINTS, AND THIS CITY DOES NOT DO COLOUR. The owner picked the coloured
variant over the monochrome one, so this is the first genuinely chromatic set
since the hub accents - and it earns the exception: nine folders in a grid are
told apart by hue long before they are told apart by name, which is the whole
reason the reference drew them in nine colours rather than nine greys. Every
tint lives in tokens.css, which is where this codebase has always kept colour
decisions, with contrast measured against the two inks that ever land on it:
17.85:1 at worst for the title and 4.88:1 at worst for the line under it, both
clear at the worst tint, so no folder needs an ink scale of its own.

THE MARK IS INK, NOT THE TINT. Drawn in the folder's own colour it measures
1.68:1 on amber and 3.33:1 on violet - a picture you have to already know in
order to read. The tab and the face carry the colour; the mark carries the
meaning, at 21:1 on a white chip, and is legible in all ten.

THE MARK IS DERIVED FROM THE NAME, which the owner chose over a picker, so the
honest thing is to ship the failure alongside the feature: whole-word matching,
first rule wins, and a plain folder when nothing matches. "Legal" gets a
document and "ABG" gets a folder, because ABG is a name and not a word. That is
the right failure - a folder is a folder, and confidently drawing a plane on
the tax project is the one nobody forgives. folderLook.test.ts pins the
reference set, the fallback, the whole-word rule and the priority order.

THE PROJECT'S OWN FOLDERS WERE INVISIBLE ON A DESKTOP, and that is a bug in
what shipped last night rather than a new feature. They were drawn with
`.hub-chips`, which every hub hides at 900px because the sidebar carries the
same links at that width. The sidebar does NOT carry these: they are one
project's Inbox, Sent, Drafts, Starred and Trash. So on the screen most of this
is read on, a project had an inbox and no way to reach anything else in it.
Its own rail now, at every width - and reusing a class because it looked right
on a phone is exactly how the paper selector went wrong last week.

A PROJECT NAME IS A NAME. The bar was inheriting `.mail-account-addr`, which is
monospace because an email address is a string you read character by character.
A project called "together" is not, and it was being set like one.

`.fold` BECAME `.mfold` BEFORE LANDING. layout.css has owned `.fold` as an
accordion row for far longer than this branch, both stylesheets are global, and
my `::before` would have painted a grey tab across every disclosure header in
the application. Caught by a class-name sweep rather than by a screenshot,
which is the only reason it is a footnote instead of a fix tomorrow.

EVERY PROJECT GETS A SIDE RAIL OF ITS OWN, which is the part still wrong after
the folders were drawn. Standing inside a project the sidebar was the whole
mailbox's - Compose, Sent, Drafts & Failed, Starred, Trash, Drive - and every
one of those links quietly left the room. "Sent" was the bad one: it looked
like the project's Sent and it was the mailbox's, which is the most expensive
kind of wrong a navigation can be, because nothing about it appears broken.
You would have found a project's mail missing from a folder that was never
showing it.

So Mail is the one hub whose rail changes with the room. Inside a project it is
that project's Inbox, Compose, Sent, Drafts & Failed, Starred and Trash - every
one scoped - under a header wearing the folder's own colour and mark, with the
way back to All Emails at its foot. Everywhere else `hub.items` is untouched,
exactly as the other twenty-four hubs declare it. Only All Emails shows every
project's mail combined, which is what it has always meant; now the navigation
says so. The in-page chip rail goes back to being the phone's copy at 1100px -
the width `.hub-chips` uses and the width where the sidebar becomes a drawer.
It was shown at every width for exactly one commit, because the sidebar could
not yet say which room you were in.

THE COMPOSER SENDS BY PROJECT KEY, NOT ID, which removes a race rather than
saving a character. The key is in the URL and is known the instant Compose
mounts; the id had to be found in the project list, so somebody who opened
Compose from a project, typed fast and pressed Send before that list resolved
sent an UNFILED message from inside a project, with nothing on screen to say
so. The server resolves keys already. The label above the composer reads off
the URL too, so it is right from the first paint rather than a moment later.

EVERY PROJECT CARRIES AN ID, AND THE ID IS THE SAME MAILBOX. you+abg@ - one
address, one inbox, one 10 GB quota. It grants nothing: mail sent to it lands
where mail to you@ lands, and the tag only says which room.

It is ON now rather than offered, and the reason is the sentence the owner
asked for: a reply to a project's mail comes back to the project. Outbound mail
from a project is sent Reply-To its id, so the room travels in the ADDRESS and
comes home in it. Thread inheritance already handled the ordinary case, but it
leans on matching an arrival to a trail by sender and normalised subject, and
that misses exactly where it costs most - a recipient who rewrites the subject,
replies from a client that drops the thread, or forwards it to a colleague who
writes back cold. From stays the plain city address, because that is the
DKIM-aligned one; Reply-To is the lever, and it was the lever that was sitting
unused.

A MENU BUTTON SAYS IT OPENS A MENU. a-read-section-folds-itself.test.ts keeps
a named list of everything in the app that owns an `aria-expanded={open}`, and
it asks a new entry to argue for itself rather than bumping a count. The ... key
on a folder is new, and arguing for it found the real gap: a menu and a fold
carry the same attribute, and the one that tells them apart - aria-haspopup -
was on neither the folder's ... key nor the Move key. A screen reader announced
both as a button that appears to do nothing. Both say it now, and the list
entry names them as menus rather than folds.

Two columns: `color`, defaulting to blue, and an optional one-line
`description`. `color` is TEXT and not an enum on purpose - a tenth tint should
be a token and one array, not a migration - and the client falls back to slate
on anything it cannot draw, so an unknown colour degrades to a grey folder
rather than a colourless one. The allowed set is enforced at the API's edge,
where the error can name what is allowed.
MSG

ok committed
say "review, then:  git push"
