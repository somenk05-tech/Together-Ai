#!/usr/bin/env bash
# land-a-project-is-a-folder-2.sh  ·  run from the REPO ROOT
#
# The mailbox door becomes a wall of folders, and the project mailbox gets its
# folders back on a desktop.
#
# WHY THERE IS A -2. The first script reached the web app's vitest and stopped
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
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-chat/(prisma/(schema\.prisma|migrations/20260814020000_mail_project_look/)|src/mail/(mail\.service\.ts|dto/mail\.dto\.ts))|together-city-react/src/(index\.css|styles/tokens\.css|components/ui/Icon\.tsx|app/a-read-section-folds-itself\.test\.ts|features/mail/(api\.ts|folderLook\.ts|folderLook\.test\.ts|MoveToProject\.tsx|pages/(Projects|Folders)\.tsx)))$'
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

say "3 - sha256 (fourteen files)"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify ac6933de3b1f50b166c47efc6bdd6982cbe8603bf998a0447a2d1fa70ee7c82d "$A/prisma/schema.prisma"
verify 96d94d482a2853cc03207930cf9f784c5708cb47a46a2038ae92806e0e22197a "$A/prisma/migrations/20260814020000_mail_project_look/migration.sql"
verify 96dd6c874dc2146b4c361baa060e2bf96341c3875b76272dd76a8f134d73c451 "$A/src/mail/dto/mail.dto.ts"
verify dbf0961b45100d81213ce7521917b750aaeab82e4d904bf165dc2561eb2a2e3a "$A/src/mail/mail.service.ts"
verify f2586ed55b6a7fe9d7381197cc52f56bb19d95e6fdfbcdc5a8250d5a8f0cd54b "$W/src/components/ui/Icon.tsx"
verify 81fa99b54a4c62e9539c669b808351194393b3cb9ad56b34ca22e5fd2608e685 "$W/src/features/mail/folderLook.ts"
verify 62b170218957601879e3dd183442437cfcff075b7fd915a6162cd4df13022ada "$W/src/features/mail/folderLook.test.ts"
verify 7b6d70431c15b0b73969d642a6252867a212ddda9b7dbca83bbe828a851e9003 "$W/src/features/mail/api.ts"
verify c94ecde09e6c59f63e59d901f3cef51f92aa2dcfd53320af81b130656a3fe4e3 "$W/src/features/mail/pages/Projects.tsx"
verify 86969d837fd1758dde71135eb0cc9290bb183d3de90c58d5322e445d76ee4551 "$W/src/features/mail/MoveToProject.tsx"
verify 8dd92218a504f8a285297aef5c7f2e81d11b30db3f92577676747fa0ef10e01e "$W/src/app/a-read-section-folds-itself.test.ts"
verify 55336836d7b260f1ef3288800ef9e8a5a18b4cc7fb4fb5ad016f668e6489bdb3 "$W/src/features/mail/pages/Folders.tsx"
verify c2a0d81cc856f546799ce9f0d147638f96ce51c271761165901f50eaeea0bca1 "$W/src/styles/tokens.css"
verify 2c19ec4cabc68357339800ba978475c6136ec3441064a3991e8df0f9c9ce730e "$W/src/index.css"

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
        $W/src/styles/tokens.css \
        $W/src/index.css \
        land-a-project-is-a-folder-2.sh

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
