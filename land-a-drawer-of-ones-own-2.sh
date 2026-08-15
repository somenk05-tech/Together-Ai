#!/usr/bin/env bash
# land-a-drawer-of-ones-own-2.sh  ·  run from the REPO ROOT
#
# Supersedes land-a-drawer-of-ones-own.sh, which ran and stopped at the vitest
# gate - correctly. `relief.spec` scraped EVERY `key: '...'` literal out of
# hubs.ts and demanded a `[data-hub]` accent for each, and the new Personal TAB
# is a key that is deliberately not a hub. The guard was right to fire and its
# assumption was the thing that had changed, so the fix is in the guard: it
# scrapes the HUBS map now rather than the whole file. This script carries that
# one extra file; nothing else moved.
#
# "Hide the travel tab from homepage including from walk the distance... and
# Create a tab called personal" - the owner, 15 Aug. Its rooms, in his words:
# "Thoughts, calendar, drive, photo album."
#
# THE OTHER SESSION'S FILES are untouched: chat.api.ts, schemas.ts,
# Composer.tsx, share.tsx, types/index.ts, AttachPanels.tsx and
# a-place-and-a-person.test.ts carry another line of work - which is also why
# Personal's key is widened in config/hubs.ts rather than in types/index.ts.
#
# AFTER THIS: land-she-reads-the-dating-thread.sh runs clean (it stopped at the
# same shared gate, on this same failure, with nothing of its own wrong).
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
printf '%s\n' "$LOG" | grep 'A drawer of ones own' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A verb leaves the rail' >/dev/null
[ $? -eq 0 ] || die "base commit 'A verb leaves the rail' is not here"
# The predecessor ran, stopped at the gate, and is therefore frozen.
rm -f land-a-drawer-of-ones-own.sh
ok "base is here, this is not; superseded script removed"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/config/hubs.ts" "$W/src/nav/registry.ts" "$W/src/pages/Home.tsx" "$W/src/pages/Hubs.tsx" "$W/src/layouts/CityDrawer.tsx" "$W/src/app/router.tsx" "$W/src/app/a-drawer-of-ones-own.test.ts" "$W/src/app/relief.spec.ts" "$W/src/features/thoughts/" "$W/src/features/social/pages/Profile.tsx" "$W/src/features/personal/" \
  | grep -Ev '(src/config/hubs\.ts|src/nav/registry\.ts|src/pages/(Home|Hubs)\.tsx|src/layouts/CityDrawer\.tsx|src/app/(router\.tsx|a-drawer-of-ones-own\.test\.ts|relief\.spec\.ts)|src/features/thoughts/pages/Thoughts\.tsx|src/features/social/pages/Profile\.tsx|src/features/personal/)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/config/hubs.ts"                             4e83b810831c5b2e1d106183e4ae705b69b89ca60937b8557362afbda6293a1e
check "$W/src/nav/registry.ts"                            c73eccb0a7987e3ac6f6c991f56f9243239416f6e0adc803af47ba54880a922d
check "$W/src/pages/Home.tsx"                             497e6b979bca668c7adc6fe3ce28a73e3c0f5d3c24b0d1a92ebdea7983c93dc6
check "$W/src/pages/Hubs.tsx"                             bfadc1ac36a8526fb06eb91e6bb33c43a81c6810522fb80b95dfbf4fab9631d5
check "$W/src/layouts/CityDrawer.tsx"                     55b859d9edefee90ad92d5ca6b000d22b4629bb32b0da856247ec8829c656589
check "$W/src/app/router.tsx"                             77c201d78ba7dfed27ea8f3d1634c9930eaeb93f609198318b66f1e14a5f4cb5
check "$W/src/app/a-drawer-of-ones-own.test.ts"           2548eec7a959eff12ba1454b77e2329a3d862187d732a94c4cfd3e95b5854365
check "$W/src/app/relief.spec.ts"                         189ba99552a9788a66102797ddedb4c61f2e6708ea442ad612f175cb61b4140b
check "$W/src/features/thoughts/pages/Thoughts.tsx"       02c37d2ac11982f5e24e87e49f59d8112334e75254e4b7b04411515d22a256a5
check "$W/src/features/social/pages/Profile.tsx"          10fe6f9ace851adab611d35079729a70e69fcb740f892491cee2aa8f0cc8d558
check "$W/src/features/personal/pages/PersonalHome.tsx"   a5905a3fa9b5fa4b78e8b3563fb132acf2aa623fee03ea87713acdebd1cf89d6
check "$W/src/features/personal/pages/Album.tsx"          7c2c72ff768df9ea6da7452e56694bf98d53d3d0824082687416e1f1e1fca245

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
git add "$W/src/config/hubs.ts" \
        "$W/src/nav/registry.ts" \
        "$W/src/pages/Home.tsx" \
        "$W/src/pages/Hubs.tsx" \
        "$W/src/layouts/CityDrawer.tsx" \
        "$W/src/app/router.tsx" \
        "$W/src/app/a-drawer-of-ones-own.test.ts" \
        "$W/src/app/relief.spec.ts" \
        "$W/src/features/thoughts/pages/Thoughts.tsx" \
        "$W/src/features/social/pages/Profile.tsx" \
        "$W/src/features/personal/pages/PersonalHome.tsx" \
        "$W/src/features/personal/pages/Album.tsx" \
        land-a-drawer-of-ones-own-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
A drawer of ones own

"Hide the travel tab from homepage including from walk the distance... and
Create a tab called personal" - the owner, who named its rooms when asked:
"Thoughts, calendar, drive, photo album."

TRAVEL LEAVES THE STREET, NOT THE CITY. It is out of the header, off the
home page's map, out of the pavilion tiles and off the districts you walk.
Everything else about it is untouched: the hub config, its rooms, its
routes, its art, its landing. /travel still answers, a bookmark still
works, Mira can still take somebody to their bookings, and the command
palette still finds a flight - it is listed there explicitly now, the way
Family always has been, because the palette built its hub entries from the
header and a hub nobody can find is a hub nobody can use. Hidden and
deleted are different things, and this is the first.

AND PERSONAL IS A DRAWER, NOT A DISTRICT. Four rooms that are nobody
else's business: Thoughts, Calendar, Drive, Album. Three of them already
existed and were listed NOWHERE - Calendar and Drive were reachable only
by knowing a URL, and the journal was boarding in the Social Life rail for
want of anywhere else to sleep, which was always the wrong shelf for a
private journal. They keep their own full-width pages; the tab gathers
them, and the journal brings its own page grid now that it no longer
borrows a hub layout's.

The album is the one new room, and it draws the PROFILE'S own tile wall
rather than a second copy of it - lazy thumbnails, the still frame for a
video with no poster, the lightbox reader, all of it - with a filter above
and a way home. It stores nothing: a photo that is not on a post is not in
this room, and the page says so rather than implying a shoebox that does
not exist.

WHAT PERSONAL IS NOT is the part worth writing down. It is not a HubKey.
The moment it became one, every map keyed by hub - heroes, phone posters,
billboard lines, themes, consent gates - would owe it an answer it does
not have, and three of them would have rendered an empty frame the way
/mail once did. So the widening is a TabKey in the hub config, which costs
the hub maps nothing, and the two surfaces that read hub art off a nav key
(the phone drawer, the all-hubs grid) ask one `tabIcon()` for the glyph
instead of guessing separately.

AND ONE GUARD LEARNED THE DIFFERENCE. relief.spec's "every hub has an
accent of its own" scraped every `key: '...'` literal in hubs.ts, so the
new tab failed it - correctly, by its own reading, and wrongly by its
name: Personal has no `[data-hub]` block because nothing ever sets
data-hub to it, and a block would be dead CSS asserting a district that
does not exist. The scrape starts at the HUBS map now. The rule it exists
to keep - a hub with no accent inherits whichever hub you arrived from -
is unchanged and still covers all sixteen.
MSG
ok committed
say "review, then:  git push"
say "then, for Mira in the dating thread:  bash land-she-reads-the-dating-thread.sh && git push"
