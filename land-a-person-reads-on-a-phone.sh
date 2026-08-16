#!/usr/bin/env bash
# land-a-person-reads-on-a-phone.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug, on /connections at 390px: names broken mid-word — "somen / k",
# "priya / mandal" — handles and relationships hidden behind the buttons, and
# "3 connected hubs" wrapped onto three lines.
#
# THE BUG IS A MISSING flex-shrink, NOT A WIDTH. The row was one flex line:
# avatar, identity, then Manage / Remove / Message. A flex item with no shrink
# rule shrinks; the text inside a button does not, so the button group kept its
# ~290px, overflowed its own box and painted over the column next to it, while
# the identity column — the only shrinkable thing in the row — was crushed to
# nothing. Nothing in the markup said which of the two mattered.
#
# So: the action group is told not to shrink, the name and handle truncate to
# one line each with an ellipsis, and below 560 the actions take a line of
# their own where the three buttons share the width equally — every one of
# them a comfortable thumb target instead of three squeezed capsules. Manage
# and Remove's panels drop their 56px indent on a phone, which is a seventh of
# the screen spent on alignment.
#
# The row markup moves out of inline styles into named classes for one reason:
# each caller used to hand-roll its own `display:flex, gap:8` around its own
# buttons, so the wrapper the row needed to move belonged to three different
# call sites. Nothing here changes at a desk — verified by rendering the row at
# 390 and 900 against the real stylesheets.
#
# RUN AFTER "A drawer is not a door" if that one has not landed yet — they do
# not touch the same files, so either order works, but keeping them in sequence
# keeps the log readable.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
git log --oneline -40 | grep 'A person reads on a phone' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
C="$W/src/index.css"
P="$W/src/features/connections/pages/Connections.tsx"
T="$W/src/app/a-person-reads-on-a-phone.test.ts"
grep -q '\.person-acts { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }' "$C" \
  || die "index.css does not carry the person rules"
grep -q 'className="person-row"' "$P" || die "Connections.tsx still hand-rolls the row"
grep -q 'paddingLeft: 56' "$P" && die "a fold still carries the inline indent"
[ -f "$T" ] || die "the guard test is missing"
ok "all three files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(src/index\.css|connections/pages/Connections\.tsx|a-person-reads-on-a-phone\.test\.ts|land-a-person-reads-on-a-phone\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/a-person-reads-on-a-phone.test.ts || die "the phone guard"
ok "the phone guard passes"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$C" "$P" "$T" land-a-person-reads-on-a-phone.sh
git commit -q -m "A person reads on a phone

The connections row was one flex line and the button group had no shrink rule,
so Manage / Remove / Message kept their 290px, overflowed, and painted over the
person. Names broke mid-word; handles disappeared under the buttons.

The action group no longer shrinks, the name and handle truncate to one line
each, and below 560 the actions take a full-width line of their own with the
three buttons sharing it equally. The row's inline styles become named classes
so the wrapper belongs to the row rather than to each call site.

Desktop is unchanged." || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
