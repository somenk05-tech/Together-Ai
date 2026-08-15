#!/usr/bin/env bash
# land-the-hubs-take-the-middle.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug, on the live header after 'The bar moves up':
# "center align the hubs make it asthetics"
#
# CSS and its guard only — two files, no component, no API.
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
printf '%s\n' "$LOG" | grep 'The hubs take the middle' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The bar moves up' >/dev/null
[ $? -eq 0 ] || die "base commit 'The bar moves up' is not here - run land-the-bar-moves-up.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/layout.css" "$W/src/app/the-bar-moves-up.test.ts" \
  | grep -Ev '(src/styles/layout\.css|src/app/the-bar-moves-up\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/layout.css"                3e4a17d6b91020348232587dad280d17d9b0d0bb576b3f127cb16c82f6189adc
check "$W/src/app/the-bar-moves-up.test.ts"     eb0aa91a69bb2457741544f34c57e65136373277488f1f47be51ee1d23b15f9c

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
git add "$W/src/styles/layout.css" \
        "$W/src/app/the-bar-moves-up.test.ts" \
        land-the-hubs-take-the-middle.sh || die "git add"
git commit -F - <<'MSG' || die commit
The hubs take the middle

"Center align the hubs make it asthetics" - the owner, 15 Aug, looking at
the header the commit before this one left him.

He is right, and the reason is one commit old. The tabs began at the left
edge with a 32px indent because they were SHARING their line with the
action bar and had to leave it the right-hand end. The bar moved up to the
signature row yesterday; the tabs kept the indent, so the header had a
centred wordmark over a row pinned hard left - two rows that look laid out
by different people. Centred, there is one axis through the whole thing:
monogram left, name in the middle, the citizen's doors right, the
districts on that same middle underneath.

THE CENTRING IS ON THE PARENT, AND THAT IS THE ONLY INTERESTING LINE HERE.
`justify-content: center` on `.tc-nav` is the obvious way to do this and is
a trap: `.tc-nav` is a SCROLL container, because twelve districts do not
fit a small window. A centred flex scroller puts its first item at a
negative scroll offset, and no browser will let you scroll to it - so
ASTROLOGY becomes permanently unreachable at exactly the width where
scrolling starts, and nowhere else, which is precisely the kind of bug that
ships. So the ROW centres a nav that is only as wide as its tabs; when they
stop fitting, the nav grows to the full width and scrolls from the left
like any other strip. `flex: 0 1 auto` is the sized-to-its-tabs half, at
two-class specificity on purpose: relief.css says `flex: 1 1 auto` and
loads last, so a one-class rule here would have silently lost.

AND THE TYPE STEPS DOWN A WINDOW SIZE LATER. The two `--chip-fs` steps sat
at 1560 and 1340 because the row ran out of width early when it was
carrying the buttons too - which meant a 1440px laptop, the common one, was
reading the city's districts at 10.5px for a reason that had already gone
away. With the line to themselves: 11.5px down to 1441, 10.5px to 1181,
9.5px below that. The per-breakpoint `gap` tweaks that used to sit beside
them are deleted rather than moved - relief.css sets the tab gap with a
clamp and loads last, so they had been dead letters for some time.
MSG
ok committed
say "review, then:  git push"
