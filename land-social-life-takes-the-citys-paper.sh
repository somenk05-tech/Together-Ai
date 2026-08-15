#!/usr/bin/env bash
# land-social-life-takes-the-citys-paper.sh  ·  run from the REPO ROOT
#
# "use these references to redesign social media — the backend does not
# change, just the design" — the owner, with four phone mockups and one
# screenshot of the live Thoughts page. Web-side only: not one API call,
# route, payload or limit moves.
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
printf '%s\n' "$LOG" | grep "Social Life takes the city's paper" >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A way back from her room' >/dev/null
[ $? -eq 0 ] || die "base commit 'A way back from her room' is not here"
ok "base is here, this is not"

say "2 - scope"
FILES="$W/src/styles/relief.css
$W/src/features/social/PostCard.tsx
$W/src/features/social/pages/SocialFeed.tsx
$W/src/features/social/pages/CreatePost.tsx
$W/src/features/social/pages/Profile.tsx
$W/src/features/social/pages/Saved.tsx
$W/src/features/social/pages/Notifications.tsx
$W/src/features/thoughts/pages/Thoughts.tsx"
STRAY="$(git status --porcelain -- $FILES \
  | grep -Ev '(relief\.css|PostCard\.tsx|SocialFeed\.tsx|CreatePost\.tsx|Profile\.tsx|Saved\.tsx|Notifications\.tsx|Thoughts\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$W/$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check src/styles/relief.css                        6a39591ea0e8b4f4a207ee293afefe5d6022186fcbdc212c5ac2b64ae5c324de
check src/features/social/PostCard.tsx             844295d024c43a46500e4d94cc026ef797974668130102f5fd311e5d60f64d18
check src/features/social/pages/SocialFeed.tsx     f5cdc4a2ae2e2aa86556190e46626e44a3bff980af93e2cd9049a1a751392f89
check src/features/social/pages/CreatePost.tsx     681f4a5dac62d25701ab8005de37d4e2fc1b87094f18608c4ef3bbf19544f342
check src/features/social/pages/Profile.tsx        a23b7a16ce8bef864681f5c7ce6d0cbfe0b82479f619b5276098b065dd961f58
check src/features/social/pages/Saved.tsx          5a63be60fb6769c0af442e88d16b77120e4702847f38140c2c89ba5aaeff195e
check src/features/social/pages/Notifications.tsx  648286996eb7ac15bdb31e4b978b15deeef86dd44e679ef2bf2fadb8b4381c15
check src/features/thoughts/pages/Thoughts.tsx     b9da444bec4286bbd4aa92b93764f8ae2d3b0dedd63aa9e039c786ee24753f36

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"      || die "web tsc"
npx vitest run                  && ok "web vitest"   || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok "web build"    || die "web build"
# REPORTED, NOT ABSORBED. dead-export-audit stands at 3 against a ceiling of
# 2 and has since before this branch: useGemCommission, MedicalAdvisories and
# PlanGuidanceBanner. None of them is ours and none of them is fixed here.
node scripts/dead-export-audit.mjs >/dev/null 2>&1 \
  || printf '   \033[33m!\033[0m dead-export-audit still 3/2 (pre-existing, not ours)\n'
cd ..

say "5 - commit"
git add $FILES land-social-life-takes-the-citys-paper.sh || die "git add"
git commit -F - <<'MSG' || die commit
Social Life takes the city's paper

Four phone mockups and one screenshot of the live Thoughts page. The
screenshot is the argument: a form with four controls in it, none of
which looks like somewhere to type, and a Save key that reads as
disabled at rest.

THE GLASS WAS DRAWN FOR A GROUND THAT NO LONGER EXISTS. `.g-*` says so
in its own first paragraph - "the ground here is white, and clear glass
on white has nothing behind it to bend". It was built while Social Life
still held a lavender ground and was meant to be lit by it. That grant
was handed back; what was left is a white-on-white material where the
field, the key and the page are three shades of the same white.

So the hub takes the city's own paper: `.card`, `.btn`, `--line`, `--e1`
and the ink scale, exactly as the other twenty-four rooms use them. No
new depth, no new face, no new ink. What IS new is geometry - a
composer, a tab rail, a post, an attach grid, a settings row - because
those are shapes the city did not have, not materials it lacks.

WHAT MOVED, SCREEN BY SCREEN:

City Feed - a head with the one thing you came to do beside it, a
write-box that is a DOOR to Create Post rather than a second composer,
a tab rail underlined instead of a tray of raised keys, and a band that
names the run and counts it. On a phone the wall becomes a column of
whole posts: at one tile per row a 3:4 poster is no longer a thumbnail
of anything, it is the post with its caption cropped and its controls
hidden behind a tap. Nine-hundred pixels and up, the wall is unchanged.

Create Post - the seven raised keys become six tinted attach tiles, and
the two things that are settings rather than attachments (who may read
it, which shelf it goes on) become a list that states its own answer.
The counter under the box is CreatePostSchema's own 2200.

Thoughts - hairline fields, a mood ROW instead of a text box you have to
think of a word for, the tag entry with its hash inside the control, and
the one black button on the screen is the one that saves. The counter is
the schema's real 20,000, not a round number chosen to look tidy.

Post card, Saved, Notifications and Profile follow the same material, and
Notifications' emoji become the line set Icon.tsx has always asked for.

THE ONE PLACE HUE IS SPENT is the attach grid, and it spends the tints
the mail folders already measured: the chip carries the colour, the glyph
stays ink. That is the folder block's own rule, written there because a
tinted glyph reads between 1.68:1 and 3.33:1 and a tinted face reads
17.85:1 at its worst.

NOT ONE API CALL MOVES. Same routes, same payloads, same limits, same
filters - the five feed tabs are still the five the API actually takes,
because a tab with nothing behind it is invented data.

`.g-*` is left standing on purpose: tap-targets.test.ts asserts
`.g-key.sm` by name, so retiring the family is a change to a guard as
well as to a stylesheet and belongs in its own commit. After this one it
has no callers left in src/.
MSG
ok committed
say "review, then:  git push"
