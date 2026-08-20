#!/usr/bin/env bash
# land-mira-mood.sh — she tells you what kind of day she is having.
#
# Run AFTER land-phone-door.sh and land-speaker-icon.sh — this touches
# MiraThread.tsx, which land-speaker-icon.sh also stages — and BEFORE
# land-mira-relate.sh, whose four API files are allowed to sit dirty here and
# are never staged by this script.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-mood.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="She tells you what kind of day she is having"
PREV="A control icon that has to be asked about is the wrong icon"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history — run land-speaker-icon.sh first, it stages MiraThread.tsx too" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^(together-city-chat/src/mira/mira\.controller\.ts|together-city-react/src/(features/chat/mira/(day|api|MiraThread)\.tsx?|styles/mira\.css|app/mira-says-what-day-she-is-having\.test\.ts))$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts|mira/(relate(\.spec)?\.ts|ledger\.ts|mira\.service\.ts))|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/chat/components/(Composer|AttachPanels)\.tsx|features/chat/share\.tsx|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
60f2134a11decbf8916f84201fc11b4cbe8a782b1a0cc9bfe687e33e44a9a7d4  together-city-chat/src/mira/mira.controller.ts
46b5dc3ff5e04c970b36f30ede4808cee43c6714467023a95854048cf48da521  together-city-react/src/features/chat/mira/day.ts
284219e5eee326c8238c6844ef9bd4c8a4069e4554af5e82d7eb24d4f9e468fd  together-city-react/src/features/chat/mira/api.ts
86e55f427f0dae979950ac845f073bd62295c764f701c49dd3b14908772e7d1c  together-city-react/src/features/chat/mira/MiraThread.tsx
fc89c027a271868660b4b8d56a0769bbc241a5835377e2f15f7126581d69a84f  together-city-react/src/styles/mira.css
2b519b9bcab0da9ddda9ad6b7aed43263d8e945a1d0151d2987d113b9f356be8  together-city-react/src/app/mira-says-what-day-she-is-having.test.ts
SHASUMS

# ONE SEED REACHES BOTH. The badge and the answers under it have to be the same
# character; `greeting.ts` argues that one level down, where it prefers a mood's
# own openers rather than appending them to a shared pool. Two seeds would
# defeat it from above, and nothing else in this repo would notice.
say "the greeting and the answers are seeded from the same number"
grep -q 'const seed = useRef(daySeed())' "$WEB/src/features/chat/mira/MiraThread.tsx" \
  || die "the thread is not using the day's seed"
# COMMENTS ARE NOT CODE, and the first version of this gate did not know it.
# It grepped the raw file for `Math.random` and fired on the comment three lines
# above the fix EXPLAINING that Math.random used to be there — a guard failing
# on its own explanation. `land-mira-boots.sh` had to fix the same mistake for
# `as never` the same evening, which is what a pattern looks like.
#
# So: lines that mention it, minus lines that are comments. If anything is left,
# it is real code.
if grep -n 'Math\.random' "$WEB/src/features/chat/mira/MiraThread.tsx" \
   | grep -qvE '^[0-9]+:[[:space:]]*(\*|//|/\*)'; then
  die "a random seed is back — she will be a different character on every page load"
fi
say "  one seed, and it lasts the day"

# THE CLIENT'S SEED HAS TO FIT THE SERVER'S SCHEMA, and they are in different
# packages. `GreetSchema` bounds it at ten million; the first `daySeed()` returned
# a full 32-bit hash, which is not a large number — it is a 400 on every greeting
# on every open. The spec caught it because the bound was written to match the
# schema rather than the implementation. This checks the two still agree.
say "the day's seed fits the bound the API validates it against"
CEIL_WEB=$(grep -oE 'SEED_CEILING = [0-9_]+' "$WEB/src/features/chat/mira/day.ts" | sed 's/.*= //' | tr -d _)
CEIL_API=$(grep -oE 'seed: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\([0-9_]+\)' "$API/src/mira/mira.controller.ts" | grep -oE 'max\([0-9_]+' | grep -oE '[0-9_]+' | tr -d _)
[ -n "$CEIL_WEB" ] && [ -n "$CEIL_API" ] || die "could not read both ceilings — this gate is not measuring anything"
[ "$CEIL_WEB" = "$CEIL_API" ] || die "the web caps the seed at $CEIL_WEB and the API accepts up to $CEIL_API"
say "  both $CEIL_WEB"

API_STAGED="src/mira/mira.controller.ts"
# ── THE GATE THAT WAS MISSING ON THIS SIDE ───────────────────────────────────
# The web package has had a committed-tree typecheck since two Vercel deploys
# died of a staged file depending on an unstaged one. THE API NEVER GOT ONE, and
# it cost a day: 5392f63 staged mail.controller.ts for an unrelated decorator
# and carried four lines of another session's in-progress feature with it. Its
# service method stayed uncommitted, so `main` stopped compiling, every Railway
# build failed, and the host kept serving the previous container — which looks
# from the outside exactly like a deploy that did nothing.
#
# Every gate passed the whole time, because every gate read the WORKING tree,
# where the missing method is present.
say "API · tsc against the committed tree (not the working one)"
ATMP=$(mktemp -d)
git archive HEAD "$API" | tar -x -C "$ATMP"
for f in $API_STAGED; do cp "$API/$f" "$ATMP/$API/$f"; done
ln -s "$PWD/$API/node_modules" "$ATMP/$API/node_modules"
(cd "$ATMP/$API" && npx tsc --noEmit -p tsconfig.json) \
  || { rm -rf "$ATMP"; die "the API fails against the committed tree — Railway would fail this build and keep serving the old container"; }
rm -rf "$ATMP"

say "API · tsc";            (cd "$API" && npx tsc --noEmit -p tsconfig.json) || die "API tsc"
say "API · eslint";         (cd "$API" && npx eslint src/mira/)              || die "API lint"
say "API · jest (mira)";    (cd "$API" && npx jest src/mira --silent)        || die "mira suite"
# The new route must be one the web app actually calls, or it is an orphan.
say "API · jest (security)";(cd "$API" && npx jest src/security --silent)    || die "security suite — is /mira/greeting called from the web app?"

say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/features/chat/mira/day.ts src/features/chat/mira/api.ts \
         src/features/chat/mira/MiraThread.tsx src/styles/mira.css \
         src/app/mira-says-what-day-she-is-having.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";            (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";         (cd "$WEB" && npx eslint src/features/chat/mira src/app/mira-says-what-day-she-is-having.test.ts) || die "lint"
say "WEB · vitest";         (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling";   (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · motion-ceiling"; (cd "$WEB" && node scripts/motion-ceiling.mjs)   || die "motion ceiling"
say "WEB · build";          (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add \
  "$API/src/mira/mira.controller.ts" \
  "$WEB/src/features/chat/mira/day.ts" \
  "$WEB/src/features/chat/mira/api.ts" \
  "$WEB/src/features/chat/mira/MiraThread.tsx" \
  "$WEB/src/styles/mira.css" \
  "$WEB/src/app/mira-says-what-day-she-is-having.test.ts"

git commit -F - <<'MSG'
She tells you what kind of day she is having

`greeting.ts` and `mood.ts` have been in the repo since the first Mira commit:
six moods, their own openers, a levity ceiling, a fourth-wall counter, and
forty-odd tests. Nothing rendered any of it. The owner asked for this by name
three commits before it was written, and it has been sitting there finished and
invisible ever since — which is worse than not having built it, because it reads
as done.

`GET /mira/greeting` returns what `greet()` already decided, and the thread
prints it above the promise. That is the whole feature; the thinking was already
paid for.

── ONCE A DAY, NOT ONCE A SESSION ─────────────────────────────────────────────

Somebody who opens the app nine times before lunch does not need telling nine
times what kind of day she is having. That is a catchphrase, and catchphrases
are how a character dies.

`firstOpenToday()` is what marks the day, so it is asked exactly once per mount
and held in a ref — called during render it would mark the day on a re-render
and the badge would disappear while somebody was still looking at it. Forgetting
today forgets the greeting too, or "Forget today" leaves her half-remembering:
no conversation, but still convinced she has already said hello.

After a hard session the badge is "Here." — honest, short, not a performance.
That is all L0 permits and it is the whole point of the ceiling.

── AND IT FIXED A BUG NOBODY HAD SEEN YET ─────────────────────────────────────

The mood seed was `Math.random()` in a ref. She was A DIFFERENT CHARACTER ON
EVERY PAGE LOAD — announce one mood, refresh, meet somebody else. A mood that
survives less time than the tab is not a mood, and it would have been the first
thing anyone noticed the moment the badge appeared.

`daySeed()` derives it from the local calendar day, mixed with a per-device
number so two people opening the app on the same morning do not meet the same
Mira — a mood is hers WITH YOU, not the day's horoscope. It is stable for the
day and gone at midnight with everything else.

The greeting and every answer are now seeded from that one number. They have to
be: `greeting.ts` prefers a mood's own openers rather than appending them to a
shared pool, precisely so the badge and the sentence under it are the same
character. Two seeds would defeat that from above and nothing else in this repo
would notice, so the land script greps for it.

── WHAT IT IS NOT ─────────────────────────────────────────────────────────────

Not a @Mira() capability. This is chrome, not something she does; in the
manifest the router could match "say hello" and route a citizen's question into
a greeting.

Not coloured. Six moods with six tints would be a mood ring, and the colour
would start doing the work the words are supposed to do. It is the smallest type
in the room, in --on-mira-faint, and it earns its place by being brief.

Not load-bearing. `retry: false`, and every line is conditional: a greeting that
fails is a quieter opening, never an error in front of somebody.
MSG

say "landed. now: git push"
