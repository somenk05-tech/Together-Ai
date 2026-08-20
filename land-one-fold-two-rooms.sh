#!/bin/bash
# land-one-fold-two-rooms.sh — the Financial hub's two long panels fold, and the
# disclosure that makes them fold is now the app's only one.
#
#   RECENT ACTIVITY and BY CATEGORY are closed by default, each with a summary
#   in its header. The Wallet is a page about a balance and how to add to it;
#   Spending is one bar and a column of zeroes most months. Neither list was the
#   reason anybody opened the page.
#
#   THE COMPONENT IS SHARED, and that is the substance of this change. The
#   beauty hub had the only fold in the app and the test beside it counted the
#   aria pairs, precisely because a second implementation is how one of them
#   quietly stops announcing itself. Financial needed folds; the answer was one
#   component wearing two skins rather than a second copy of the same four
#   lines. BeautyLeaf now delegates and renders byte-identical markup.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no schema.
# PRECONDITION: "The wall slides everywhere".
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="One fold, two rooms"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The wall slides everywhere"*) ;;
  *) echo "!! Run land-the-wall-slides-everywhere.sh first."; exit 1 ;;
esac

# ── the tree carries these seven files, and nothing else that matters ──────
# Fold.tsx is NEW, so `??` is allowed for it and only it. Another session has
# been committing here all day; anything else dirty stops the run and is named.
ALLOWED='^((M |MM| M) together-city-react/src/(app/a-read-section-folds-itself\.test\.ts|components/ui/index\.ts|features/(beauty/components/Plates\.tsx|financial/pages/(Wallet|Spending)\.tsx)|styles/layout\.css)|\?\? together-city-react/src/components/ui/Fold\.tsx)$'
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
verify e70950156d90de9642552866df57ed5042e66622832fb5e6c989241b13b46f79 src/components/ui/Fold.tsx
verify 76d6f72128ed11aa288b87adf4b1e8c46984f90fc2bb07cbbcb3c384e13f4dee src/components/ui/index.ts
verify 6c9f555301b305caa77534e145ed652d60714e383b0f5470a1e08cc10e653995 src/features/beauty/components/Plates.tsx
verify 77e65dc10ad855eb87ca93c75011d5ab3ad111b01028e99c92f7f484051ee217 src/features/financial/pages/Wallet.tsx
verify 284ec559fb4ac996f036cbcd960295c1c58639a31abc3ccd8df74728af03e0c6 src/features/financial/pages/Spending.tsx
verify 6d2239769b954568f5078ba4e91027b3944fe2214e2421a567627e9a9e02bbca src/styles/layout.css
verify 6e95306e3fe387e25e93041d067d70550abe5843fadaf8a609063cfaa0898368 src/app/a-read-section-folds-itself.test.ts
echo "== all seven files verified"

cd together-city-react

echo "== gate: tsc"
# IT IS FIRST HERE FOR A REASON. The fold tests read source as TEXT, so both of
# this change's parse errors passed 33 green assertions before tsc saw them.
# A suite that reads files is not a compiler.
npx tsc --noEmit

echo "== gate: vitest"
npx vitest run

echo "== gate: the ceilings"
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs

echo "== gate: nav-audit"
node scripts/nav-audit.mjs

echo "== gate: the dead-export audit, still main's problem and not this one"
DEAD_BASELINE=3
DEAD_OUT="$( { node scripts/dead-export-audit.mjs 2>&1 || true; } )"
DEAD="$(printf '%s\n' "$DEAD_OUT" | sed -n 's/.*Exports nothing imports[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n 1p)"
[ -n "$DEAD" ] || { echo "!! Could not read the dead-export audit:"; echo "$DEAD_OUT"; exit 1; }
[ "$DEAD" -le "$DEAD_BASELINE" ] || { echo "!! Exports nothing imports went UP: $DEAD, main is at $DEAD_BASELINE."; exit 1; }
echo "   dead exports: $DEAD (main: $DEAD_BASELINE). Fold is imported; nothing orphaned."

echo "== gate: the build"
npx vite build

cd ..

git add together-city-react/src/components/ui/Fold.tsx \
        together-city-react/src/components/ui/index.ts \
        together-city-react/src/features/beauty/components/Plates.tsx \
        together-city-react/src/features/financial/pages/Wallet.tsx \
        together-city-react/src/features/financial/pages/Spending.tsx \
        together-city-react/src/styles/layout.css \
        together-city-react/src/app/a-read-section-folds-itself.test.ts

git commit -F - <<'MSG'
One fold, two rooms

The Financial hub's two long panels close, and the disclosure that closes them
is now the only one in the app.

── WHAT FOLDS, AND WHAT THE CLOSED HEADER SAYS ────────────────────────────────

RECENT ACTIVITY on the Wallet. That page is about a balance and how to add to
it; the last six transactions are a reference, not the reason anybody came. The
meta line reports how many and how recent, because a section reading only
"Recent activity" gives nobody a reason to open it.

Its "See all →" link moved inside the panel. It sat beside the heading, and the
heading is a <button> now — a link inside a button is a tap target inside a tap
target, which is the exact thing the fold contract exists to avoid. At the foot
of the panel it also sits where it makes sense: somebody who has read the six is
the person who wants the rest.

BY CATEGORY on Spending. Eight categories, and on most months seven of them read
₹0 — the shape of that list is one bar and a column of zeroes, which is a lot of
screen to say "you spent it on one thing". The meta gives the total and how many
categories were actually used, so the closed section answers the page's question
on its own and opening it is for the breakdown rather than for the answer.

── AND THE COMPONENT IS SHARED, WHICH IS THE REAL CHANGE ──────────────────────

A section that folds is four things done together: the open state, an id linking
face to panel, `aria-expanded` and `aria-controls`, and a word saying which way
it will go. Miss any one and it still LOOKS correct — the panel opens — while a
screen reader is told nothing.

The beauty hub had the only fold in the app, and the test beside it counted the
aria pairs for exactly that reason. Financial needed two more. The choice was a
second copy of those four lines or one component wearing two skins, and a second
copy is how one of them quietly stops announcing itself.

So the contract lives in components/ui/Fold.tsx and the SKIN is the caller's:
beauty keeps `.beauty-leaf`, which is an index line from the owner's printed
contents page, and Financial gets `.fold`, which is the card it replaces — a
section that folds should look like the section it was, or somebody has to learn
a new object in order to read less. BeautyLeaf delegates and renders
byte-identical markup.

THE GUARD MOVED RATHER THAN WEAKENED. It counted two aria pairs in one file,
which could say nothing about a fold written anywhere else. It now reads every
source file in the app and names what it is allowed to find — and that list is
five entries, not two, because `aria-expanded` is not a synonym for "fold". A
combobox announces its listbox with the same attribute. SearchSelect and the
mail thread reader are on it with their reasons.

The fifth is a finding rather than a fixture: nutrition's TargetsDisclosure is a
GENUINE fourth fold and the one thing on that list that should probably become a
Fold. It is left alone deliberately — another hub, not what this change was
asked to touch, and moving it blind is how a UI change becomes a regression
where nobody was looking. Recorded in the test rather than fixed quietly or
forgotten.

── TWO PARSE ERRORS, AND WHY THE GATES ARE ORDERED AS THEY ARE ────────────────

This change shipped 33 green assertions with a file that does not compile, twice.
The fold tests read source as TEXT — that is their whole method — so a syntax
error is invisible to them.

The first: a braced JSX comment inside a ternary's parentheses, where the
contents must be one expression. A braced comment is a CHILD, legal between
siblings and not there, and it fails six lines further down.

The second is better: rewriting that comment to explain the first, using the
braced form as the example, ENDED the comment — the sequence that closes a block
comment appears inside those braces. Describe it; do not quote it. The note in
Spending.tsx now says so.

`tsc` runs first in the landing script for this reason. A suite that reads files
is not a compiler.

Gates: tsc, vitest, a11y, motion, lint, nav-audit clean, the build. The
dead-export audit is still 3 against a ceiling of 2 — somebody else's drift, in
three components this does not touch.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: One fold, two rooms
 Push — Vercel rebuilds. /financial/wallet and /financial/spending
 open with their long lists closed, and the app has one
 disclosure instead of one per hub.
===============================================================

DONE
