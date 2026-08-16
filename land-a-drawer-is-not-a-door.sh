#!/usr/bin/env bash
# land-a-drawer-is-not-a-door.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug, looking at /hubs on a phone: Personal was a black rectangle
# with a sun in the middle of the district grid, sitting between Nutrition and
# Real estate — both of which carry commissioned photographs.
#
# The black rectangle is not a missing asset. Personal has no HUB_HERO because
# it is not a hub: it is a TAB, deliberately, and the whole reason it was built
# that way (see "A drawer of one's own", 15 Aug) is that making it a HubKey
# would oblige every hub-keyed map to invent it a photograph, a billboard line,
# a theme and a consent decision it does not have. So the grid was always going
# to draw it as an empty frame. The fix is not to commission art for a drawer.
# The fix is to stop filing it among the doors.
#
# It moves to "Your city, your people" — the row that already holds the
# calendar and the drive that Personal itself contains. Moved, not hidden: the
# route, the four rooms, the header tab and every search entry are untouched.
#
# Mail was already filtered out of this grid for exactly this reason. This
# commit turns that one-off into the rule it always was: NOT_A_DOOR.
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
git log --oneline -40 | grep 'A drawer is not a door' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
# This is a two-file change written straight into the working tree by the
# session that authored it, not carried as a patch. The check below is
# therefore a check that the edit is PRESENT, and the commit takes those two
# paths and nothing else - the tree carries other sessions' work.
H="$W/src/pages/Hubs.tsx"
T="$W/src/app/a-drawer-of-ones-own.test.ts"
grep -q "NOT_A_DOOR = new Set<string>(\['mail', 'personal'\])" "$H" || die "Hubs.tsx does not carry the change"
grep -q "NAV.filter((n) => !NOT_A_DOOR.has(n.key))" "$H" || die "the grid still maps over unfiltered NAV"
grep -q "stands with the people layer on /hubs" "$T" || die "the guard assertion is missing"
ok "both files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(pages/Hubs\.tsx|app/a-drawer-of-ones-own\.test\.ts|land-a-drawer-is-not-a-door\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/a-drawer-of-ones-own.test.ts || die "the drawer guard"
ok "the drawer guard passes"
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
git add "$H" "$T" land-a-drawer-is-not-a-door.sh
git commit -q -m "A drawer is not a door

Personal drew as a black frame in the /hubs district grid because it has no
HUB_HERO and never will - it is a tab, not a hub, and that was the point of
building it as one. It moves to 'Your city, your people', beside the calendar
and the drive it holds. Route, rooms, header tab and search entries untouched.

Mail's one-off filter on this grid becomes the rule it always was: NOT_A_DOOR." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
