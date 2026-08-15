#!/usr/bin/env bash
# land-a-verb-leaves-the-rail.sh  ·  run from the REPO ROOT
#
# "hide the create post tab from the left bar, keep the page... also add a
# back button to the page" - the owner, on the Social Life hub.
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
printf '%s\n' "$LOG" | grep 'A verb leaves the rail' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "this is new"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/config/hubs.ts" "$W/src/features/social/pages/CreatePost.tsx" \
  | grep -Ev '(src/config/hubs\.ts|src/features/social/pages/CreatePost\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/config/hubs.ts"                          78f8b07bab92cea8f8b88b372525376696384be243e84eacb1999ff73bbed4f4
check "$W/src/features/social/pages/CreatePost.tsx"    e7158822760d50b486d2ad2c81abe25d72106f7fa49465d63af5104d044329d4

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
git add "$W/src/config/hubs.ts" \
        "$W/src/features/social/pages/CreatePost.tsx" \
        land-a-verb-leaves-the-rail.sh || die "git add"
git commit -F - <<'MSG' || die commit
A verb leaves the rail

"hide the create post tab from the left bar, keep the page... also add a
back button to the page" - the owner, on the Social Life hub.

The hub rail is a list of PLACES - the feed, your profile, what you
saved, your journal - and Create Post was the one verb standing among
them. It leaves the rail; the page stays, reached the way an action
should be: the feed's + Create key, its composer strip and its quick
chips, three doors from the one place people are when they decide to
post. The remaining rooms renumber to close the gap.

And since the page no longer has a rail seat lighting up beside it, it
carries its own way home: "Back to the feed", on the page itself, going
to the FEED deterministically rather than navigate(-1) - after a deep
link or a just-posted post, "back" means the wall, not wherever the
browser happens to have been.
MSG
ok committed
say "review, then:  git push"
