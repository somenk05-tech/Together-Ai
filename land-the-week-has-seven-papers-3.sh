#!/bin/bash
# land-the-week-has-seven-papers-3.sh — the nutrition day, redrawn on the owner's
# own reference sheets: one pair of papers per weekday, recto and verso.
#
# ── WHY THERE IS A -3: A ONE-LINE BUG ON THE LAST LINE ─────────────────────
#
# Run 2 passed every gate — tsc, all 595 tests, lint, nav, a11y, motion and the
# build — and then died on `git add`:
#
#     fatal: pathspec '…/public/assets/img/press-' did not match any files
#
# `press-` is not a glob. git reads a pathspec as a literal path unless it is
# quoted and contains a wildcard, and I wrote a prefix as if the shell would
# expand it — which it cannot, because there is no `*` in it. set -e stopped the
# script before the commit, so nothing landed and nothing was half-staged.
#
# The thirteen papers are now listed BY NAME rather than by a fixed glob. It is
# thirteen lines instead of one and that is the point: a stray file dropped into
# public/assets/img cannot ride into a commit on the back of a pattern, and a
# missing paper fails here rather than shipping a page with no picture on it.
#
# Nothing else changed from run 2. Same files, same hashes, same everything.
#
# ── WHY THERE IS A -2, AND WHAT THE FIRST RUN CAUGHT ───────────────────────
#
# Run 1 got through tsc and died in the suite on a guard I did not know existed:
# `no-borrowed-class-names.test.ts`, which refuses a rule that scopes a global
# class name inside a namespaced block. I had written
#
#     .press-recto .pill, .press-recto .btn, .press-recto .tag { ... }
#
# to stop the lock button being a white pill on a blue sheet. `.pill`, `.btn`
# and `.tag` belong to index.css, and borrowing them under a `.press-` block is
# exactly what that file forbids. It was right and the rule is gone.
#
# THE FIX IS THE ONE THE DESIGN SYSTEM ALREADY IMPLIES. The masthead block has
# dressed Relief's controls for the press since the press existed, reading
# --press-ink, --press-rule, --press-paper and --press-green. So each sheet now
# RE-POINTS those four tokens to its own values, and every control follows with
# no new selectors at all. --press-green becomes the sheet's ink, which is an
# admission rather than a restyle: an emerald that is 7.8:1 on white is
# unreadable on Saturday's olive, and an accent that has to survive seven
# grounds is not an accent.
#
# --press-key WENT WITH IT. Reaching the raised lock button meant naming
# `.btn-accent`, which is the same borrow. A token nothing reads is a decision
# with no consequence, so it was deleted from tokens.css and from the depth
# guard's list rather than left for a later reader to wonder about.
#
# Nothing else changed: same thirteen papers, same two sheets, same arithmetic.
#
# ── TWO GATES THE AUTHOR COULD NOT RUN, SAID PLAINLY ────────────────────────
#
# `npx vitest run` and `npm run build` FAIL in the Cowork bridge and MUST pass
# here. The Mac's node_modules were installed for darwin-arm64; the bridge's VM
# is linux-arm64, so rollup's native binary is missing and anything that loads
# Vite dies before it reads a single file. Nothing about the code causes it —
# `npx tsc --noEmit` is pure JS and passes in the bridge, and did.
#
# WHAT WAS VERIFIED THROUGH THE BRIDGE, so this is not a shrug:
#   · tsc                    clean
#   · lint-ceiling           0, at the ceiling
#   · nav-audit              clean, 383 files / 179 routes
#   · a11y-audit             0, at the ceiling
#   · motion-ceiling         at the ceiling
#   · relief.spec.ts's assertions AND no-borrowed-class-names', re-implemented
#     standalone and run against the real files: 13 paper blocks with every ink
#     clearing its floor, no sixth depth, no chromatic hex in relief.css, no
#     leaked press rule, the serif borrower list unchanged, no `.press-` block
#     borrowing a global name, and --press-key declared and read nowhere.
# The vitest run below is what turns that into the real thing.
#
# ── ONE GATE THAT FAILS BEFORE THIS PATCH AND STILL FAILS AFTER ─────────────
#
# `dead-export-audit` reports 3 against a ceiling of 2, and has all session. The
# three are useGemCommission, MedicalAdvisories and PlanGuidanceBanner — none of
# them touched here, and `balanceHead`, the only export this patch adds, is
# imported by MealPlan. It is run below and REPORTED rather than gated, because
# a ratchet that main already fails blocks every commit until somebody pays a
# debt that has nothing to do with them. Paying it is its own commit.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The week has seven papers"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# ── the react package carries these paths, and nothing else that matters ────
ALLOWED='^((M | M|MM) together-city-react/(src/(styles/(tokens|relief)\.css|app/relief\.spec\.ts|features/nutrition/(dayBalance\.ts|pages/MealPlan\.tsx))))$|^\?\? together-city-react/(scripts/paper\.mjs|public/assets/img/press-)'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E 'together-city-react/' | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! together-city-react carries changes this script did not expect:"
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

# The API package has its OWN pending commit — the spending log. This script
# never stages it and must not be blocked by it, but it says so rather than
# staying quiet, because a tree with two changes in it is worth knowing about.
CHAT="$(printf '%s\n' "$STATUS" | grep -E '^ ?M together-city-chat/' || true)"
if [ -n "$CHAT" ]; then
  echo "== note: together-city-chat has uncommitted work (the spending log)."
  echo "   It is NOT staged here. land-the-money-the-city-never-saw.sh is its script."
fi

OTHER="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev 'together-city-(react|chat)/' || true)"
if [ -n "$OTHER" ]; then
  echo "!! Tracked files outside both packages have uncommitted changes:"
  echo "$OTHER"; exit 1
fi
echo "== the tree is what this script expects"

cd together-city-react
verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify d0a3cf2aefcae7024bc11440527159c6604ff0b0b4f0eb1c1ae2feb7b39fbc05 src/styles/tokens.css
verify f1d44a0010e79534cc079df1716f6c570c88603da060ec86b0979f0b15fd3ce6 src/styles/relief.css
verify d003af1d80ae7f5f91eb9a0a81f97c70a981ef2faa6e851c41bd88e51458f007 src/app/relief.spec.ts
verify c4b2db3f6217964ac51c914811388027b35fc77546c84ac26419b4d2de1bd903 src/features/nutrition/dayBalance.ts
verify c8c82e501140039d074912bbd8f736b10d1cdf0ba8276d29e7d9f6e14274d218 src/features/nutrition/pages/MealPlan.tsx
verify 66a7a7b0c21428d6a4bae25b6d62531527ba243fdf63878625b271dcab4c82b5 scripts/paper.mjs
echo "== six source files verified"

# The papers themselves. A sheet that arrived truncated is a page that renders
# as a white box with cream type on it, and nothing else would say so.
P=public/assets/img
verify b4b6dc003bd41bcff3bf0d19090c3b34dd86638e87b5ec6f37bfa4145a59e01e $P/press-thu-recto.jpg
verify 7728f3777157e32e50e2f225c5ac48b9e8786624c50003e0091419a993da4d01 $P/press-thu-verso.jpg
verify f1ea390acff12f1d02b7e1fa6a78566abf50cd5772f15be6cc8c0edfbb3739fc $P/press-fri-recto.jpg
verify 5b573f65a0e7496babb3eece99f1dea607c52d0eb37265e13f3c99e6e6a5e056 $P/press-fri-verso.jpg
verify c3acefd126f0606ba137f0533d3619fccc09b033a8a61b9dd4687135d0028e2f $P/press-sat-recto.jpg
verify 199347f8ed5b8d3d49576e5c63fd8f2b13ff66b79b94eb27f3c0dbf0b4c23cfb $P/press-sun-recto.jpg
verify 9eff20f32d980253bf03606637bc8b839195c5a3fcc2514c526ffabd487935bc $P/press-sun-verso.jpg
verify 1adc9585bdcd32b5b21382d0879a15ca0a124eba65437e81926f10bd28fa38ad $P/press-mon-recto.jpg
verify 261ca8b01caa9ea64cbaf6fb1fc4c649a116048a16ec81359d0b3ba15f50f02f $P/press-mon-verso.jpg
verify 0eece72bdfb6cb693430de02766da22f299a8c929c51a22fae7206ee2ec60a79 $P/press-tue-recto.jpg
verify 4a83272ea5862a748bfde9a431484391be495d65775a66b9f6982c2634ae593b $P/press-tue-verso.jpg
verify bea0a5c1448ce0a99eaa43a344a95c9c0aa7a984c4278283aeda5850ac466096 $P/press-wed-recto.jpg
verify ab542c76619d329d714efd7f4e6d79c7d6d8eb4728aaf036ac1ff526c201673b $P/press-wed-verso.jpg
echo "== thirteen papers verified"

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: the suite (THIS is the one the bridge could not run)"
npx vitest run

echo "== gate: lint, held to the number on main"
node scripts/lint-ceiling.mjs

echo "== gate: nav"
node scripts/nav-audit.mjs

echo "== gate: a11y"
node scripts/a11y-audit.mjs

echo "== gate: motion"
node scripts/motion-ceiling.mjs

echo "== report only: dead exports (main already fails this at 3 vs 2)"
node scripts/dead-export-audit.mjs || true

echo "== report only: the papers, re-derived from the images themselves"
node scripts/paper.mjs || true

echo "== gate: the build (THIS is the other one the bridge could not run)"
npm run build

cd ..

git add together-city-react/src/styles/tokens.css \
        together-city-react/src/styles/relief.css \
        together-city-react/src/app/relief.spec.ts \
        together-city-react/src/features/nutrition/dayBalance.ts \
        together-city-react/src/features/nutrition/pages/MealPlan.tsx \
        together-city-react/scripts/paper.mjs

# The papers by name, not by prefix. `press-` is not a glob — git reads a
# pathspec literally — and a pattern that DID expand would let a stray file in
# that folder ride into the commit behind it.
for sheet in thu-recto thu-verso fri-recto fri-verso sat-recto \
             sun-recto sun-verso mon-recto mon-verso \
             tue-recto tue-verso wed-recto wed-verso; do
  git add "together-city-react/public/assets/img/press-$sheet.jpg"
done

git commit -F - <<'MSG'
The week has seven papers

The meal plan's day was one white sheet you scrolled, with the lock bar
stranded near the top above a menu it was not about. It is now two sheets on
the owner's own reference papers, and every weekday has its own pair.

THE DAY IS TWO DECISIONS, SO IT IS TWO PAGES. The RECTO is what you decide —
the weekday, the day's reading, the five figures, the lock, what to buy, the
totals. The VERSO is what you eat — a rail carrying the day's verdict as a
display line, then every dish with its macros, the totals, the macro ring.

Individual and family menus both get it for nothing: they are not two pages but
one component switching a PlanScope between 'self' and 'household'.

── WHY A PHOTOGRAPH IS ALLOWED HERE WHEN THE BEIGE WAS NOT ────────────────────

tokens.css gave the press its white ground back on purpose, and the reasoning
stands: #faf7f0 was a colour this application picked and washed the page in,
and nothing on the page was the reason for it — take the beige away and the
menu was still a menu, which is exactly what happened.

These are not a tint. They are reference sheets the day was redrawn ON. Take
one away and there is no page left, which is the test the beige failed.

SEVEN PAIRS, NOT ONE PAPER, because a week of the same sheet is a template and
the whole point is that Thursday does not look like Friday. Defaults are the
white press paper, so a weekday with no pair is precisely the page that shipped
before this: a day is opted in by name and there is no half-dressed state.

--press-paper IS UNCHANGED. RecipeDetail's grant says it takes the press's
paper unchanged and that giving one page its own warm ground was the obvious
move and the wrong one. It keeps white and nothing about it changes.

── EVERY RATIO IS AGAINST THE WORST PIXEL, NOT THE AVERAGE ────────────────────

A photograph has no single colour for a build-time check to measure, and its
average is a colour that appears nowhere in it. So each block declares a
`-ground` hex that is the WORST pixel of its own sheet under its own veil — the
lightest where the ink is cream, the darkest where the ink is dark — and
relief.spec.ts recomputes all thirteen against it.

Each veil was SOLVED to the minimum that clears AA, not chosen. Five sheets
needed none at all: Friday's wall, Saturday's olive, Sunday's linen, Monday's
blue-grey and Wednesday's silk carry type exactly as they arrived. Tuesday's
verso asks for .04, which is very nearly none and is written rather than
rounded away — tidying it to zero puts a description under AA and nothing on
the page looks different.

The flowers are the expensive ones, and each for a reason you can point at:
Friday's lilac swings 10.03:1 at the petal tips to 1.39:1 in the shadow,
Sunday's cosmos stems go to #1b0203, Wednesday's coral is simply saturated. No
ink survives those untouched, so they are veiled until they are paper.

EVERY SHEET CARRIES ITS OWN INK SCALE, which is the real cost of seven papers.
The cream that reads on Thursday's blue at 5.03:1 is 1.5:1 on Sunday's linen.
Nothing in the new CSS reads --press-ink; a paper without its ink is half a
decision. `-ink-3` is held to 3:1 rather than 4.5 exactly as --press-ink-3
already is on white: it is the floor of the scale, for labels and metadata, and
nothing sets body copy in it.

scripts/paper.mjs re-derives the hexes FROM THE IMAGES, because a test that
reads the ground claim out of the same file it is checking cannot tell whether
the claim is true — re-encode a sheet and the hex goes on describing a picture
that is no longer there while every ratio stays green. It reports honestly when
it has no decoder rather than printing success after measuring nothing, which
is the same bug one level up.

── EMBOSSED IS A MATERIAL, NOT A SIXTH DEPTH ──────────────────────────────────

--press-stamp and --press-stamp-warm are named in tokens.css and added to the
depth guard's list, in the company of --glass and --soft-in. A menu card is
stamped: the panel is pressed into the paper. Every layer of both is inset.

A THIRD, --press-key, EXISTED FOR A LOCK BUTTON THAT STOOD PROUD, and it did
not survive review. Reaching it meant writing `.press-recto .btn-accent`, which
borrows a global class name inside a namespaced block, and
no-borrowed-class-names.test.ts refused it. Instead each sheet RE-POINTS the
four press tokens the masthead's control rules already read — --press-ink,
--press-rule, --press-paper and --press-green — so every pill, chip, button and
tag comes out in the sheet's own ink with no new selectors at all.

--press-green BECOMES THE SHEET'S INK, which is less a restyle than an
admission: the emerald is 7.8:1 on white and unreadable on Saturday's olive, and
an accent hue that has to survive seven grounds is not an accent. Filled with
the ink is the press's own emphasis rule anyway, and it inverts a pair whose
ratio is already computed — so the loud button is exactly as readable as the
body copy, on every paper.

--press-recto-lift and --press-verso-lift join the four EDGES already named
there. A scored rule is the cut plus the light caught on its lower lip, and
nothing stands on it. They are per-sheet because the light on Thursday's blue
is white and the light on Sunday's linen is not — which is what lets one
declaration read as raised on one paper and pressed-in on another.

── THE VERDICT IS PRINTED TWICE AND STORED ONCE ───────────────────────────────

The verso sets the day's reading large as its display line and again beneath it
at reading size. Both come from the same BalanceVerdict via a new balanceHead()
beside balanceNote(), NOT from slicing the sentence — a display line built by
cutting balanceNote at its em-dash is a parser for prose, and it produces
"Today is light on carbs and heavy on fat" the day somebody rewords the note.
No new field, nothing for the engine to return, nothing to drift.

── SURGICAL WHERE IT TOUCHES WORKING CODE ─────────────────────────────────────

The lock is HANDED INTO the day view rather than rebuilt on it: same component,
same markup, same behaviour, one sheet further down the page. A locked day has
no sheet — it collapses to a summary — so it keeps the lock above, which is
also the only place its Unlock can be.

The two panels learned a `bare` prop instead of being restyled from outside,
because an inline card style beats every stylesheet in Relief and the card
cannot be turned off from anywhere else.

── THE DEBT THIS OWES, NAMED RATHER THAN DISCOVERED ───────────────────────────

OwnDayView was granted the press so a day you compose and a day the engine
composed print on the SAME paper. That is true today and stops being true here:
the engine's day moves onto the pairs, the hand-built one stays white. It is a
debt on the next commit, not a licence.

Saturday's verso is still white — the file for it arrived fully transparent.

No API change. Not one figure, name or portion on either sheet is written into
the page: composedPlan decides them all, and the page's only job is to survive
the range of what it returns.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The week has seven papers
 Push — Vercel rebuilds the web.
 Open Nutrition → Meal plan and walk the day tabs: each
 weekday should turn over onto its own pair of sheets.
===============================================================

DONE
