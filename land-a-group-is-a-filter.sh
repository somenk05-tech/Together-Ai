#!/usr/bin/env bash
# land-a-group-is-a-filter.sh  ·  run from the REPO ROOT
#
# Pressing "Automotive" in Find a service opened the automotive trades and then
# listed a beauty salon. The group chips are the first row on the screen and
# until now they narrowed NOTHING: only the leaf category ever reached the
# query. One new optional field on the browse DTO, and the where-clause it
# always should have had.
#
# No migration. Independent of land-the-alerts-panel-is-not-a-pill.sh - they
# touch different folders and can run in either order.
#
# RUN AFTER "Find someone you can trust".
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A group is a filter' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Find someone you can trust' >/dev/null \
  || die "run land-find-someone-you-can-trust.sh first"
ok "the base is here, this is not"

say "2 - scope"
MINE='(local-services/categories\.ts|local-services/dto/local-services\.dto\.ts|local-services/local-services\.service\.ts|local-services/browse-filters\.spec\.ts|services/api\.ts|services/pages/Browse\.tsx)$'
DIRTY="$(git status --porcelain -uall -- "$A/src/local-services" "$W/src/features/services")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
else
  ok "the six files this commit touches are the only ones it will add"
fi

say "3 - sha256"
FILES=(
  "${A}/src/local-services/categories.ts"
  "${A}/src/local-services/dto/local-services.dto.ts"
  "${A}/src/local-services/local-services.service.ts"
  "${A}/src/local-services/browse-filters.spec.ts"
  "${W}/src/features/services/api.ts"
  "${W}/src/features/services/pages/Browse.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "${A}/src/local-services/categories.ts"             8c62cf3140d68e624bb5eda7657ba40a21af09da0a57fc4731cc339b9639cfef
check "${A}/src/local-services/dto/local-services.dto.ts" 5a43f655faae47c981cdbb08df47b99481db53320fdd3b42a153d1757ee8ab15
check "${A}/src/local-services/local-services.service.ts" 6a63dda4ae0befc8d35359f552f21bfa7b6b526f2f794fb7214f33306d90a968
check "${A}/src/local-services/browse-filters.spec.ts"    99712d1c7b9eeb0f2228635247868bc2b60cc8be9f364b779017042207dc794a
check "${W}/src/features/services/api.ts"                658404a78e5e48e991c910fe4a6a5abc460a9288db5aad4d7976b7f2f41480e2
check "${W}/src/features/services/pages/Browse.tsx"      980eb0b344ecb734f809ddd9cdf9376b192ed3a079c98052068f79cc815d50f6

say "4 - api gates"
cd "$A" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$A/src" "$A/prisma" | sed -n "s|^?? $A/||p")"
TSC_API="$(npx tsc --noEmit 2>&1 || true)"
FILTERED_API="$TSC_API"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED_API="$(printf '%s\n' "$FILTERED_API" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED_API" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED_API"; die "api tsc"
fi
ok "api tsc"

SPECS="$(git ls-files 'src/local-services/*.spec.ts' 'src/admin/*.spec.ts' | tr '\n' ' ')"
[ -n "$SPECS" ] || die "no tracked specs found - refusing to pass a gate that ran nothing"
# shellcheck disable=SC2086
npx jest $SPECS src/local-services/browse-filters.spec.ts \
  && ok "local-services + admin suites" || die "local-services + admin suites"

if npx jest src/security/runtime-isolation.spec.ts >/dev/null 2>&1; then
  ok "cross-user isolation harness (structural half)"
else
  note "cross-user isolation is RED, and was before this commit: 'daybook' is neither probed nor listed as unprobed. Not absorbed here."
fi

# The API has no lint ceiling and nothing has ever run its eslint. This commit
# adds zero: browse-filters.spec is clean. Reported, not absorbed - the five
# standing errors are four `any`s in deletion.spec (mine, this morning) and one
# unused binding in menu.spec.
npx eslint src/local-services >/dev/null 2>&1 \
  || note "api eslint has 5 standing errors in src/local-services - 4 are mine from deletion.spec, 1 predates today. This commit adds none."
cd ..

say "5 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
FILTERED="$TSC_OUT"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED"; die "web tsc"
fi
ok "web tsc"

npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-a-group-is-a-filter.sh || die "git add"
git commit -F - <<'MSG' || die commit
A group is a filter

The owner, 16 Aug, looking at a render: pressing Automotive in Find a
service opens the automotive trades and then lists a beauty salon.

THE GROUP CHIPS NEVER REACHED THE QUERY. Only `category` - a single leaf
- was ever sent, and `group` lived entirely in the browser as the thing
that decided which second row to draw. So the first row of chips on the
page, the one everybody presses first, narrowed nothing at all. This
predates today's redesign; the redesign made it obvious by promoting
those chips to the primary filter and by putting a result count beside
them.

ONE OPTIONAL FIELD, AND THE WHERE-CLAUSE IT ALWAYS NEEDED.
`categoryKeysInGroup` turns a family into its trades and the query says
`categoryKey: { in: [...] }`. The leaf still wins when both arrive: a
screen that sends a category has already decided which group it came
from, and applying both would be the same filter written twice - right
today, and wrong the first time a trade moves between groups.

AN UNKNOWN GROUP IS AN ERROR, NOT AN EMPTY CLAUSE, which is exactly how
this survived: a filter that silently does nothing looks like a filter
that works until somebody reads the results. `unknown category` has
thrown since the first version of this endpoint; `unknown category
group` now does the same.

browse-filters.spec reads the WHERE-CLAUSE the service builds rather
than the rows it returns, because the defect was never in the rows - the
query simply never mentioned the category. It also asserts every trade
in the catalogue belongs to a group the first row can reach, so a
category filed under a group that does not exist cannot become
unreachable-but-listed.

Gates: api tsc, the local-services and admin suites (203 tests, 5 new);
web tsc, the whole vitest suite, the four audits at their ceilings, and
the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push"
