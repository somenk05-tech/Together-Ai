#!/usr/bin/env bash
# land-both-keys-on-the-left.sh  ·  run from the REPO ROOT
#
# The attach and record keys move together to the left of the composer, and
# Send keeps the right corner permanently (owner's call, 13 Aug).
#
# WHY IT IS BETTER, AND NOT ONLY DIFFERENT. The microphone used to sit in the
# right corner and swap with Send the moment there was text — so the key under
# your thumb changed identity as you typed, and the one place a composer must
# be predictable is the corner you press without looking. Attaching a file and
# recording a voice note are the same kind of act — putting something into the
# message that is not typing — so they read as one object on the left, and the
# right belongs to Send alone.
#
# Send is DISABLED rather than absent when there is nothing to send: the
# capsule keeps its shape as you type, and `.cssend[disabled]` was already
# drawn as a hollow key for exactly this state ("DISABLED IS A HOLLOW KEY, NOT
# A FADED ONE" — relief.css). Nothing new was invented to make this work.
#
# Verified through the bridge: tsc clean, lint 0, a11y and motion at their
# ceilings.
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
printf '%s\n' "$LOG" | grep 'Both keys on the left' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The room takes a voice and a file' >/dev/null; [ $? -eq 0 ] || die "run land-the-room-takes-a-voice-and-a-file.sh first - this moves the keys it added"
ok "the keys are in, this moves them"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/(features/chat/components/Composer\.tsx|styles/relief\.css)$'
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
verify 644a021e7affcce1ff4c9e3813287b28870d962eb6b6e4fa99966f033daa77bd "$W/src/features/chat/components/Composer.tsx"
verify 6ca892eee54ca03b7c4b715b47973e5acb4479a9e02b3cac25abf5f663f647d8 "$W/src/styles/relief.css"

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
git add $W/src/features/chat/components/Composer.tsx $W/src/styles/relief.css land-both-keys-on-the-left.sh
git commit -F - <<'MSG'
Both keys on the left

Attach and record move together to the left of the composer, and Send keeps
the right corner permanently.

THE MICROPHONE USED TO SWAP WITH SEND. It sat in the right corner and gave
way the moment there was text, which read well as a rule and badly as a
thumb: the key in that corner changed identity while you typed, and the one
place a composer has to be predictable is the corner people press without
looking. Attaching a file and recording a voice note are the same kind of act
- putting something into the message that is not typing - so they are one
object now, grouped tight to each other and spaced from the field, and the
right corner belongs to Send alone.

SEND IS DISABLED, NOT ABSENT, when there is nothing to send: the capsule
keeps its shape as you type rather than growing a key, and
`.cssend[disabled]` was already drawn as a hollow key for exactly this state.
Nothing was invented to make this work - the class, the target size and the
disabled treatment all existed.

One CSS group (`.cstools`) and one reordering. No new tokens, no new
behaviour, and both keys keep the 42px target the send has.
MSG

ok committed
say "review, then:  git push"
