#!/usr/bin/env bash
# land-the-whole-routine-goes-in-at-once.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug: a button that adds the complete routine, on a phone and at a
# desk.
#
# THIS BUTTON EXISTED AND WAS REMOVED, at the owner's word, on an objection
# that was correct and is still in the file: adding ten products in one tap is
# the one bag action nobody can undo in one tap. So it comes back ANSWERED
# rather than merely overruled — `addAll` returns the bag it replaced,
# `restore` puts it back, and the page offers Undo only while the bag still
# matches what the press wrote. One tap on any step's + or -, or another
# surface touching the same bag, and the offer retires itself rather than
# quietly throwing away what came after it.
#
# IT TOPS UP, IT DOES NOT RESET. Quantities already in the bag are kept, ids
# that were missing arrive at one, nothing is ever removed — so pressing it
# twice buys nothing the first press did not, and the label says "Add the
# remaining 7" when seven is what is left. `everyStep` is keyed by productId,
# so a cleanser used morning and evening is one bottle, not two.
#
# ONE CONTROL, RENDERED TWICE, which is the mobile half of the ask: the summary
# card that prices the routine is a long scroll above the decision on a phone,
# and a button you have to scroll back up to is a button on a desk. Written
# once so the two placements cannot drift.
#
# NO SERVER CHANGE. PUT /beauty/bag already replaces the whole bag wholesale.
#
# ONE GATE IS RUN AS A REPORT, NOT A REFUSAL: dead-export-audit is at 3 against
# a ceiling of 2 on `main` already, for useGemCommission, MedicalAdvisories and
# PlanGuidanceBanner - none of which this commit touches. The step below fails
# if that list CHANGES, which is the part this commit can be responsible for.
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
git log --oneline -40 | grep 'The whole routine goes in at once' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
A="$W/src/features/beauty/api.ts"
P="$W/src/features/beauty/pages/Routine.tsx"
C="$W/src/styles/layout.css"
T="$W/src/app/the-whole-routine-goes-in-at-once.test.ts"
grep -q 'addAll: (ids: string\[\]) => {' "$A" || die "api.ts has no addAll"
grep -q 'restore: (prev: { id: string; qty: number }\[\]) => put(prev)' "$A" || die "api.ts has no restore"
grep -q 'export const bagKey' "$A" || die "api.ts has no bagKey"
grep -q 'const canUndo = Boolean(addedAll)' "$P" || die "Routine.tsx has no undo gate"
[ "$(grep -c '{addWhole}' "$P")" = "2" ] || die "the control is not rendered in both places"
grep -q '.routine-addall {' "$C" || die "layout.css has no .routine-addall"
[ -f "$T" ] || die "the guard test is missing"
ok "all four files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(beauty/api\.ts|beauty/pages/Routine\.tsx|styles/layout\.css|the-whole-routine-goes-in-at-once\.test\.ts|land-the-whole-routine-goes-in-at-once\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-whole-routine-goes-in-at-once.test.ts || die "the add-all guard"
# The three specs that read this page and this bag as source text. Named
# because a change here is exactly the kind that breaks one of them silently.
npx vitest run src/app/one-bag.test.ts src/app/budget-is-on-the-page.test.ts \
               src/app/a-routine-counts-down-to-its-next-order.test.ts \
               src/app/one-routine.test.ts src/app/shelf-is-browsable.test.ts \
  || die "the routine's existing guards"
ok "the add-all guard and all five routine/bag guards pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
# dead-export is over its ceiling on main; assert the LIST is unchanged.
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] \
  || die "dead exports changed: $DEAD"
note "dead-export still 3/2 - the same three as on main, none of them this commit's"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$A" "$P" "$C" "$T" land-the-whole-routine-goes-in-at-once.sh
git commit -q -m "The whole routine goes in at once

A button that adds every step of the routine to the bag, in the summary card
and again at the foot of the sheet - the second one because on a phone the
first is a long scroll above the point where the decision is made.

IT COMES BACK ANSWERED. This button was removed at the owner's word on the
grounds that adding ten products in one tap was the one bag action nobody
could undo in one tap. addAll now returns the bag it replaced and restore puts
it back, and Undo is offered only while the bag still matches what the press
wrote - so it can never discard a change made after it.

The merge is a top-up: quantities already in the bag are kept, missing ids
arrive at one, nothing is removed. Pressing twice buys nothing the first press
did not, and the label counts what is actually left to add. Keyed by productId,
so a cleanser used morning and evening is one bottle.

No server change - PUT /beauty/bag already replaces the bag wholesale." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
