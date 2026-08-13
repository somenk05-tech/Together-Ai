#!/usr/bin/env bash
# land-every-sheet-can-be-sent.sh  ·  run from the REPO ROOT
#
# "Send to chat" reaches the surfaces that lost it and the ones that never had
# it: the printed course, the whole day, the grocery sheet, the recipe page.
#
# THE REGRESSION FIRST. ComposedMealCard carried a send on its photo corner.
# The printed day replaced that card on the individual planner (7 Aug) and on
# the family planner (tonight) — and the affordance did not travel with it.
# Every meal on both planners had quietly lost the ability to be sent.
#
# ONE BUILDER, so a meal sent from a card and a meal sent from a sheet are the
# same card: mealShareCard moves out of ComposedMealCard.tsx into shareMeal.ts
# beside the encoder it already used, joined by dayShareCard and
# groceryShareCard.
#
# THE DAY AND THE LIST CARRY THEIR CONTENT AND NO LINK, deliberately: there is
# no self-contained page for either, and the only links available
# (/nutrition/weekly, /nutrition/grocery) would open the RECIPIENT'S own plan
# and basket while claiming to be the sender's. The chat card renders items,
# so the menu and the shopping lines travel inside it. A meal still deep-links,
# because /nutrition/shared-meal is self-contained and needs no lookup.
#
# Verified through the bridge: tsc clean, lint 0, nav/a11y/motion at their
# ceilings, and the press wearer list still reads exactly its three files.
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
printf '%s\n' "$LOG" | grep 'Every sheet can be sent' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The list sheds two cards' >/dev/null; [ $? -eq 0 ] || die "run land-the-list-sheds-two-cards.sh first - this lands on top of it"
ok "the cards are shed, this is not in"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/(nutrition/(shareMeal\.ts|components/(ComposedMealCard|PressCourse|PressDay|GroceryPlanner)\.tsx|pages/RecipeDetail\.tsx)|family/pages/Weekly\.tsx)$'
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
verify 6c957c4fb23f5b3e94e8e704871f5d175dd4684b31829a0519600be9496fc4fb "$W/src/features/nutrition/shareMeal.ts"
verify d45491116cba3be21fee15c4ec778c79bde9f846e73291235e25c11cd4c08e42 "$W/src/features/nutrition/components/ComposedMealCard.tsx"
verify b335bdb050d858cc812bb66d6124980e422cc50415689d6a7911fe31d8b75a5b "$W/src/features/nutrition/components/PressCourse.tsx"
verify 633b703f63a843bee0aaa56d8ed3f8a7a960f4fabd59a479f614af012dd2c472 "$W/src/features/nutrition/components/PressDay.tsx"
verify d1dbd6525c95c521c18a8fe77e8113b47c46398f40555b0f99567166b5e3fe26 "$W/src/features/nutrition/components/GroceryPlanner.tsx"
verify 43933c5b8eaed759a6060d4d6a5762eafad9aaa43cf643ac541850680c8c59a5 "$W/src/features/nutrition/pages/RecipeDetail.tsx"
verify 3fcc748cddb4fcb123643dc304886284d7795636bd3797647e8440fe2ee6b2d5 "$W/src/features/family/pages/Weekly.tsx"

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "5 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/nutrition/shareMeal.ts \
        $W/src/features/nutrition/components/ComposedMealCard.tsx \
        $W/src/features/nutrition/components/PressCourse.tsx \
        $W/src/features/nutrition/components/PressDay.tsx \
        $W/src/features/nutrition/components/GroceryPlanner.tsx \
        $W/src/features/nutrition/pages/RecipeDetail.tsx \
        $W/src/features/family/pages/Weekly.tsx \
        land-every-sheet-can-be-sent.sh

git commit -F - <<'MSG'
Every sheet can be sent

Send-to-chat reaches the surfaces that lost it and the ones that never had
it: the printed course, the whole day, the grocery sheet, the recipe page.

THE REGRESSION FIRST, because it is the reason this is not a feature commit.
ComposedMealCard carried a send on its photo corner. The printed day replaced
that card on the individual planner on 7 Aug and on the family planner
tonight, and the affordance did not travel with it - so every meal on both
planners had quietly lost the ability to be sent, on the exact surface people
read their week on. A share button that exists on the page a redesign
deleted, and not on the page that replaced it, is worse than never having
shipped one.

ONE BUILDER. mealShareCard moves out of ComposedMealCard.tsx into
shareMeal.ts, beside the encoder it already called, joined by dayShareCard
and groceryShareCard. A meal sent from a card and the same meal sent from a
sheet are now the same card by construction rather than by two copies
agreeing.

THE DAY AND THE LIST CARRY THEIR CONTENT AND NO LINK, and the absence is the
decision. There is no self-contained page for a day or a basket, and the only
links available - /nutrition/weekly, /nutrition/grocery - would open the
RECIPIENT'S plan and the RECIPIENT'S basket while presenting as the sender's.
The chat card renders `items`, so the menu travels as its courses and the
list as its lines; the list's cap is stated as "+N more" rather than silently
truncated, because a list that quietly stops at twelve is one somebody shops
from and comes home short. A meal still deep-links: /nutrition/shared-meal
carries the whole meal in the token and needs no lookup.

TWO VERBS ON THE RECIPE PAGE. What was there hands the URL to the operating
system or the clipboard, and is now labelled "Copy link" for what it does.
Beside it, Send puts the recipe into the city's own chat as the card every
hub sends - the only way to send a recipe to somebody in the app was
previously to copy a link and paste it.

The buttons read their sheet's ink: `ghost` on the press papers, which
re-point --line and --muted per sheet, and explicit --grocery-ink on the blue
sheet, which re-points its own scale and not the city's. No page gained
data-press: the wearer list still reads exactly its three files.
MSG

ok committed
say "review, then:  git push"
