#!/usr/bin/env bash
# land-the-key-is-yours-to-type.sh  ·  run from the REPO ROOT
#
# The Short key field starts empty and stays empty until somebody types in it.
#
# IT WAS MIRRORING THE NAME. Type "together" into Name and "together" appeared
# in Short key, character by character, in a box nobody had touched. That reads
# as a decision already taken on your behalf rather than a suggestion — and it
# is the one field on the sheet you cannot change later, because the key is the
# project's URL and the address it accepts mail at.
#
# THE SUGGESTION SURVIVES, IN THE PLACE A SUGGESTION BELONGS: the name-derived
# key is the field's PLACEHOLDER, and it is what gets created if the field is
# left alone. Nothing is lost and nothing is presumed — the line above the
# button already spells out the full address, so what will be created is on
# screen before the button is pressed either way.
#
# One file, one page, no API change.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit clean.
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
printf '%s\n' "$LOG" | grep 'The key is yours to type' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The mailbox has rooms' >/dev/null; [ $? -eq 0 ] || die "run land-the-mailbox-has-rooms-2.sh first - this fixes the sheet it added"
ok "the rooms are in, this fixes their sheet"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/mail/pages/Projects\.tsx$'
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
verify 3b3be2add7b20dad508ecfb3f94f3996498c869c1e6edf1e0249709eb33e8cd9 "$W/src/features/mail/pages/Projects.tsx"

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
git add $W/src/features/mail/pages/Projects.tsx land-the-key-is-yours-to-type.sh
git commit -F - <<'MSG'
The key is yours to type

The Short key field on New project starts empty and stays empty until
somebody types in it.

IT WAS MIRRORING THE NAME. Typing "together" into Name put "together" into
Short key, character by character, in a box nobody had touched. A field that
fills itself while you are looking at a different one reads as a decision
already taken on your behalf rather than a suggestion you can take or leave -
and this is the single field on the sheet that cannot be changed afterwards,
because the key is the project's URL and the address it accepts mail at.

THE SUGGESTION SURVIVES, IN THE PLACE A SUGGESTION BELONGS. The name-derived
key is the field's placeholder now, and it is still what gets created if the
field is left alone, so nothing is lost and nothing needs typing twice. What
will actually be created was already on screen either way: the line above the
button spells out the whole address, and it follows the typed key or the
derived one exactly as the create will.

One page. No API change - the key was always normalised server-side, and it
still is.
MSG

ok committed
say "review, then:  git push"
