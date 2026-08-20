#!/usr/bin/env bash
# land-mira-2.sh — the map is guarded, and a dead export is gone.
#
# A separate script rather than an edit to land-mira.sh: that one has been run,
# so its name is frozen and its contents must keep matching what shipped.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-2.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="Mira's map is held against the real one"
PREV="Mira reads, and takes the top of the chat hub"

# Captured, not piped — grep -q closes the pipe and SIGPIPEs git under pipefail,
# which reports failure BECAUSE the check succeeded. That cost a run last time.
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-chat/src/mira/city(\.spec)?\.ts$'
KNOWN_MAIL='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/(chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|mail/)|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- "$API" "$WEB" | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN_MAIL" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch"
shasum -a 256 -c - <<'SHASUMS'
9e080c4ccd8c7479737fdb917d5fecd1840f154909f31f6e23d6ead8f4b3d83a  together-city-chat/src/mira/city.ts
8a4cbe26e0e75539688db00852d923f915a5dc2283a00580d46a74cfb89a0347  together-city-chat/src/mira/city.spec.ts
SHASUMS

say "API · tsc";         (cd "$API" && npx tsc --noEmit -p tsconfig.json) || die "API tsc"
say "API · eslint";      (cd "$API" && npx eslint src/mira/)              || die "API lint"
say "API · jest (mira)"; (cd "$API" && npx jest src/mira --silent)        || die "mira suite"

say "staging"
git add "$API/src/mira/city.ts" "$API/src/mira/city.spec.ts"

git commit -F - <<'MSG'
Mira's map is held against the real one

city.spec.ts reads config/hubs.ts and nav/registry.ts out of the web package —
the same cross-package read route-reach.spec.ts already does — and asserts that
every room Mira offers to take somebody to actually exists there.

The map is declared in the API rather than imported because the two packages
share nothing but a network contract and deploy separately. But a copy that CAN
drift will, and the failure mode is Mira confidently offering to walk somebody
to a page that was renamed last month. Asserted, therefore, rather than trusted.

The first test in that file checks it can read the web package at all. Without
it every assertion below is vacuously true the day the relative path changes,
which is the standard way a cross-package guard dies quietly.

Also asserts what the personalisation graph is FOR: every entry is phrased as
something that happens rather than something collected. "We collect your
allergens" is a privacy policy; "no restaurant that serves you peanuts will be
shown to you again" is a reason, and only the second has ever persuaded anybody.
The test rejects the first shape outright.

REMOVED: nextPersonalisation, which had no caller. It was written for phase 5 —
proactively offering to learn something — and arrived three phases early. The
web package has a dead-export ratchet that would have caught this; the API has
none, so it took a hand check after landing. An export with no importer is where
a feature gets built by mistake.

65 new tests, 279 in src/mira.
MSG

say "committed. Now: git push"
git log --oneline -1
