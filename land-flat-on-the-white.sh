#!/bin/bash
# land-flat-on-the-white.sh — the product sections give up the card.
#
# The edges, the lifts and the seam go: the routine bands, the routine cards,
# the rule under each photograph and the raised plate-number disc. What is left
# is type and photographs on white, separated by the space between them.
#
# It is the second half of the same instruction the white was: casing separates
# things of DIFFERENT value from their ground — a photograph from the paper it
# sits on. White cards with a hairline and a lift, on a white section with a
# hairline and a lift, on a white page, is three edges and two shadows drawn
# around surfaces that are all the same colour, which draws the join rather than
# the thing.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no schema.
# PRECONDITION: "The shop goes white".
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="Flat on the white"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The shop goes white"*) ;;
  *) echo "!! Run land-the-shop-goes-white.sh first — this is written against the tree it produces."; exit 1 ;;
esac

# ── the tree carries these two files, and nothing else that matters ────────
ALLOWED='^(M |MM| M) together-city-react/src/(styles/layout\.css|app/a-read-section-folds-itself\.test\.ts)$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"; exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"
  echo "   Commit or stash them first — this script will not commit on top of them."
  exit 1
fi

SCRATCH="$(printf '%s\n' "$STATUS" | grep -E '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$SCRATCH" ]; then
  N="$(printf '%s\n' "$SCRATCH" | grep -c . || true)"
  echo "== $N untracked path(s) outside the packages, ignored — none of it is committed"
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify 14422487e1b478faf5d74642b8a20ec06c83e1ddbfee377c9b19fc81e68fa40f together-city-react/src/styles/layout.css
verify a0a694fa72e6710b431185ab2fa0dd6d77aec2b39c65db97c33da3f82027dc2c together-city-react/src/app/a-read-section-folds-itself.test.ts
echo "== both files verified"

cd together-city-react

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: vitest"
# The new assertions read the rules out of the shipped stylesheet, and one of
# them cost a fix worth knowing about: `.routine-card {` appears TWICE now — in
# the shared white rule, where `box-shadow: none` is the correct answer, and in
# the card's own block, where any box-shadow is the failure. Anchoring on the
# first occurrence read the wrong rule and failed on the declaration it exists
# to require.
npx vitest run

echo "== gate: the ceilings that are clean"
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs

echo "== gate: the two audits main is already failing"
DEAD_BASELINE=3
DEAD_OUT="$( { node scripts/dead-export-audit.mjs 2>&1 || true; } )"
DEAD="$(printf '%s\n' "$DEAD_OUT" | sed -n 's/.*Exports nothing imports[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n 1p)"
[ -n "$DEAD" ] || { echo "!! Could not read the dead-export audit:"; echo "$DEAD_OUT"; exit 1; }
[ "$DEAD" -le "$DEAD_BASELINE" ] || { echo "!! Exports nothing imports went UP: $DEAD, main is at $DEAD_BASELINE."; exit 1; }
echo "   dead exports: $DEAD (main: $DEAD_BASELINE). Nothing orphaned."

NAV_BASELINE=1
NAV_OUT="$( { node scripts/nav-audit.mjs 2>&1 || true; } )"
case "$NAV_OUT" in
  *clean*) NAV=0 ;;
  *) NAV="$(printf '%s\n' "$NAV_OUT" | sed -n 's/.*nav-audit: \([0-9][0-9]*\) problem.*/\1/p' | sed -n 1p)" ;;
esac
[ -n "$NAV" ] || { echo "!! Could not read nav-audit:"; echo "$NAV_OUT"; exit 1; }
[ "$NAV" -le "$NAV_BASELINE" ] || { echo "!! nav-audit went UP: $NAV, main is at $NAV_BASELINE."; exit 1; }
echo "   nav-audit problems: $NAV (main: $NAV_BASELINE). Nothing stranded."

echo "== gate: the build"
npx vite build

cd ..

git add -A together-city-react/src
git commit -F - <<'MSG'
Flat on the white

The product sections give up the card. The edges, the lifts and the seam go —
the routine's bands, the routine cards inside them, the rule under each
photograph and the raised plate-number disc. What is left is type and
photographs on white, separated by the space between them.

── IT IS THE SECOND HALF OF THE SAME INSTRUCTION THE WHITE WAS ────────────────

Casing separates things of DIFFERENT value from their ground: a photograph from
the paper it sits on. That is the rule relief.css has enforced across the city
since social and dating asked for a tint and were told a wall of pictures on
white is fixed by casing and space rather than by colour.

Between two whites it draws the join instead of the thing. White cards with a
hairline and a lift, sitting on a white section with a hairline and a lift, on a
white page, is three edges and two shadows around surfaces that are all the same
colour — and every one of them was correct the day it was written, when the card
was cream and the wall was near-black.

What separates one product from the next now is the gap between them and the
block of type in it, which is how a printed catalogue does it and why a
catalogue page can hold twelve products without looking like a dashboard.

── FOUR REMOVALS, EACH WITH ITS OWN REASON ────────────────────────────────────

THE SECTION AND THE CARD lose their border and their shadow, set once in the
rule that already gives them both their white — a card that also declared them
in its own block is a card that keeps half of them the next time somebody
changes the other half.

`border: 0` AND NOT `border-color: transparent`. A transparent border still
occupies its pixel, and a row of cards laid out with an edge they cannot see is
a row that will not line up with anything that has none. The test forbids the
transparent version by name.

THE RULE UNDER THE PHOTOGRAPH goes. It was the seam between the studio white of
the well and the cream of the body, and drawing it was right while there were
two materials to separate. There is one now, and a hairline across the middle of
a single white surface is a line about nothing.

THE PLATE NUMBER keeps its cream disc — it has to be found against a white
photograph — and gives up its lift with everything else. A raised chip on a flat
card is the last survivor of an idiom, which reads as an oversight rather than
as emphasis.

── WHAT STAYED, AND IT IS A JUDGEMENT ─────────────────────────────────────────

The hairline between MORNING and EVENING. It is not part of the card treatment:
it is the composition, one rule that makes two columns read as two halves of a
day rather than as two lists that happen to be adjacent, and it is drawn on the
second column so it never appears above or below anything once they stack on a
phone. Removing it is one line if it should go too.

The market's category rules stayed for the same reason — they are headings, not
casing.

Gates: tsc, vitest, a11y, motion, lint, the build. The new assertions read the
rules out of the shipped stylesheet rather than out of a screenshot. The
dead-export audit and nav-audit were failing on main before this commit and are
measured against main.

No API change, no route, no schema.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: Flat on the white
 Push — Vercel rebuilds. /beauty/routine and /beauty/market:
 no edges, no lifts, no seams.
===============================================================

DONE
