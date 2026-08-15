#!/usr/bin/env bash
# land-the-plate-comes-off.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug, with a paper reference: "remove the metal tab from this
# page and redesign this page with the new refrence backend remains the same".
#
# ONE FILE, front end only - no route, no API, no asset. Independent of
# land-a-day-can-be-photographed.sh: they touch nothing in common and can be
# run in either order.
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
printf '%s\n' "$LOG" | grep 'The plate comes off' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A drawer of ones own' >/dev/null
[ $? -eq 0 ] || die "base commit 'A drawer of ones own' is not here"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/personal/" \
  | grep -Ev '(src/features/personal/pages/PersonalHome\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/personal/pages/PersonalHome.tsx"   cabac41fe04b4d6a1cabc7427c1957508ef0a5b480d2a5e0b40eeede905dfc84

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
git add "$W/src/features/personal/pages/PersonalHome.tsx" \
        land-the-plate-comes-off.sh || die "git add"
git commit -F - <<'MSG' || die commit
The plate comes off

"Remove the metal tab from this page and redesign this page with the new
refrence" - the owner, 15 Aug, with a reference of ruled paper.

A brushed-metal CITIZEN CARD ran across the top of Personal. It was the
city's own object rather than a photograph of somewhere, which was the
argument for putting it there, and it was wrong here for two reasons the
reference makes plain: it is the most corporate surface in the application
sitting directly above the four most personal rooms in it, and it was a
1600px picture that said nothing - no name, no number, no state, nothing
that ever changes. Under it, the four rooms were four grey rows with an
icon each.

(The plate itself is untouched and still earns its keep where it has a
name and a face on it: features/profile/components/CitizenCard.tsx draws
the citizen's portrait onto that same artwork. A picture of an empty card
is not the card.)

THE REFERENCE IS PAPER, so the page is four leaves. A margin rule down
each one, running the full height rather than stopping at the text -
which is the difference between a page out of a notebook and a box with a
line in it. The room's mark punched onto that rule like a hole. And
something of the room's own lying on the page: the dates around today for
the calendar, a fanned stack for the drive, two prints at an angle for
the album, three ruled lines waiting to be written on for the journal.

EVERY DRAWING IS BUILT, NOT PHOTOGRAPHED. Nothing new in /assets, nothing
to re-export when a size moves, and the calendar leaf shows the REAL
dates around today - a drawing of a calendar showing somebody else's week
is a picture of nothing.

AND IT KEEPS THE ONE TYPEFACE. The reference sets its titles in a display
serif and its asides in a hand. This city has one family and a guard that
proves it - the display serif exists for the nutrition press and is lent
outside it by name, in a list of four selectors - so the aside here is the
italic of the same family, which is the flourish this application already
uses, and the hierarchy comes from size rather than from a second font. A
reference is a brief, not a set of files to match.
MSG
ok committed
say "review, then:  git push"
