#!/usr/bin/env bash
# land-two-doors-close.sh  ·  run from the REPO ROOT
#
# The family rail loses My Orders and Shared Pantry (owner's call, 13 Aug).
# This was folded into the door script and missed its ride: the door had
# already landed in its first form, so the rewrite refused — correctly — and
# these edits were left uncommitted. This is their own vehicle.
#
#   · MY ORDERS' own rail sub-line said "Empty until ordering goes live" — a
#     door to a room with nothing in it. Its route lands on the grocery list,
#     where the coming-soon notice already stands; the page file is deleted,
#     and nav-audit gates the deletion.
#   · SHARED PANTRY leaves the rail but keeps its page: the grocery
#     arithmetic reads the pantry ("already in pantry · buy the rest"), so it
#     is linked from the grocery list it feeds — the cart's 4 Aug precedent
#     for a removed menu entry that must not orphan its page.
#
# The rail closes up to 01–04 and Search's eyebrow follows its new number.
# Verified through the bridge: tsc clean, lint 0, a11y and motion at their
# ceilings; nav-audit goes green at the moment Orders.tsx is deleted below.
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
printf '%s\n' "$LOG" | grep 'Two doors close' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'One rail, two kitchens' >/dev/null; [ $? -eq 0 ] || die "run land-one-rail-two-kitchens.sh first - this lands on top of it"
ok "the rail is in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^((M |MM| M) together-city-react/src/(app/router\.tsx|config/hubs\.ts|features/family/pages/(Grocery|Search)\.tsx)|(D |DD| D) together-city-react/src/features/family/pages/Orders\.tsx)$'
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

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 04f5e02771fecd68f11c93a469f7f16f8e1341d58a5121eedc5fe7a60192024a "$W/src/app/router.tsx"
verify 92df29baa2b94f985a8e02d097fbaf5f2f2e9ab8e701d1ca15d6eebdaf9ba6da "$W/src/config/hubs.ts"
verify 3aa4b5b8809cf64ff6c82bba8ec405066d97f276b1ef85a383b0465b1273d6d9 "$W/src/features/family/pages/Grocery.tsx"
verify c6a21a44e97eb5f6976fba2a7f34cbea70b513c822b6a4dcbf214ff479577600 "$W/src/features/family/pages/Search.tsx"

say "4 - the empty room goes"
if [ -f "$W/src/features/family/pages/Orders.tsx" ]; then
  git rm -q "$W/src/features/family/pages/Orders.tsx" || die "git rm failed"
  ok "Orders.tsx deleted (staged)"
else
  ok "Orders.tsx already gone"
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
git add $W/src/app/router.tsx $W/src/config/hubs.ts \
        $W/src/features/family/pages/Grocery.tsx \
        $W/src/features/family/pages/Search.tsx \
        land-two-doors-close.sh

git commit -F - <<'MSG'
Two doors close

The family rail loses My Orders and Shared Pantry, and the two removals are
not the same removal.

MY ORDERS GOES WHOLE. Its own rail sub-line admitted it: "Empty until
ordering goes live" - a door to a room with nothing in it. The route stays
declared and lands on the grocery list, where the coming-soon notice already
stands (the /cars shape); the page FILE is deleted, and nav-audit gates the
deletion by failing on any dead page module.

SHARED PANTRY LEAVES THE RAIL AND KEEPS ITS PAGE. The grocery arithmetic
reads the pantry - "already in pantry - buy the rest" is computed from it -
so the page cannot die while the list depends on what it manages. It is
linked from the bottom of the grocery list it feeds, beside the cart's link,
which is the cart's own 4 Aug precedent: a removed menu entry must not
orphan its page.

The rail closes up to 01-04, and Search's eyebrow follows its new number -
the second time this rail's numbering has closed over a removal, and the
comment in hubs.ts now records both.
MSG

ok committed
say "review, then:  git push"
