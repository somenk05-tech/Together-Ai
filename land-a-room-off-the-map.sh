#!/usr/bin/env bash
# land-a-room-off-the-map.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug, looking at /fitness/plan: remove this page.
#
# HIDDEN, NOT DELETED - at the owner's word, and the third time this hub-level
# decision has been taken on the same argument the first two were: deleting a
# working surface in order to hide it is how a feature comes back as a rewrite,
# and taking the door away is one line to put back. FitnessPlan.tsx, the plan
# engine and GET /fitness/plan are untouched and the route still resolves, so a
# saved link opens exactly as it did yesterday.
#
# HIDING A SURFACE HAS TWO HALVES, and only the first is obvious. Off the menu
# in config/hubs.ts, AND declared in scripts/nav-audit.mjs with a reason the
# audit prints. /beauty/makeup was hidden in August without the second half and
# nav-audit failed on it for a day, which is how every landing script since came
# to measure itself against a main that was already red. Both halves here.
#
# AND NO DOOR IS LEFT ON IT. Body Goal carried "See my weekly plan ->" pointing
# straight at the room. A link into a surface that is off the map is how a
# hidden page comes back by accident, and it is the one thing that would make
# nav-audit and the next reader disagree about whether it exists.
#
# THE NUMBERING CLOSES UP, 01-09 with no gap at 03: a menu that counts 01-02-04
# is a menu advertising the thing it is trying not to advertise. one-bag's
# contiguity check covers every hub, so this is gated rather than eyeballed.
#
# Frontend only - no API file is touched, no endpoint is removed, and the server
# is not built or tested here.
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
git log --oneline -40 | grep 'A room off the map' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
H="$W/src/config/hubs.ts"
N="$W/scripts/nav-audit.mjs"
B="$W/src/features/fitness/pages/BodyGoal.tsx"
T="$W/src/app/one-bag.test.ts"
R="$W/src/app/router.tsx"
for f in "$H" "$N" "$B" "$T" "$R"; do [ -f "$f" ] || die "missing $f"; done
grep -q "label: 'My Plan'" "$H" && die "My Plan is still on the menu"
grep -q "path: '/fitness/plan'" "$R" || die "the route was removed - this change hides the room, it does not demolish it"
grep -q "'/fitness/plan'," "$N" || die "the silence is not declared to nav-audit"
grep -q 'to="/fitness/plan"' "$B" && die "Body Goal still carries a door into it"
grep -q "index: '09', label: 'My Orders'" "$H" || die "the fitness numbering did not close up"
ok "all five files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(config/hubs\.ts|scripts/nav-audit\.mjs|fitness/pages/BodyGoal\.tsx|app/one-bag\.test\.ts|land-a-room-off-the-map\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
# one-bag owns this rule: every hidden surface declared with a reason, and no
# gap in ANY hub menu. It gained /fitness/plan as its third entry.
npx vitest run src/app/one-bag.test.ts || die "the hidden-surface guard"
ok "the hidden-surface guard passes, now over three rooms"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
# The one that would have caught the makeup mistake. It must be CLEAN, not
# merely no worse: a route nobody links and nobody declared is the failure this
# change could have introduced.
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$H" "$N" "$B" "$T" land-a-room-off-the-map.sh
git commit -q -m "A room off the map

My Plan comes off the Fitness menu at the owner's word. The room is left
standing: FitnessPlan.tsx, the plan engine and GET /fitness/plan are untouched
and the route still resolves, so a saved link opens exactly as it did. Third of
the same shape as the Makeup Studio and Activity Dating, on the same argument -
deleting a working surface in order to hide it is how a feature comes back as a
rewrite, and taking the door away is one line to put back.

Hiding has two halves and only the first is obvious: off the menu, AND declared
in nav-audit with a reason the audit prints. /beauty/makeup was hidden without
the second half and left that gate red for a day.

Body Goal's 'See my weekly plan' button goes with it - a door into a room that
is off the map is how a hidden page comes back by accident. The numbering closes
up 01-09 rather than leaving a gap at 03, which one-bag now checks for a third
room." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
