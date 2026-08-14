#!/usr/bin/env bash
# land-the-stage-takes-a-colour.sh  ·  run from the REPO ROOT
#
# The owner, with eight palette cards: "Add these color themes next tab next
# to the chats text so user can click one colour and the chat interface
# changes its color... apply this to all the chat system... Mira stays red."
#
# A swatch row under the Chats header: Slate (default), Navy Mirage, Emerald
# Depth, Mandarin Curd, Rose Mascarpone, Peach Glaze, Pistachio Mint Cream,
# Lavender Cream, Cream Veil. One tap re-grounds the whole stage; the choice
# is held per device. Mira's room takes no theme.
#
# Requires 'She reads one chat' in the log (this rides on that Chats.tsx).
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
printf '%s\n' "$LOG" | grep 'The stage takes a colour' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'She reads one chat' >/dev/null
[ $? -eq 0 ] || die "base commit 'She reads one chat' is not here - run land-she-reads-one-chat-2.sh first"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/tokens.css" "$W/src/styles/relief.css" "$W/src/features/chat/pages/Chats.tsx" "$W/src/app/the-stage-takes-a-colour.test.ts" \
  | grep -Ev '(src/styles/(tokens|relief)\.css|src/features/chat/pages/Chats\.tsx|src/app/the-stage-takes-a-colour\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/tokens.css"                        fe85713ee95fb268a6d24d65a800793433d5dd4fd9490fe12615b690cbda8558
check "$W/src/styles/relief.css"                        5f7c2ed71298320b7c68c69d5cda764710583610a4a1c62158b66834dbd52cde
check "$W/src/features/chat/pages/Chats.tsx"            f15af0935f47ecee2f04c001212204aa2bc24518c46a1c21431357965b149715
check "$W/src/app/the-stage-takes-a-colour.test.ts"     e3b275780338fca3cd78385546e39add0d7f4a47400f74f89bea0077e38d5c9d

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
git add "$W/src/styles/tokens.css" \
        "$W/src/styles/relief.css" \
        "$W/src/features/chat/pages/Chats.tsx" \
        "$W/src/app/the-stage-takes-a-colour.test.ts" \
        land-the-stage-takes-a-colour.sh || die "git add"
git commit -F - <<'MSG' || die commit
The stage takes a colour

Eight palette cards from the owner, one ask: a colour picker beside the
Chats header, one tap changes the whole chat system, Mira stays red.

A swatch row now sits under the Chats title - Slate (the default), Navy
Mirage, Emerald Depth, Mandarin Curd, Rose Mascarpone, Peach Glaze,
Pistachio Mint Cream, Lavender Cream, Cream Veil. The chosen id rides the
stage element as data-stage and is held per device in localStorage; the
painting is done entirely by token blocks in tokens.css, which is the
argument the slate restyle already made: the stage is eleven tokens, so a
theme is eleven declarations and zero component edits.

EVERY THEME IS ALL ELEVEN TOKENS, TOGETHER - a block that re-grounds the
room and inherits the old ink is a-stage-does-not-export-its-ink wearing a
new coat, and the-stage-takes-a-colour.test.ts parses every block and
demands the full set. Every ink was measured against its palest ground,
gradient stops and the solid alike: main ink >=5.1:1 on the worst theme
(Mandarin, whose reference orange eats dark ink and was darkened one step),
quiet inks >=4.6, faint >=4.5, tile and bubble pairs >=11:1. The six light
themes invert the bubbles on purpose - the incoming tile goes dark with
light type - which the token pairings deliver for free. Glass alphas flip
sign with the ground: white glass on the dark stages, smoked on the light.

The swatch dots' own colours live in the token layer, not the page -
relief.spec caught the first draft carrying nine hexes in Chats.tsx and it
was right: a hex here and a hex there is how two swatches drift. The dots
are 22px of paint with the 44px pseudo-element finger target every small
control in relief.css already uses. Mira's room appears in no block: still
red, as asked, in every theme.
MSG
ok committed
say "review, then:  git push"
