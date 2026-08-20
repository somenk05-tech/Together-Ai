#!/bin/bash
# land-swipe-finish.sh — land-swipe-unmatch.sh applied its patch and then
# aborted on a gate that has since been fixed by another commit, leaving the
# work sitting in the tree uncommitted. This is the second half of that script:
# it verifies the files on disk are exactly what the patch produced, runs every
# gate, and commits. It writes no code of its own.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

# A Cowork session read this repo's status over the file bridge, which cannot
# unlink, so an empty .git/index.lock may be sitting there blocking every git
# command. Removing a zero-byte lock is safe when no git process is running.
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="Swipe a match aside, and be asked before it ends"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# The two files the patch touched, and nothing else. If the tree carries other
# changes this is the wrong script — commit those first.
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev '^( M together-city-react/src/features/dating/pages/DatingChats\.tsx|\?\? together-city-react/src/app/motion-props-name-their-timing\.test\.ts)$' \
  || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

# Verify byte-for-byte that what is on disk is what the patch produced. A
# half-applied patch that builds is the worst thing this could commit.
check() {
  local want="$1" file="$2"
  local got; got="$(shasum -a 256 "$file" | awk '{print $1}')"
  [ "$got" = "$want" ] || { echo "!! $file is not what the swipe patch produced."; echo "   want $want"; echo "   got  $got"; exit 1; }
}
check c0202ae8730f21d1c7dc0e8dcb18335c7e387a5de17422b61667dcdc95d1a198 together-city-react/src/features/dating/pages/DatingChats.tsx
check 9fe727caf8426bc73937515f34f585d3b576239a3291ee41c7e600e741ab2261 together-city-react/src/app/motion-props-name-their-timing.test.ts
echo "== both files verified against the patch"

if [ ! -d together-city-react/node_modules/framer-motion ]; then
  echo "== framer-motion is declared but not installed — running npm install first"
  (cd together-city-react && npm install --no-audit --no-fund)
fi

cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/features/dating/pages/DatingChats.tsx \
        together-city-react/src/app/motion-props-name-their-timing.test.ts
git commit -F - <<'MSG'
Swipe a match aside, and be asked before it ends

The owner asked for the gesture every messaging app has. Two decisions inside
it matter more than the animation.

THE SWIPE REVEALS; IT DOES NOT ACT. Unmatching ends a conversation for two
people and this app cannot undo it — `undoLastPass` is explicitly not an
un-unmatch. A gesture that completes a destructive action on release trades
somebody's match for a stray thumb on a train. So the swipe opens a drawer, the
drawer holds a button, the button asks once, and the question reverts itself
after four seconds so a half-finished thought is never left lying under the
next tap. Three deliberate acts, none of them slow.

AND IT IS NOT ONLY A GESTURE. The row is still a button that opens the chat,
the drawer's control is a real <button> a keyboard can reach, it is
`aria-hidden` while shut so it is not a tab stop nobody can see, and every
unmatch already available from the thread's safety bar is untouched. A gesture
that is the ONLY way to do something is a feature a screen-reader user does not
have.

WHY framer-motion, HERE, FOR THE FIRST TIME. CLAUDE.md grants it exactly three
uses and this is the first of them: a drag carries VELOCITY, and a flick that
has left the thumb should keep going. A CSS transition cannot read a gesture's
speed, so a fast short flick and a slow long drag would settle identically —
the difference between a control that feels alive and a toggle. `dragElastic`
is asymmetric (0.06 left, 0 right) because a drawer that rubber-bands in the
direction it cannot open is telling the thumb a lie.

`dragDirectionLock` is load-bearing rather than decorative: without it a
diagonal thumb steals the list's vertical scroll, which is the classic way this
pattern ruins the page it was added to improve.

AND THE HOLE CLAUDE.md NAMES IS NOW CLOSED. Its own words: "scripts/
motion-ceiling.mjs counts CSS declarations only. A motion.div carrying a
hand-typed duration is invisible to it, so the drift it exists to stop can walk
straight back in through the library." That was true, and the first component
to import the library is the right moment to stop it being true.
`motion-props-name-their-timing.test.ts` reads only the files that import the
motion library and fails if a duration, delay, stiffness, damping or bounce
appears as a literal anywhere outside a named constant — and separately if any
horizontal drag omits `dragDirectionLock`.

NOT VERIFIED, AND SAID SO: the gesture itself has not been exercised in a real
browser. This container has no live stack to render an authenticated dating
chat against, so what is proven here is the code, the guards and the build —
not the feel. Worth a thumb on a real phone before it is called done.

tsc clean, vitest green, a11y 0, motion at ceiling, lint at ceiling, vite build
clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS"
echo " Next: land-tc-mark.sh"
echo "==============================================================="
