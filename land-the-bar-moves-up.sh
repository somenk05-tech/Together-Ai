#!/usr/bin/env bash
# land-the-bar-moves-up.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug: "Make personal a button tab like mail and chat and profile
# and place it next to these buttons, also move these button on top layer where
# the logo is."
#
# WEB ONLY — nothing in the API moved, so this runs the web gates and not the
# API's. It is independent of land-the-daybook-4.sh and can be run before or
# after it; the two touch no file in common, and this script stages only the
# four files it wrote.
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
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The bar moves up' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/layouts/" "$W/src/styles/layout.css" "$W/src/app/the-bar-moves-up.test.ts" \
  | grep -Ev '(src/layouts/(Header|QuickActions)\.tsx|src/styles/layout\.css|src/app/the-bar-moves-up\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/layouts/Header.tsx"              7ada7677803b55f3ffe26523faae484c5297a7fce8526100690bb031d9e3aff2
check "$W/src/layouts/QuickActions.tsx"        d8c9de5c85d18906c9ac0ef8bb9aeb495569e8b8ab59f401a6037b8781501bfd
check "$W/src/styles/layout.css"               0c844d0a3cae336639995e5d4e60919d0c89b594a54669ea293fdd11ab3b6332
check "$W/src/app/the-bar-moves-up.test.ts"    46503ed0e326b88b6f89374eb02fc2cd3dab19fe706f31fe247c322502dde9a2

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "5 - commit"
git add "$W/src/layouts/Header.tsx" \
        "$W/src/layouts/QuickActions.tsx" \
        "$W/src/styles/layout.css" \
        "$W/src/app/the-bar-moves-up.test.ts" \
        land-the-bar-moves-up.sh || die "git add"
git commit -F - <<'MSG' || die commit
The bar moves up

"Make personal a button tab like mail and chat and profile and place it
next to these buttons, also move these button on top layer where the logo
is." - the owner, 15 Aug.

TWO ROWS THAT WERE SAYING ONE THING BETWEEN THEM. Row 1 of the header
carried the signature and nothing else; Row 2 carried twelve DISTRICTS
and, on the same line, five doors that are not districts at all - your
mail, your chats, your drawer, your alerts, you. So the header's own
grammar said the city and the citizen were the same kind of thing, and
the tab row spent its width proving it: two `--chip-fs` step-downs and
9.5px capitals on a 1340px window, because twelve sectors and five
buttons do not fit a line.

They are two rows about two things now. Who you are on top, beside the
name of the city. Where the city is underneath, with the whole width back.

PERSONAL JOINS THE PILLS. It was a header tab, filed alphabetically
between Nutrition and Property, which reads as one more place to go and
visit - and it is the opposite of that: the citizen's own drawer, holding
Thoughts, the daybook, Drive and the album. It sits with Mail and Chat
now, where it belongs, and the header lifts it out of the tab row exactly
as it has always lifted Mail. It stays in NAV: that list is what the
burger drawer and the Hubs page walk, and a pill carrying its own
hardcoded path is a second source of truth waiting to disagree with the
first.

THE WORDMARK KEEPS THE MIDDLE, which is the only interesting part of
moving a bar up a row. Row 1 centres its contents, so a bar sitting in
flow beside the name pushes the name left by half the bar - and would
push it again every time a pill is added. It is pinned out of flow to the
row's right edge, for the same reason and by the same trick the monogram
is pinned to the left one, so the centre of the header is the centre of
the header whatever the bar is carrying.

ON A PHONE nothing new appears. Chats, Alerts and Profile stay hidden
below 900px because the bottom bar already carries them; Mail and Personal
stay visible because it does not, and a room whose only door is inside a
burger is a room most people never open. Row 2 is now empty at that width
rather than merely tabless, so it is hidden outright instead of sitting in
the header as a zero-content flex item still claiming the row's gap.

The test file holds the three things that must not quietly come undone:
the bar is on Row 1 and the tab row is districts only, the wordmark's
centring survives (both halves of it - the row centres AND the bar is out
of the centring), and Personal is in NAV, in the pill group, and not
hidden on a phone.
MSG
ok committed
say "review, then:  git push"
