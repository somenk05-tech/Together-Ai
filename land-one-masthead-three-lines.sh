#!/usr/bin/env bash
# land-one-masthead-three-lines.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug, with the header photographed off the live site:
# "Redesign the top tab in the this layout, the second row make the buttons in
#  black and white font rest remains the same, Also remove the TC logo keep
#  only the full version"
#
# Front end only - no route, no API, no asset deleted.
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
printf '%s\n' "$LOG" | grep 'One masthead, three lines' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The hubs take the middle' >/dev/null
[ $? -eq 0 ] || die "base commit 'The hubs take the middle' is not here"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/layouts/" "$W/src/styles/layout.css" "$W/src/styles/tokens.css" \
  "$W/src/styles/relief.css" "$W/src/app/the-bar-moves-up.test.ts" \
  | grep -Ev '(src/layouts/Header\.tsx|src/styles/(layout|tokens|relief)\.css|src/app/the-bar-moves-up\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/layouts/Header.tsx"                 fa99bd4bb7709ab4b03ee0076cd7b1c8f3222806cb9ac36164f3d4d9938339a7
check "$W/src/styles/layout.css"                  74dbdb75615ef9a1b133b45c3a1652e198ea0f9481a7870ba24a431d18f48e27
check "$W/src/styles/tokens.css"                  237c9eabf4325a43184fc2b3ae7256bbe68b398550435fe2488f4aa1cdefccf8
check "$W/src/styles/relief.css"                  0c37c1071a01d8bff115e5d6fd8c22c2a5695a17cbe5d3ab404ad9e8ac498a59
check "$W/src/app/the-bar-moves-up.test.ts"       9bc76448744133562c75ef1f82b2e472e8cb39cc5d9e3d0ad1f4ff5460b6e58e

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
git add "$W/src/layouts/Header.tsx" \
        "$W/src/styles/layout.css" \
        "$W/src/styles/tokens.css" \
        "$W/src/styles/relief.css" \
        "$W/src/app/the-bar-moves-up.test.ts" \
        land-one-masthead-three-lines.sh || die "git add"
git commit -F - <<'MSG' || die commit
One masthead, three lines

"Redesign the top tab in this layout, the second row make the buttons in
black and white font, rest remains the same. Also remove the TC logo, keep
only the full version." - the owner, 15 Aug.

    the name of the city
    Mail · Chat · Personal · Alerts · you
    ASTROLOGY · BEAUTY · DATING · ...

THE BAR CAME OFF THE CORNER. It moved out of the tab row yesterday because
five personal doors on the same shelf as twelve districts made the header
say they were the same kind of thing; it was pinned to the right of the
wordmark, out of flow, for one reason only - a bar in flow beside a centred
name pushes the name off centre. On a row of its own that reason is gone,
so it is an ordinary centred flex row now. The difference is not
arrangement: in the corner those five were CHROME, and under the name they
are the second line of a masthead.

BLACK ON WHITE. They were set in --ink-soft, one step down from the page's
own text colour, which was right for chrome in a corner and is wrong here:
soft grey on a white pill on a white header is three greys in a row and the
middle one reads as disabled. Ink, and the hover has nowhere left to go but
the lift it already had.

THE NAME IS SAID ONCE. A hand-lettered TC monogram sat pinned in the top
left corner with the hand-lettered "Together City" centred beside it - the
same name, in the same hand, in two files, because the relationship between
them was a layout that changed with the viewport. On a masthead of three
centred rows the corner mark is the only thing on the page that is not on
the axis. It is gone, and everything it needed goes with it: the absolute
pinning, the 1100px rule that put the pair back together where the burger
takes the corner, and half of the dark-hub inversion. Three rules and a
breakpoint for the second half of a signature.

The ARTWORK stays on disk. Nothing references it today, but a monogram is a
brand asset rather than a component, and deleting artwork to tidy a
stylesheet is how a favicon goes missing eighteen months later.

The header is 108px instead of 78px, said once, in the token every surface
that clears it already reads - the main column's padding, the sidebar's
sticky top, four full-height screens. A phone still folds all of it back
into one 54px line: burger, wordmark, and the two doors the bottom bar does
not carry.
MSG
ok committed
say "review, then:  git push"
