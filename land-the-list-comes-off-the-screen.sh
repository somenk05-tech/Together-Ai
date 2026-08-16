#!/usr/bin/env bash
# land-the-list-comes-off-the-screen.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug: a download for the grocery list.
#
# WHAT IS DOWNLOADED IS THE SHEET, AND THE MECHANISM IS PRINT. The list has been
# a printed checklist since the 13 Aug reference - masthead, aisle sections,
# tick boxes, dotted leaders running to right-aligned quantities - so the file
# worth having is that sheet, and every print dialog on every platform already
# offers "Save as PDF". Considered and rejected: a hand-built PDF (a second
# layout to keep in step with this one, a library to carry, and a file nobody
# could send to an actual printer) and a .txt (throws away the boxes, which are
# the reason a grocery list leaves the house).
#
# THIS IS THE FIRST @media print BLOCK IN THE CITY, so three rules it sets are
# pinned by the guard rather than left for the next person to rediscover:
#
#   1. Only the sheet prints, hidden by VISIBILITY not display. Collapsing the
#      chrome with display:none leaves the sheet wherever the flow put it and
#      page one comes out with a header-shaped hole in it.
#   2. The colour re-point lives in tokens.css - the whole --grocery-* scale
#      flips to black on white in ONE block and every rule in relief.css
#      inherits it untouched. A print rule that re-states an ink is a colour
#      decision in the wrong file, which relief.spec already forbids on screen.
#      It also stops a page of ink being spent reprinting a photograph of blue
#      card that the paper is not.
#   2b. AND SO DOES THE PAPER. The first cut of this wrote
#      `background-color: #fff` into the print block and relief.spec failed it
#      twice - once as a surface literal in the material file, once as a lit
#      ground in it. Both are the same rule as (2) and both are right: a white
#      surface written into relief.css is a colour decision taken in the file
#      nobody repaints. It is `--grocery-paper` now, transparent on screen
#      because there the ground IS the photograph.
#   3. The tick boxes survive. Hiding "every button in the sheet" would take
#      them with the two controls, and a checklist with no boxes is a receipt.
#
# Rendered before it was written and again after: the sheet was put through a
# headless Chromium at 390px, then under print media, then to A4 PDF. Chrome
# gone, controls gone, one column, black on white, boxes intact - an already
# ticked item prints ticked and struck through.
#
# SEVEN API SUITES ARE RED ON MAIN and none of them is this commit's; this
# commit touches no API file at all, so the API is not built or tested here.
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
git log --oneline -40 | grep 'The list comes off the screen' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
G="$W/src/features/nutrition/components/GroceryPlanner.tsx"
R="$W/src/styles/relief.css"
T="$W/src/styles/tokens.css"
S="$W/src/app/the-list-comes-off-the-screen.test.ts"
for f in "$G" "$R" "$T" "$S"; do [ -f "$f" ] || die "missing $f"; done
grep -q 'className="gsheet-print"' "$G" || die "no Download control"
grep -q 'window.print()' "$G" || die "the control does not print"
grep -q '@media print' "$R" || die "relief.css has no print block"
grep -q -- '--grocery-ink:    #000;' "$T" || die "tokens.css does not re-point the ink for paper"
grep -q -- '--grocery-paper:  #fff;' "$T" || die "the print paper is not a token"
grep -qE 'background-color: #(fff|ffffff)' "$R" && die "a white literal is back in the material file"
ok "all four files carry it"

# This commit is frontend-only on purpose: nothing it does needs the API.
git status --porcelain -uall together-city-chat | grep -q . \
  && note "together-city-chat has changes in the tree; none of them are this commit's and none are staged"

STRAY="$(git status --porcelain -uall | grep -Ev '(nutrition/components/GroceryPlanner\.tsx|styles/relief\.css|styles/tokens\.css|the-list-comes-off-the-screen\.test\.ts|land-the-list-comes-off-the-screen\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-list-comes-off-the-screen.test.ts || die "the print guard"
# relief.spec is the one most exposed by a stylesheet change: it forbids a
# chromatic hex outside tokens.css, which is exactly what a print block would
# reach for. tap-targets covers the new control's 44px pattern.
npx vitest run src/app/relief.spec.ts src/app/tap-targets.test.ts \
               src/app/citizen-facing-copy.test.ts src/app/own-day.test.ts \
               src/app/profile-is-truth.test.ts \
  || die "relief / tap-targets / copy / grocery guards"
ok "the print guard and all five neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$G" "$R" "$T" "$S" land-the-list-comes-off-the-screen.sh
git commit -q -m "The list comes off the screen

A Download beside Send on the grocery sheet. What it downloads is the sheet:
the list has been a printed checklist since the reference art, so the file
worth having is that page, and every print dialog offers Save as PDF. A
hand-built PDF would have been a second layout to keep in step with this one
and a file nobody could send to a printer; a .txt would have thrown away the
tick boxes, which are the reason a grocery list leaves the house.

The city's first @media print block, so it sets three rules. Only the sheet
prints, hidden by visibility rather than display - display collapses the chrome
above and page one comes out with a header-shaped hole in it. The whole
--grocery-* scale re-points to black on white in ONE block in tokens.css, so
every rule in relief.css inherits the new ink untouched and no page of ink is
spent reprinting a photograph of blue card. And the tick boxes survive: hiding
every button in the sheet would have taken them with the two controls, and a
checklist with no boxes is a receipt.

Two columns become one on paper, an aisle never splits across a page, and the
ticked fill is a background so it carries print-color-adjust. Rendered headless
at 390px, under print media, and to A4 PDF before landing." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
