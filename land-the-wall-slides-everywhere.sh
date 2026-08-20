#!/bin/bash
# land-the-wall-slides-everywhere.sh — the feed's posters scroll sideways at
# every width, not only on a phone.
#
# It shipped phone-only this afternoon, on the argument that the wall is three
# across on a desktop and a sideways scroll inside one of nine tiles is a
# gesture nobody is looking for. That was about the GESTURE and it missed what
# was underneath: a post with four photographs still showed one of them, on the
# screen where the tile is largest and the loss most obvious. Hiding the
# siblings hid the count badge too, so a desktop visitor had nothing telling
# them anything was missing.
#
# THE TRADE IS THE FETCH, and it is written into relief.css rather than left for
# somebody to find with a network panel: nine tiles with four pictures each is
# thirty-six requests instead of nine, deferred by `loading="lazy"` on
# everything after the first but not free.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no schema.
# PRECONDITION: "An afternoon of small rooms", which is what put the strip in.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The wall slides everywhere"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"An afternoon of small rooms"*) ;;
  *) echo "!! Run land-an-afternoon-of-small-rooms.sh first — that is the commit that adds the strip this one widens."; exit 1 ;;
esac

# ── the tree carries these two files, and nothing else that matters ────────
# Another session has been committing to this repo all day; anything else dirty
# in either package stops the run and gets named.
ALLOWED='^(M |MM| M) together-city-react/(src/styles/relief\.css|src/app/city-wall\.test\.ts)$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"; exit 1
fi

SCRATCH="$(printf '%s\n' "$STATUS" | grep -E '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$SCRATCH" ]; then
  N="$(printf '%s\n' "$SCRATCH" | grep -c . || true)"
  echo "== $N untracked path(s) outside the packages, ignored — none of it is committed"
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="together-city-react/$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify 906700c5a87626d642d003857f75b22f75375c6ecb0ef63493c9b71117b77d2f src/styles/relief.css
verify a65d19ac8fdb8935307c8f2d53e1f3e5cc26e910f6028e4d2258283b5e2b21c6 src/app/city-wall.test.ts
echo "== both files verified"

cd together-city-react

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: vitest"
# The assertion in city-wall.test.ts now requires the OPPOSITE of what it
# required this afternoon, and it is worth reading: the obvious form,
# `not.toMatch(/display: none/)`, fails on the strip hiding its own SCROLLBAR.
# It checks for a rule hiding the sibling pictures, and separately that the
# scrollbar rule is still there — so the test proves it is reading the block it
# thinks it is reading.
npx vitest run

echo "== gate: the ceilings"
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs

echo "== gate: nav-audit, clean since this morning and staying that way"
node scripts/nav-audit.mjs

echo "== gate: the dead-export audit, still main's problem and not this one"
DEAD_BASELINE=3
DEAD_OUT="$( { node scripts/dead-export-audit.mjs 2>&1 || true; } )"
DEAD="$(printf '%s\n' "$DEAD_OUT" | sed -n 's/.*Exports nothing imports[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n 1p)"
[ -n "$DEAD" ] || { echo "!! Could not read the dead-export audit:"; echo "$DEAD_OUT"; exit 1; }
[ "$DEAD" -le "$DEAD_BASELINE" ] || { echo "!! Exports nothing imports went UP: $DEAD, main is at $DEAD_BASELINE."; exit 1; }
echo "   dead exports: $DEAD (main: $DEAD_BASELINE). Nothing orphaned."

echo "== gate: the build"
npx vite build

cd ..

git add together-city-react/src/styles/relief.css together-city-react/src/app/city-wall.test.ts
git commit -F - <<'MSG'
The wall slides everywhere

The feed's posters scroll sideways at every width now, not only below 560px.

── THE REVERSAL, AND WHY IT IS KEPT IN THE FILE RATHER THAN EDITED OUT ────────

It shipped phone-only a few hours ago with a reason that reads well: the wall is
three across on a desktop, and a sideways scroll inside one of nine tiles is a
gesture nobody is looking for.

That reason was about the GESTURE, and it missed the thing underneath it. A post
with four photographs was still showing one of them — on the screen where the
tile is largest and the omission most visible. Worse, hiding the siblings hid
the count badge with them, so a desktop visitor was given nothing at all to
suggest there was more to see. A missing affordance can be discovered by
somebody poking at the page; a missing INDICATION cannot be discovered at all.

── THE COST IS THE FETCH, AND IT IS NAMED ─────────────────────────────────────

`display: none` on the siblings was doing real work: it kept the desktop wall at
one image per tile. Nine tiles carrying four pictures each is thirty-six
requests where there were nine. Everything after the first slide is
`loading="lazy"`, so the browser defers what is off-screen — but a wide wall has
a lot on screen, and this is a trade rather than a free improvement.

It is written into relief.css, at the rule, so the next person to wonder why the
feed feels heavy finds the answer where the decision is rather than in a network
panel.

── AND THE TEST NOW REQUIRES THE OPPOSITE OF WHAT IT REQUIRED THIS AFTERNOON ──

Which is fine — a guard that pins a decision should change when the decision
does — but the way it is written matters. The obvious form,
`not.toMatch(/display: none/)`, FAILS: the strip legitimately hides its own
scrollbar with exactly that declaration, and the broad assertion trips on a rule
it should not care about.

So it checks for the two things that must not come back — a rule hiding the
sibling pictures, and any width query wrapping the strip — and then asserts the
scrollbar rule IS still present, which is how it proves it is reading the block
it believes it is reading rather than an empty slice.

Gates: tsc, vitest, a11y, motion, lint, nav-audit clean, the build.

No API change, no route, no schema.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The wall slides everywhere
 Push — Vercel rebuilds. A post with four photographs has four
 photographs, on a phone and on a desktop.
===============================================================

DONE
