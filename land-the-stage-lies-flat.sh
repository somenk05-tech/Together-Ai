#!/usr/bin/env bash
# land-the-stage-lies-flat.sh  ·  run from the REPO ROOT
#
# The owner, looking at Rose Mascarpone live: "remove the raised feel of the
# chats and make everything flat... inside the chat box... also the mira
# button needs to be just the mira logo."
#
# Requires 'The stage takes a colour' in the log (this rides on its files).
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'The stage lies flat' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The stage takes a colour' >/dev/null
[ $? -eq 0 ] || die "base commit 'The stage takes a colour' is not here - run land-the-stage-takes-a-colour.sh first"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/relief.css" "$W/src/styles/mira.css" "$W/src/features/chat/pages/Chats.tsx" "$W/src/app/mira-reads-one-chat.test.ts" "$W/src/app/the-stage-lies-flat.test.ts" \
  | grep -Ev '(src/styles/(relief|mira)\.css|src/features/chat/pages/Chats\.tsx|src/app/(mira-reads-one-chat|the-stage-lies-flat)\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/relief.css"                     c06484a7ec8582d21b78081803074f6d033098e8028f570c7e1d9f45cbfc604c
check "$W/src/styles/mira.css"                       922fcfe3622a37e8899ccf59a8cddb9d742957a53530b66e8303572c414699f3
check "$W/src/features/chat/pages/Chats.tsx"         36060b589052159fb34247bb3ed4ba51e6233f943e2b8e78c5e55b3f6d7feba0
check "$W/src/app/mira-reads-one-chat.test.ts"       c53099fef337be432117645c02d635001e350191cfa698ad55af3a12141dd580
check "$W/src/app/the-stage-lies-flat.test.ts"       af9c354ff0ff3e9c7f595b0bb96073d0c0119bc5b34d8128803eeaeaa60636e0

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

say "5 - commit"
git add "$W/src/styles/relief.css" \
        "$W/src/styles/mira.css" \
        "$W/src/features/chat/pages/Chats.tsx" \
        "$W/src/app/mira-reads-one-chat.test.ts" \
        "$W/src/app/the-stage-lies-flat.test.ts" \
        land-the-stage-lies-flat.sh || die "git add"
git commit -F - <<'MSG' || die commit
The stage lies flat

"remove the raised feel of the chats and make everything flat... inside
the chat box... also the mira button needs to be just the mira logo" - the
owner, looking at Rose Mascarpone in production.

He was right about why, too. The neumorphic pair - soft-in pressing the
incoming bubble into the surface, soft-out raising the outgoing one off it
- was mixed for the near-black stage, where an 8px drop at 55% black
disappears into the ground and reads as craft. On the light themes the
same drop reads as a smudge under every bubble, and the screenshot showed
exactly that: pink room, brown shadows. Colour says who spoke now; depth
said it twice and said it loudest where it looked worst.

Seven rules go flat: the bubbles both ways, the selected row, the header
tools, the day pill, the composer capsule and the send key - plus the
search field's inline shadow. The soft-* tokens stay defined (the
profile's dark column still wears them); the chat rules just may not
reach for them any more, and the-stage-lies-flat.test.ts parses each
block and holds it. The disabled send keeps its hollow-key outline -
that one was information, not depth.

AND HER MARK GOES BARE. The Mira button in the thread header drops the
tool disc: just the ring, in her red, a size up (30), on the same 44px
target. The mark is the promise - this is Mira, the same one - and it
needs no chrome to say so.
MSG
ok committed
say "review, then:  git push"
