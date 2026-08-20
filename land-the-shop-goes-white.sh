#!/bin/bash
# land-the-shop-goes-white.sh — the product sections come off the cream.
#
# At the owner's word: the routine's morning, evening and wash-day bands, the
# routine cards inside them, and the market's shop sheet are white. Everything
# else in the hub keeps the paper it has always had — the profile's sheets, an
# opened leaf, the plates, the assurance strip.
#
# IT USES `--shot-ground`, NOT A NEW WHITE, and that is the whole design of the
# change. The token already means "the seamless the merchandise was
# photographed on": every product here is hotlinked from a retailer and every
# one was lit on white, which is why the photograph's own well has been that
# white since the shots stopped melting into cream. This carries it out of the
# well and across the card and the section, so a card is one surface instead of
# a studio-white top half joined to a cream bottom half.
#
# ONE CLAIM HAD TO BE RETIRED. The token said "nothing is READ on it — it holds
# pictures — so it is not in the ink table above". Type is read on it now. The
# note is removed from tokens.css and from the test that repeated it, rather
# than left standing for a later reader to trust instead of check.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no schema.
# PRECONDITION: "A white room, and the assessment set in it".
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The shop goes white"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"A white room, and the assessment set in it"*) ;;
  *) echo "!! Run land-a-white-room-and-a-set-assessment.sh first — this is written against the tree it produces."; exit 1 ;;
esac

# ── the tree carries these five files, and nothing else that matters ───────
# Scope, not filenames — see land-the-shelf-and-the-cap-2.sh for the argument.
ALLOWED='^(M |MM| M) together-city-react/src/(styles/(layout|tokens)\.css|features/beauty/pages/(Routine|Market)\.tsx|app/a-read-section-folds-itself\.test\.ts)$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  exit 1
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
verify 1eaa3363b6587e08ab9d2911ec4a97df5d8646aa62f0e36f57c20c2fc257fee5 together-city-react/src/styles/layout.css
verify 7858bb5be86d520c2c009ee2f7add81fc3a68fc406ed362aeb6416575a1d3bc4 together-city-react/src/styles/tokens.css
verify a5698ffec0c11637c5cebce1d10c1ab655356a8cf7898a1489f4c12230b84b2b together-city-react/src/features/beauty/pages/Routine.tsx
verify 3ace99352eed9d2886cbba3e15974b4268314b15a9a27c48af6e3b010eba9603 together-city-react/src/features/beauty/pages/Market.tsx
verify d50f450dc597c506d036e14d3001aaa10441524e65fa892e0607f2ae1348ae71 together-city-react/src/app/a-read-section-folds-itself.test.ts
echo "== all five files verified"

cd together-city-react

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: vitest"
# a-read-section-folds-itself.test.ts is the one that matters here: it reads the
# actual rule out of layout.css and the actual class lists out of the two pages,
# so "the bands are white" is checked against the shipped stylesheet rather than
# against a screenshot. It also holds the ink-restore list, which is what keeps
# these surfaces readable if the ground ever moves again.
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
The shop goes white

The product sections come off the cream, at the owner's word: the routine's
morning, evening and wash-day bands, the routine cards inside them, and the
market's shop sheet. Everything else in the hub keeps the paper it has always
had — the profile's sheets, an opened leaf, the four plates, and the assurance
strip at the foot of the routine, which is not a product section.

── IT IS `--shot-ground`, AND THAT IS THE WHOLE DESIGN ────────────────────────

Not a new white. The token already means the right thing: the seamless the
merchandise was photographed on. Every product in this hub is hotlinked from a
retailer and every one was lit on a white studio background, which is why the
photograph's own well has been that white since the day the shots stopped
melting into the hub's cream and reading as broken images.

This carries it out of the well and across the card and the section around it.
A card whose top half is studio white and whose bottom half is cream has a join
across the middle of it; one surface is a product standing on a sheet of the
paper it was shot on. And it is ONE token doing both, not two whites that agree
today — a well set white by one rule and a body set white by another is a card
that grows a seam the first time either is nudged.

── ONE CLAIM HAD TO BE RETIRED, AND IT IS THE PART WORTH READING ──────────────

`--shot-ground` carried this note: "Nothing is READ on it — it holds pictures —
so it is not in the ink table above." That was true of a photo well and it is
not true of a card and a section full of type.

It is removed from tokens.css and from the test that repeated it, rather than
left standing. A comment saying "no text on this surface" is exactly the sort of
thing a later reader trusts instead of checking, and the next person to add a
colour here would have taken it at its word.

NOTHING HAD TO MOVE TO MAKE IT SAFE, which is worth stating rather than
assuming. These surfaces are on the ink-restore list in relief.css, so they
carry --on-paper, #171310 — and relief.spec already measures that value against
a white ground under the --on-ground names: 18.5:1 against the 4.5 required, and
better than it was on the cream it just left.

── AND THE SHEET GUARD LEARNED A MODIFIER ─────────────────────────────────────

`gives the shop and the shelf a sheet to stand on` pinned the literal string
`<div className="beauty-sheet">`, and Market's sheet now takes `is-shop`. The
pattern matches a class LIST beginning with beauty-sheet — `[\w -]*` and not
`.*`, so a modifier may follow but an expression may not, and a conditional
sheet that is sometimes absent still fails it.

Its reasoning was updated too: the sheet existed because a grid of tiles sat
straight on a black wall, and that wall is white now. The rule survives the
premise, because a sheet is a defined content area — an edge, a lift and a
measure — and a page without one is a page whose content runs to the width of
the window.

A new test asserts the rule out of the shipped stylesheet and the class lists
out of both pages, so "the bands are white" is checked against what ships rather
than against a screenshot.

Gates: tsc, vitest, a11y, motion, lint, the build. The dead-export audit and
nav-audit were failing on main before this commit and are measured against main;
neither ceiling is touched here.

No API change, no route, no schema.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The shop goes white
 Push — Vercel rebuilds. /beauty/routine and /beauty/market:
 the merchandise stands on the white it was photographed on.
===============================================================

DONE
