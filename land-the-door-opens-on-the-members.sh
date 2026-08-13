#!/usr/bin/env bash
# land-the-door-opens-on-the-members.sh  ·  run from the REPO ROOT
#
# The family hub loses its landing page. "/family" was a hero photograph, a
# welcome line and a summary of things the six rail pages already say — a room
# you walk through to reach the rooms. The owner's call (13 Aug): the Family
# tab opens on the FIRST THING TO DO — Connect Members, the page every other
# family page's portions depend on.
#
# Same shape as /cars and /nutrition/weekly-classic: the route stays declared
# and redirects, so every old link and the hub's backPath keep resolving. The
# page file is DELETED here (this script runs on the Mac; the bridge cannot
# unlink) — and nav-audit is the gate that proves it: it fails on a dead page
# module until the file is gone.
#
# The one thing the landing had that the rail does not — the per-member
# nutrition check ("some members need a portion tweak") — MOVES rather than
# dies: FamilyDashboard now renders on Connect Members, beside the member
# cards it flags. Verified through the bridge: tsc clean, lint 0, a11y and
# motion at their ceilings.
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
printf '%s\n' "$LOG" | grep 'The door opens on the members' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The month writes the menu' >/dev/null; [ $? -eq 0 ] || die "run land-the-month-writes-the-menu.sh first - this lands on top of it"
ok "the month is in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^((M |MM| M) together-city-react/src/(app/router\.tsx|features/family/pages/Connect\.tsx)|(D |DD| D) together-city-react/src/features/family/pages/Family\.tsx)$'
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
ok "packages clean; untracked scratch at root left alone"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 163410b3e8b2b62e7fb474446dc2d8e2bb2b9398844f26e3e06319e916aca7ce "$W/src/app/router.tsx"
verify c827e09bec0347e10d6e117df0e484183649b4b2176f9993d78d07a9d55e77cf "$W/src/features/family/pages/Connect.tsx"

say "4 - the landing page goes"
if [ -f "$W/src/features/family/pages/Family.tsx" ]; then
  git rm -q "$W/src/features/family/pages/Family.tsx" || die "git rm failed"
  ok "Family.tsx deleted (staged)"
else
  ok "Family.tsx already gone"
fi

say "5 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die "nav-audit - the dead-page check is the point of this gate"
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "6 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "7 - commit"
git add $W/src/app/router.tsx $W/src/features/family/pages/Connect.tsx land-the-door-opens-on-the-members.sh
git commit -F - <<'MSG'
The door opens on the members

The family hub loses its landing page. "/family" was a hero photograph, a
welcome line, a member summary and an Explore button - a room you walk
through to reach the rooms, all of which the rail already lists by name. The
Family tab now opens on Connect Members: the first thing to DO, and the page
every other family page depends on, because portions are per member and the
members are what it edits.

THE ROUTE STAYS AND REDIRECTS, the /cars and /nutrition/weekly-classic
shape: every old link, bookmark and the hub's own backPath keep resolving,
and nav-audit keeps counting a declared route rather than a hole. The page
FILE is deleted, not orphaned - nav-audit fails on a dead page module, which
makes the deletion a gated fact rather than housekeeping.

What the landing had that the rail does not - the per-member nutrition
check ("some members need a portion tweak", the kidney-safe protein flag,
consumed-vs-target bars) - moves rather than dies: FamilyDashboard renders
on Connect Members now, directly above the member cards it flags. A warning
about somebody's portion sits beside the place that somebody is managed,
which is where it can be acted on instead of read about.
MSG

ok committed
say "review, then:  git push"
