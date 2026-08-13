#!/usr/bin/env bash
# land-the-rail-belongs-to-the-room.sh  ·  run from the REPO ROOT
#
# Two holes in the rail that landed as "Every room has its own rail".
#
# 1 · COMPOSE LEFT THE ROOM. Pressing Compose in a project's own rail goes to
#     /mail/compose?project=<key> — a URL that does not start with /mail/p/, so
#     the sidebar reverted to the whole mailbox's mid-task. The one moment you
#     are most certain you are still inside the project is the moment you got
#     there from ITS menu, and that is exactly when the rail changed under you.
#     The composer counts as being in the room now, and its eyebrow says so.
#
# 2 · "PROJECTS" WAS SITTING IN ALL EMAILS' NUMBERED RAIL, as though it were
#     one of its folders. It is not: the numbered list is the folders of the
#     room you are standing in, and Projects is the door back to the wall. It
#     moves below the hairline — exactly where the project rail already keeps
#     its own way out, for the same reason — and All Emails renumbers 01-07.
#
# Three files, no API change.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling, and one-bag's contiguous-index rule re-checked by hand
# against the renumbered rail (01-07, no gap).
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The rail belongs to the room' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Every room has its own rail' >/dev/null; [ $? -eq 0 ] || die "run land-every-room-has-its-own-rail.sh first - this fixes the rail it added"
ok "the rails are in, these two holes are not"

say "2 - scope"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/(config/hubs\.ts|layouts/Sidebar\.tsx|features/mail/pages/Compose\.tsx)$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi
TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  printf '   \033[31mx\033[0m Tracked files outside the packages have uncommitted changes:\n'
  echo "$TRACKED_ELSEWHERE"
  exit 1
fi
ok "packages carry only this change"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify 8e5a3b20c2e2754a94c48a7bf9991472b198fdde7519096fb57fbf92ef68e531 "$W/src/layouts/Sidebar.tsx"
verify e685c6411cf3b4161de9e79e61d6ac4774eab5a0c214ab3e9a71d7283bc6b305 "$W/src/config/hubs.ts"
verify 272b5989aa45526a446797a2d93183fce81e289c00166519c8c11a9ee885778d "$W/src/features/mail/pages/Compose.tsx"

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "5 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add $W/src/layouts/Sidebar.tsx $W/src/config/hubs.ts $W/src/features/mail/pages/Compose.tsx \
        land-the-rail-belongs-to-the-room.sh

git commit -F - <<'MSG'
The rail belongs to the room

Two holes in the rail that landed last commit.

COMPOSE LEFT THE ROOM. Pressing Compose in a project's own rail goes to
/mail/compose?project=<key>, and the sidebar decided which room you were in by
reading the PATH alone - so a URL that does not begin /mail/p/ reverted the
rail to the whole mailbox's, mid-task. The one moment somebody is most certain
they are still inside a project is the moment they got there from its own
menu, and that is precisely when the navigation changed under them. It reads
the query too now, and the composer's eyebrow says which room it is writing in
rather than just "Mail".

"PROJECTS" WAS SITTING IN ALL EMAILS' NUMBERED RAIL as though it were one of
its folders, and it is not. The numbered list is the folders of the room you
are standing in - All Email, Compose, Sent, Drafts & Failed, Starred, Trash,
Drive - and Projects is the door back to the wall of rooms. So it moves below
the hairline, which is exactly where the project rail already keeps its own way
out, for exactly the same reason: a door out of a room does not belong in the
list of what is inside it. The two rails are now the same shape as each other,
which is the point.

All Emails renumbers 01-07. one-bag.test.ts holds every hub's rail to a
contiguous run and would have caught a gap; the renumber was checked against
its rule before this was written rather than after it failed.

No API change. `hub.items` still describes All Emails exactly as the other
twenty-four hubs describe themselves, and the mail-only branch in Sidebar.tsx
is one conditional beside the one that was already there.
MSG

ok committed
say "review, then:  git push"
