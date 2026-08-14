#!/usr/bin/env bash
# land-a-control-that-does-nothing.sh  ·  run from the REPO ROOT
#
# Audit finding 7, the client half. Seven ways the mail surface answered a
# question it had not asked, or asked none at all.
#
#  1 · A PROJECT LIST THAT FAILED READ AS A PROJECT THAT WAS DELETED. Both
#      screens look the room up in `q.data ?? []`, so a request that timed out
#      left it undefined — and they then told the citizen, by name, that the
#      project was gone and its mail had gone back to All Email. Neither had
#      happened. The folder wall did the same thing with "No projects yet".
#
#  2 · ONE ROOM'S MAIL UNDER ANOTHER ROOM'S HEADING. `placeholderData: prev`
#      was there for the search debounce, but the key also carries the folder
#      and the project, so moving between rooms drew the previous room's rows
#      — with its chips — until the new request landed.
#
#  3 · THE SETTINGS CARD KEPT THE LAST PROJECT'S NAME. Seeded on mount, never
#      remounted between projects: one press of Save from renaming the wrong
#      one.
#
#  4 · TWELVE MUTATIONS FAILED IN SILENCE. Star, trash, retry, discard,
#      rename, description, colour, archive, delete, move — fired and
#      forgotten. A refused request looked exactly like a press that missed.
#
#  5 · DELETING FROM TRASH WAS ONE TAP. The only irreversible act in this
#      mailbox, on the same 44px key that elsewhere merely MOVES mail, with no
#      question and no undo — and the reader's key said "Delete" while meaning
#      "destroy", then navigated to the Inbox, which is not where they were.
#
#  6 · THE SUGGESTION LIST COULD NOT BE CLOSED. Opened on focus and on every
#      keystroke; only picking a name closed it. Type an external address and
#      it sat over Cc and Bcc for the rest of the compose.
#
#  7 · ...AND COULD NOT BE REACHED. Bare divs with an onClick: no role, no
#      focus, no keyboard. The mouse was the only way in.
#
# HOW THE WEB SUITE WAS RUN, since vitest cannot run through the bridge
# (rollup ships a native binary and this VM is Linux). The source-reading
# guards are plain node once `vitest`'s describe/it/expect are stubbed, so
# they were run that way against a copy of src: 359 assertions pass, 0 fail.
# That covers failure-states, mail-reads-on-a-phone, no-borrowed-class-names,
# a-read-section-folds-itself, relief.spec, one-bag and tap-targets — every
# guard that could see this change. The 23 files it cannot load are unit tests
# of pure modules none of this touches. The real runner still gates below.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling, dead-export at its pre-existing 3 (astrology + nutrition,
# not ours — reported, not gated).
#
# THE CHAT PACKAGE IS TOLERATED AND NOT COMMITTED. src/mail/ there carries two
# sessions' work at once — finding 7's API half and another session's outbound
# threading headers. Neither can be landed without the other, and that is a
# separate commit with its own argument.
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
printf '%s\n' "$LOG" | grep 'A control that does nothing' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The thread is the unit' >/dev/null; [ $? -eq 0 ] || die "run land-the-thread-is-the-unit.sh first - this lands on top of it"
ok "the filing is fixed, the screen still fails in silence"

say "2 - scope"
PKG='together-city-(chat|react)/'
# The react package must carry ONLY these seven files. The chat package's mail
# folder is tolerated by name and committed by nobody here - see the header.
ALLOWED_IN='^(M |MM| M|\?\?) (together-city-react/src/(index\.css|features/mail/(api\.ts|MoveToProject\.tsx|pages/(Folders|Projects|MessageView|Compose)\.tsx))|together-city-chat/src/mail/.*)$'
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
ok "the web app carries this change, and the API's mail folder is left alone"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 8207f86657fa2b25d7d97baf0b4e1b922a405877b72fb1392ad129661dbbc06c "$W/src/features/mail/api.ts"
verify 2a7d575c21de3f7c94b97eb270e9099477188ef2c9fbc2b60785444b8c517461 "$W/src/features/mail/MoveToProject.tsx"
verify 3e43433ec7077c208f307f9e63a9acac96aa7d399d031357b6839b419085092e "$W/src/features/mail/pages/Folders.tsx"
verify 60c39208f46479577d131bbe00b0a357814de848163cb1978ac0eb44cff8e632 "$W/src/features/mail/pages/Projects.tsx"
verify 917650bb03c4fd9e532c9309dda048894326ed9709fedca895a790f9a9f2c41d "$W/src/features/mail/pages/MessageView.tsx"
verify 0a3f05aedee6111e053aafd5eb0e891603f556c5ff3ce5cb2c1679bdc5db800e "$W/src/features/mail/pages/Compose.tsx"
verify 3927bb8c32a1363a33ac7a409771e75d5458161c26bdde088a5b2c6e3ce6ebbf "$W/src/index.css"

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
git add $W/src/features/mail/api.ts \
        $W/src/features/mail/MoveToProject.tsx \
        $W/src/features/mail/pages/Folders.tsx \
        $W/src/features/mail/pages/Projects.tsx \
        $W/src/features/mail/pages/MessageView.tsx \
        $W/src/features/mail/pages/Compose.tsx \
        $W/src/index.css \
        land-a-control-that-does-nothing.sh

git commit -F - <<'MSG'
A control that does nothing is worse than one that is disabled

Because the citizen concludes it worked and stops looking. Audit finding 7,
the client half: seven ways the mail surface answered a question it had not
asked, or asked none at all.

A REQUEST THAT FAILED IS NOT A PROJECT THAT WAS DELETED. Both project screens
find the room in `q.data ?? []`, so a list that 500s or times out leaves it
undefined — and the mailbox then told somebody, by name, that the project they
had bookmarked did not exist and that everything in it had gone back to All
Email. None of that had happened, and the sentence was reassuring, which is
the worst kind of wrong: it is read, believed, and the project is made again.
The folder wall did the same thing more quietly, showing "No projects yet" —
first-run copy inviting somebody with nine rooms to make their first one. This
is the failure failure-states.test.ts exists for: `data` is undefined in two
situations that mean opposite things, and every `?? []` picks the calmer one.

ONE ROOM'S MAIL UNDER ANOTHER ROOM'S HEADING. `placeholderData: (prev) => prev`
was put there for the search debounce and it is right for that — but the query
key also carries the folder and the project, so moving from All Email into ABG
drew All Email's rows, with All Email's chips, under ABG's name until the new
request landed. On a slow connection that is seconds, and it is
indistinguishable from the filing being wrong. It now holds the previous rows
only when the folder and the project are the same, which is the case it was
written for.

THE SETTINGS CARD KEPT THE LAST PROJECT'S NAME. Name and description are
seeded into local state on mount, and the component did not remount between
projects — so leaving settings open and clicking through left ABG's name in
the field above Nova's key, one press of Save from renaming the wrong project.
A key on the project id is the whole fix: a different project IS a different
component.

TWELVE MUTATIONS FAILED IN SILENCE. Star, trash, retry, discard, rename,
description, colour, archive, delete project, move a conversation — every one
fired and forgotten. A star the API refused left the outline hollow, so it was
pressed again. A trash that failed left the message in the list, which reads as
a tap that missed. An archive that failed left the menu open looking untouched.
In each case the API answered with a sentence written for a person and the
screen threw it away. One strip now says what came back, and says the row is
exactly as it was — because the fear when a control does nothing is that it did
half of something.

DELETING FROM TRASH WAS ONE TAP. It is the only irreversible act in this
mailbox, and it sat on the same key that everywhere else merely MOVES mail —
which is what makes the gesture feel cheap — with no confirmation and no undo.
The reader was worse: its key said "Delete" and meant "destroy", then navigated
to the Inbox, which is neither where the citizen was standing nor where they
could have checked. It says "Delete forever" there now, asks first, and goes
back to the folder it was opened from — including a project's own Trash.

THE SUGGESTION LIST COULD NOT BE CLOSED, AND COULD NOT BE REACHED. It opened on
focus and on every keystroke, and the only thing that ever closed it was
picking a name — so typing an address that is not a connection, which is most
external mail, left a panel at z-index 20 sitting over the Cc and Bcc fields
for the rest of the compose, with no key, click or gesture that would put it
away. The options were bare divs with an onClick: not focusable, not announced,
no role, so to a keyboard they did not exist and to a screen reader the To
field had nothing attached to it at all. It is a listbox now — Escape closes
it, looking elsewhere closes it, arrows move through it, Enter takes the one
the arrows are on — and the input is the combobox that points at it.

WHAT IS NOT HERE, and why. A draft still loses its attachments and its Bcc:
saveDraft carries to, subject, body and thread, and nothing else, so resuming
a draft written with three files and a blind copy silently sends none of them.
The columns exist on the row; the endpoint's schema does not take them. That
is an API change and it lands with the API half.
MSG

ok committed
say "review, then:  git push"
