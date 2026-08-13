#!/usr/bin/env bash
# land-the-built-day-takes-its-paper.sh  ·  run from the REPO ROOT
#
# "Create Your Own Meal Plan" printed a day on white while the Weekly Meal
# Planner printed the SAME day on that weekday's sheet. The page already used
# the planner's markup — press-sheet, press-hero, press-stats, press-course,
# press-grid, press-aside, press-foot — and its own doc comment says the two
# days must not drift apart. It used the press's TYPE and not its SURFACE.
#
# It now wears `.press-recto` under `data-paper`, so a Thursday built by hand
# comes out on Thursday's paper, in Thursday's inks, exactly as the engine's
# Thursday does — and every other day follows its own sheet.
#
# `.press-recto` rather than a new papered class of its own, deliberately: the
# recto is what carries the ground, the veil and the re-pointed ink scale, and
# a second papered class is a second place to fix a paper. The paper KEY moves
# to planDates.ts beside the other calendar facts, so the two pages cannot
# disagree about which sheet a Thursday prints on.
#
# Verified through the bridge: tsc clean, lint 0, nav/a11y/motion at their
# ceilings, OwnDayView still in the press wearer list, PressDay no longer keeps
# its own copy of the key.
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
printf '%s\n' "$LOG" | grep 'The built day takes its paper' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Every sheet can be sent' >/dev/null; [ $? -eq 0 ] || die "run land-every-sheet-can-be-sent.sh first - this lands on top of it"
ok "the sends are in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
# Tolerates the chat voice/file change waiting behind it by name — those edits
# were made after this script was written, and it verifies and commits only its
# own three files (hashes below).
ALLOWED_IN='^((M |MM| M) (together-city-react/src/(features/(nutrition/(planDates\.ts|components/(PressDay|OwnDayView)\.tsx)|chat/components/(Composer|MessageThread)\.tsx)|api/(schemas|chat\.api|index)\.ts|types/index\.ts|styles/relief\.css)|together-city-chat/(prisma/schema\.prisma|src/messages/(dto/messages\.dto\.ts|messages\.service\.ts)))|\?\? together-city-chat/prisma/migrations/20260813230000_attachment_name/)$'
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
verify cc21b500a1319ae28bcb4951d87f1c7968f57db2265a41c9019c009b5c994a21 "$W/src/features/nutrition/planDates.ts"
verify 7e06d359a9e372b5d61cdf6027e96ec1446a684c26ad1a53bc43ed7c19d23bc4 "$W/src/features/nutrition/components/PressDay.tsx"
verify d1045719b0a1da969bb9fdc89f111e6b12e9bf80c9a3149c67caf8ad2767ae91 "$W/src/features/nutrition/components/OwnDayView.tsx"

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
node scripts/paper.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/nutrition/planDates.ts \
        $W/src/features/nutrition/components/PressDay.tsx \
        $W/src/features/nutrition/components/OwnDayView.tsx \
        land-the-built-day-takes-its-paper.sh

git commit -F - <<'MSG'
The built day takes its paper

"Create Your Own Meal Plan" printed its day on white while the Weekly Meal
Planner printed the same date on that weekday's sheet. The page was already
built out of the planner's own markup - press-sheet, press-hero, press-stats,
press-course, press-grid, press-aside, press-foot - and its doc comment says
why: "the same classes, so the two days cannot drift apart when the press is
retouched." It had taken the press's TYPE and left its SURFACE, so a Thursday
somebody assembled by hand and the same Thursday the engine composed were one
design printed on two different papers, for no reason a reader could see.

The hand-built day now wears `.press-recto` under `data-paper`, and every day
follows its own sheet.

IT WEARS THE RECTO RATHER THAN A PAPERED CLASS OF ITS OWN, which is the whole
decision. The recto is what carries the ground, the veil and the re-pointed
city ink scale that every Relief component inside a sheet reads; a second
papered class would be a second place to fix a paper, and the reason this page
looked wrong is that it already had a second way of being a sheet. Nesting the
grid inside the recto changes no layout: the recto is a flex column and a lone
flex child stretches.

THE PAPER KEY MOVES TO planDates.ts, beside the other calendar facts, and
PressDay reads it instead of keeping its own array. Two pages that print a day
now cannot disagree about which sheet a Thursday prints on - a second copy of
that array is exactly how one of them would come out on Wednesday's.

No new CSS, no new tokens, no new class. OwnDayView keeps its place in the
press wearer list; the list is the same three files.
MSG

ok committed
say "review, then:  git push"
