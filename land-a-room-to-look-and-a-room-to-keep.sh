#!/usr/bin/env bash
# land-a-room-to-look-and-a-room-to-keep.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug: a Potential Matches section showing the entire public with a
# compatibility percentage, and "when someone from potential matches connect
# with each other they land at curated matches".
#
# THE ENGINE FOR THIS ALREADY EXISTED AND HAD NEVER BEEN OPENED. `GET
# /dating/discover` scores every eligible candidate - no floor, no truncation
# (the `take(_, 24)` that used to cut each band was deliberately removed) - and
# returns them in tiers. `useDiscover` was written and exported and imported by
# nothing. So this is a DOOR onto a furnished room, not a second engine: no
# server change, no new scoring, no new query. Anything else would have meant
# two answers to "how compatible are we" drifting apart by the month.
#
# CURATED MATCHES STOPS BEING BOTH ROOMS AT ONCE. It was mutual matches, then
# the ranked deck, then a histogram, then "Everyone else" grouped by band with
# a Like button on every card - the whole hub on one page, where a match, the
# thing the hub exists to produce, arrived as a section above a shop. Now: one
# room to look in, one room to keep. Curated shows ONLY people who liked you
# back, and nothing on it can like anybody.
#
# NOTHING WAS DELETED, IT MOVED. Every card, band, histogram and control that
# left DatingMatches.tsx is in components/MatchCards.tsx, rendered by both
# rooms. A person is drawn by one component or the two rooms start disagreeing
# about what a percentage is.
#
# THE CAP NO LONGER HIDES A MATCH. At three conversations the old page swapped
# the entire list for the engaged panel. The panel is a sibling below the
# matches now: what is paused is starting a fourth chat, not seeing the people
# who already chose you. The panel's copy changed to say that instead.
#
# PRIVACY IS UNTOUCHED AND UNRESTATED. Connection exclusions, both-direction
# filters, each candidate's own threshold opt-in, the identical silence
# whichever side's filter closed the door - all server-side, all with their own
# specs, all still the only thing deciding who appears. The new page reads the
# endpoint that enforces them rather than assembling a pool of its own.
#
# ONE GATE IS A REPORT, NOT A REFUSAL: dead-export-audit sits at 3 against a
# ceiling of 2 on main already (useGemCommission, MedicalAdvisories,
# PlanGuidanceBanner), none of them this commit's. The step below fails if that
# LIST changes, which is the part this commit can be responsible for.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
git log --oneline -40 | grep 'A room to look in, and a room to keep' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
C="$W/src/features/dating/components/MatchCards.tsx"
B="$W/src/features/dating/pages/DatingBrowse.tsx"
M="$W/src/features/dating/pages/DatingMatches.tsx"
H="$W/src/config/hubs.ts"
R="$W/src/app/router.tsx"
T="$W/src/app/a-room-to-look-and-a-room-to-keep.test.ts"
for f in "$C" "$B" "$M" "$T"; do [ -f "$f" ] || die "missing $f"; done
grep -q "useDiscover(kind, Boolean(profile.data))" "$B" || die "the browse page is not on /dating/discover"
grep -q "useDatingStack" "$B" && die "the browse page must not read the stack"
grep -q "path: '/dating/browse', index: '02'" "$H" || die "the rail has no Potential Matches at 02"
grep -q "path: '/dating/chats', index: '04'" "$H" || die "the rail did not renumber to 04"
grep -q "path: '/dating/browse'" "$R" || die "no route for /dating/browse"
grep -qE "useLikeMatch|usePassMatch|useSuperLike" "$M" && die "Curated can still like somebody"
ok "all six files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(dating/components/MatchCards\.tsx|dating/pages/DatingBrowse\.tsx|dating/pages/DatingMatches\.tsx|config/hubs\.ts|app/router\.tsx|a-room-to-look-and-a-room-to-keep\.test\.ts|land-a-room-to-look-and-a-room-to-keep\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/a-room-to-look-and-a-room-to-keep.test.ts || die "the two-room guard"
# The specs that read the dating pages, the hub menu or the router as source
# text. Named because a change of this shape breaks one of them silently.
npx vitest run src/app/one-bag.test.ts src/app/mira-is-two-tabs-and-a-door.test.ts \
               src/app/mira-reads-one-chat.test.ts src/app/dating-height-range.test.ts \
               src/app/failure-states.test.ts src/app/citizen-facing-copy.test.ts \
               src/app/relief.spec.ts \
  || die "the dating / hub-menu guards"
ok "the two-room guard and all seven neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] \
  || die "dead exports changed: $DEAD"
note "dead-export still 3/2 - the same three as on main, none of them this commit's"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - the backend, untouched - proving it"
if git status --porcelain -uall together-city-chat | grep -q .; then
  note "together-city-chat has changes in the tree; they are NOT part of this commit"
fi
ok "no server file is staged below"

say "5 - commit"
git add "$C" "$B" "$M" "$H" "$R" "$T" land-a-room-to-look-and-a-room-to-keep.sh
git commit -q -m "A room to look in, and a room to keep

Potential Matches: every resident who is open to being found, each with the
compatibility worked out from birth charts, what you both want, how you live
and where you are - grouped by named band, nobody hidden for scoring low,
nothing truncated. Like, super-like and skip live here.

Curated Matches becomes only what its name says: the people who liked you back.
Nothing on it can like anybody. Two people choosing each other is the only way
in, which is the journey the owner asked for.

NO SERVER CHANGE. /dating/discover already scored every eligible candidate with
no floor and no cap, and useDiscover had never been imported by a page. This is
a door onto a room that was already furnished - a second engine would have been
two answers to 'how compatible are we', drifting apart by the month.

Every card, band and histogram moved out of DatingMatches.tsx into
components/MatchCards.tsx and is rendered by both rooms, so a person is drawn
one way. The rail runs the journey: profile 01, browse 02, keep 03, talk 04.

And the conversation cap no longer hides a match: the engaged panel sits below
your matches rather than instead of them - what is paused is starting a fourth
chat, not seeing the people who already chose you." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
