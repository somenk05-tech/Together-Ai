#!/bin/bash
# land-an-afternoon-of-small-rooms.sh — one commit for three changes, at the
# owner's word: they were built back to back on one tree and asked to land
# together rather than one at a time.
#
#   1. TWO TABS AND A FOLD. The profile's "Photos & Analysis" / "Your Details"
#      become the market's own chip button, at 12.5px instead of 10.5px; the
#      biomarker correlation panel folds like everything else on that page.
#
#   2. A HIDDEN SURFACE IS DECLARED HIDDEN. Activity Dating comes off the
#      Dating menu — page, engine and route untouched — and BOTH hidden
#      surfaces are finally named in nav-audit, which has been failing on
#      /beauty/makeup since 11 Aug. It prints clean now.
#
#   3. EVERY PICTURE, ON THE PHONE. A post with four photographs was showing
#      one. The poster scrolls sideways below 560px, where it is the whole
#      column; above that nothing changes and the extra pictures are not even
#      fetched.
#
# THE COST OF ONE COMMIT, SAID PLAINLY: none of the three can be reverted
# without the other two. They are small UI changes in one package and that is
# an acceptable trade, but it is a trade — the three separate scripts these
# replace are superseded and go to _to_delete/superseded-scripts/.
#
# WEB APP ONLY (together-city-react). Vercel. No API change, no schema.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="An afternoon of small rooms"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# ── the tree carries these nine files, and nothing else that matters ───────
#
# ANOTHER SESSION HAS BEEN COMMITTING TO THIS REPO ALL AFTERNOON — five commits
# landed on top of these changes while they were being written. That is exactly
# what this check is for: anything else dirty in either package stops the run
# and gets named. Read the list before overriding anything.
ALLOWED='^(M |MM| M) together-city-react/(scripts/nav-audit\.mjs|src/(app/(a-read-section-folds-itself|city-wall|one-bag)\.test\.ts|config/hubs\.ts|features/(beauty/pages/Profile\.tsx|social/Poster\.tsx)|styles/(layout|relief)\.css))$'
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
verify 5db17504c283e7e87a87eee0438450b2544f47b074141da0ab2f4116ba1cbd3a scripts/nav-audit.mjs
verify 224b3f6eaa564b0727ca76ac6911c80fa896f1d45946be26c212e2dd131ebeff src/app/a-read-section-folds-itself.test.ts
verify a28c7c91c6b242b3611cae8c5e11c9e2fc1283f39df096d7b6610d7475124384 src/app/one-bag.test.ts
verify 68fa3e63f3652e68e041cbdd87af048ba509d3c1fbd83a6f9bca15ea27031702 src/app/city-wall.test.ts
verify ebd54207b9d086f8749e1584547920e24cd36d8352570a196ae129527871a744 src/config/hubs.ts
verify 624097e320fd8e4ddbf791c24018ac77d34e094e67744c5b76c6781aa1e72f9a src/features/beauty/pages/Profile.tsx
verify e5780acd585ab9005d15c537ad0ffca9cef59ea3c5d00efe955da58459d41324 src/features/social/Poster.tsx
verify 062931dc867bbb2d3f5fb1a37aae768884e19a255d190fb797014096515d07ea src/styles/layout.css
verify d6d9bd6a1ec0cd949b96e20da12a59ca5c06dad8216ff39e3c5ff4a61ded581e src/styles/relief.css
echo "== all nine files verified"

cd together-city-react

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: vitest"
npx vitest run

echo "== gate: the ceilings"
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/lint-ceiling.mjs

echo "== gate: nav-audit, which this commit makes CLEAN"
# Asserted outright rather than measured against a baseline: this is the commit
# that fixes it. If it prints a problem, part 2 did not do what it says.
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

git add together-city-react/scripts/nav-audit.mjs \
        together-city-react/src/app/a-read-section-folds-itself.test.ts \
        together-city-react/src/app/one-bag.test.ts \
        together-city-react/src/app/city-wall.test.ts \
        together-city-react/src/config/hubs.ts \
        together-city-react/src/features/beauty/pages/Profile.tsx \
        together-city-react/src/features/social/Poster.tsx \
        together-city-react/src/styles/layout.css \
        together-city-react/src/styles/relief.css

git commit -F - <<'MSG'
An afternoon of small rooms

Three changes in one commit, at the owner's word. They were built back to back
on one tree and asked to land together. The cost, said plainly: none of them can
be reverted without the other two. Small UI changes in one package make that an
acceptable trade, but it is a trade.

═══ 1. TWO TABS AND A FOLD ════════════════════════════════════════════════════

"Photos & Analysis" and "Your Details" were 10.5px tracked capitals with a
one-pixel underline under the live one. Nothing about that said press me, and
the live tab differed from the dead one by being slightly darker.

They were a rule and not a pill on purpose, and that argument survives being
overruled: one rounded control among printed plates is the single object on the
page from another design. It was about a SEGMENTED control and still holds
against one. It did not hold against these, because THE HUB ALREADY OWNS THIS
BUTTON — the market's category filters are exactly the object needed, so
borrowing it is the opposite of importing a control from elsewhere, and the
accent pair is one relief.spec already measures. 12.5px with real padding. The
strip loses its underline: a rule beneath filled buttons is the leftover of the
idiom they replaced.

AND THE BIOMARKER PANEL FOLDS. It was the longest read-once block on that page
and the only one still printing itself back every visit. The marker count and
the panel date move into the meta line, because a closed section reading only
its own name gives nobody a reason to open it. The no-panel branch stays open —
it is an invitation to add a blood test, and a fold is a good way to make an
invitation invisible.

One guard had to be told why its number moved: the page has three
`beauty-sheet`s now, not four. A leaf's open body is `.beauty-leaf-open` — same
cream, same hairline, same lift, same entry in the ink-restore list. The panel
did not lose its surface, it changed shape. The count drops to three AND the
leaf is pinned by name, because "at least four of this string" could never say
which panel lost its paper.

═══ 2. A HIDDEN SURFACE IS DECLARED HIDDEN ════════════════════════════════════

Activity Dating comes off the Dating menu, explicitly "for now" — which is why
nothing else moved. Page, invitation engine and every endpoint untouched, and
the path still resolves. Dating Chats moves 04 → 03; a menu that counts 01-02-04
advertises the thing it is trying not to advertise.

HIDING A SURFACE HAS TWO HALVES: off the menu, and named in nav-audit so the
audit knows the silence is deliberate. A route nothing links to is either hidden
on purpose or stranded by accident and the audit cannot tell which.

THE MAKEUP STUDIO ONLY EVER GOT THE FIRST HALF, on 11 Aug. nav-audit has printed
one problem ever since — the red main that four landing scripts today have had
to measure themselves against and explain in their own output. An audit expected
to fail is an audit nobody reads. Both entries are in, and it prints clean: 382
files, 179 declared routes.

The numbering guard was written that same day with a note claiming it caught a
gap in "any hub's sidebar". It read the beauty block alone, and the first hub to
lose a page afterwards was a different one — which is how a guard scoped to one
example fails: not by breaking, but by being silent elsewhere. It walks all
sixteen hub blocks now and names the hub when it fails.

═══ 3. EVERY PICTURE THE POST CARRIES, ON THE PHONE ═══════════════════════════

A post with four photographs was showing one of them. Below 560px the wall is a
single column and the poster IS the post, so three quarters of what somebody
uploaded existed only for whoever opened it.

NO ARROWS, NO DOTS, NO AUTOPLAY — the same call the Astrology arc made, and here
it is not only taste: the poster is one button by design, so a control inside it
would be a tap target stacked inside a tap target. A swipe is not a click, so
the strip cannot open the post by accident.

`overflow-y: hidden` is load-bearing. A scroll container cannot honour
`overflow-y: visible` — the browser computes the other axis to auto — so leaving
it out gives every poster vertical scroll behaviour it never asked for. That
trap is written down two hundred lines up, about the arc. `mandatory` snap
rather than the arc's `proximity`, because each picture fills the frame and
there is no legitimate place to rest between two.

ABOVE THE PHONE, NOTHING CHANGES. The markup is the same at every width and
`display: none` on the siblings stops them being fetched, so the desktop wall
costs what it costs today.

THE BADGE SAYS HOW MANY, NEVER WHICH. Nothing tracks the scroll position, and
"1/4" while somebody looks at the third is worse than no badge. It is
aria-hidden and the count is repeated in the button's accessible name — the only
thing this poster announces — so it is not sighted-only information.

Four new assertions, including one that fails if the cover mapping is ever
simplified to `m.url`: that would render blank frames for coverless videos,
which looks exactly like a broken image.

── AND WHAT IS STILL WRONG, WHICH THIS COMMIT DOES NOT TOUCH ──────────────────

dead-export-audit reads 3 against a ceiling of 2 — useGemCommission,
MedicalAdvisories, PlanGuidanceBanner. Somebody else's drift, in three
components none of this reaches, still measured against main rather than
absorbed. And in the API package, scripts/lint-ceiling.json says 124 while the
tree measures 127.

Gates: tsc, vitest, a11y, motion, lint, nav-audit clean, the build.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: An afternoon of small rooms
 Push — Vercel rebuilds.
   /beauty/profile   two buttons, one less block to scroll past
   /dating           Activity Dating off the menu, still standing
   the city feed     four photographs are four photographs
 And nav-audit is clean for the first time since 11 Aug.
===============================================================

DONE
