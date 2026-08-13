#!/bin/bash
# land-the-money-the-city-never-saw-2.sh — the spending log's foundation: a table,
# a migration, three endpoints and the arithmetic that counts them.
#
# ── WHY -2 ───────────────────────────────────────────────────────────────────
# The original ran on 13 Aug and its own lint gate stopped it: the new spec read
# the service source with a bare `require('fs')` at line 74, one error over
# main's baseline of 127. The fix is a top-level `import { readFileSync }` —
# nothing else changed. The original's patch was frozen the moment its name ran,
# so the corrected spec ships under this name with a fresh hash. Verified
# through the bridge after the fix: eslint exits 0 on the spec, jest passes all
# ten assertions.
#
# This is HALF the feature and deliberately so. The page comes next; nothing in
# this commit is reachable from the app, which is exactly what makes a schema
# change safe to land on its own — the migration goes out, Railway applies it on
# boot, and no screen changes until the second half arrives.
#
# ── READ THIS BEFORE RUNNING: ONE GATE COULD NOT BE RUN BY THE AUTHOR ────────
#
# `npx tsc --noEmit` FAILS in the Cowork bridge and MUST pass here. The Prisma
# client has to be regenerated before TypeScript knows `spendLogEntry` exists,
# and `prisma generate` downloads its engines — the bridge's VM has no network,
# so the client on disk is still the one without the new model. The errors it
# produces there are all "Property 'spendLogEntry' does not exist", which is the
# absence of a generate rather than a fault in the code.
#
# So this script runs `prisma generate` FIRST and then tsc, and if tsc fails
# here it is a real failure. Everything else was verified through the bridge:
# ten new assertions pass, and prisma validate is run below for the same reason.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The money the city never saw"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"One fold, two rooms"*) ;;
  *) echo "!! Run land-one-fold-two-rooms.sh first."; exit 1 ;;
esac

# ── the tree carries these seven paths, and nothing else that matters ──────
ALLOWED='^((M |MM| M) together-city-chat/(prisma/schema\.prisma|src/(financial/(financial\.service\.ts|financial\.controller\.ts|dto/financial\.dto\.ts)|shared/paging\.ts))|\?\? together-city-chat/(prisma/migrations/20260813010000_spend_log/|src/financial/a-log-is-not-a-ledger\.spec\.ts))$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"; exit 1
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="together-city-chat/$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify 496faadf50b1ad82b30d66057f72f54ebadcfa04e38b7b75083e8c016ea7d579 prisma/schema.prisma
verify 7abeeceedd151459d55e6769cadd8de393c7e7fe7720ecd162373d77cc327a9a prisma/migrations/20260813010000_spend_log/migration.sql
verify 61221771c097f6c3ddd5b5ef970783d4aff522f58bc21933f2fc2cfb0be87482 src/financial/financial.service.ts
verify d916931989f4863191eec6fb7a2835fe63d7d2792cc6393424681f80b239cfb9 src/financial/financial.controller.ts
verify 15aad79020d0d887faa2951c8cc8013ead82f259e0524e262d0875d239444242 src/financial/dto/financial.dto.ts
verify 1608be4fcd2404327e4161822f9458bc372abdaa887e3130d874edf52b075f7d src/shared/paging.ts
verify 978714c17ad97f05eb91090a0b00ed2940152e7fd064811415aecb233c773f98 src/financial/a-log-is-not-a-ledger.spec.ts
echo "== all seven files verified"

cd together-city-chat

echo "== gate: the schema parses"
npx prisma validate

echo "== gate: the client is regenerated (and this is why tsc could not run in the bridge)"
npx prisma generate

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: the suites this can reach"
npx jest src/financial src/shared --silent

echo "== gate: lint, held to the number on main"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || { echo "!! ESLint produced no readable report."; exit 1; }
if [ "$API_LINT" -gt "$API_BASELINE" ]; then
  echo "!! API lint went UP: $API_LINT, main is at $API_BASELINE:"
  npx eslint 'src/financial/**/*.ts' || true
  exit 1
fi
echo "   API lint errors: $API_LINT (main: $API_BASELINE). Nothing added."

echo "== gate: the build"
npm run build

cd ..

git add together-city-chat/prisma/schema.prisma \
        together-city-chat/prisma/migrations/20260813010000_spend_log \
        together-city-chat/src/financial \
        together-city-chat/src/shared/paging.ts \
        land-the-money-the-city-never-saw-2.sh

git commit -F - <<'MSG'
The money the city never saw

The Financial hub knows what the CITY moved: an order it placed, a wallet it
debited, a rate it charged. It has never known about the auto to work or the
chai downstairs, which on most people's months is where a good deal of the money
actually went.

This is the table, the migration, the three endpoints and the arithmetic. The
page comes next — nothing here is reachable from the app yet, which is precisely
what makes a schema change safe to land on its own: the migration goes out,
Railway applies it on boot, and no screen changes until the second half arrives.

── A TABLE, NOT JSON ON A PROFILE ─────────────────────────────────────────────

Which is the opposite of the call the gem cart made one migration ago, and the
difference is worth writing down. A cart is ONE evolving object per citizen,
read and rewritten whole. A log is MANY immutable rows, appended forever, read
by month and summed. JSON would mean rewriting a year of entries to add today's,
with no index on the only column anybody filters by.

THREE COLUMNS AND NO CATEGORY, and the absence is the design. Asking somebody to
file "auto to work, ₹80" under one of seven headings before the entry will save
is how a log stops being written in. A test asserts the DTO has exactly three
fields, so a later "improvement" that makes categories mandatory has to argue
with something.

`spentOn` IS A DATE COLUMN AND NOT A TIMESTAMP. Somebody logging yesterday's
coffee is naming a DAY. Stored as an instant, an entry made at 01:00 in
Asia/Kolkata falls on the previous UTC day and lands in the wrong month for five
and a half hours out of every twenty-four — the exact bug the shared clock
service exists to prevent everywhere else. The DTO takes YYYY-MM-DD and refuses
a timestamp outright.

── IT JOINS THE TOTAL AND NOT THE CATEGORIES ──────────────────────────────────

A log entry has no category and cannot be given one, so it cannot join
`byCategory` without inventing a heading the citizen never chose. It joins the
month TOTAL, because "what did I spend" is a question about money rather than
about who moved it, and `cityInr` and `loggedInr` are reported separately so
neither can be mistaken for the other.

The part worth guarding is the denominator. Category percentages divide by the
CITY total, not the combined one — a category reading "32%" of a number that
includes uncategorised cash is describing a share of something it is not a share
of, every bar would be quietly short, and nothing would look broken. There is a
test that fails if somebody ever "fixes" it to use the combined figure.

THE LIST IS CAPPED AND THE ARITHMETIC IS NOT, which is paging.ts's own rule
quoted back at it: a cap on a list is a slow query avoided, a cap on a
computation is a wrong number shipped. `spendLog` takes SPEND_LOG_CAP;
`loggedInMonth` aggregates its own window and takes nothing.

AND IT SAYS SO, which is the part the first pass got wrong. The unbounded-read
ceiling requires every uncapped findMany to sit beside an `// unbounded:
<reason>` line, and the comment is the point: it forces the list-or-computation
call to be made explicitly, once, where the query is. The call here was made
correctly, a test was written asserting it, and this message quoted the rule —
while the one line the guard actually reads was missing. The ceiling caught it.
Both specs now hold the same fact from opposite sides: the month slice carries
no cap, and it carries the declaration.

The delete is scoped by owner IN the statement rather than after a read — two
round trips and a race, versus one statement that cannot touch somebody else's
row.

── THE LINT GATE EARNED ITS KEEP ──────────────────────────────────────────────

The first landing attempt stopped itself: the new spec read the service source
with a bare `require('fs')`, one lint error over main's baseline of 127. The
fix is a top-level import — the -2 script exists because the patch was frozen
the moment the original's name ran, not because anything else changed.

── ONE GATE THE AUTHOR COULD NOT RUN, SAID PLAINLY ────────────────────────────

`tsc` fails in the Cowork bridge and passes here, and the landing script says why
at the top: TypeScript does not know `spendLogEntry` exists until the Prisma
client is regenerated, `prisma generate` downloads its engines, and the bridge's
VM has no network. Every error it produced there was "Property 'spendLogEntry'
does not exist" — the absence of a generate, not a fault in the code.

So the script runs `prisma validate`, then `prisma generate`, then tsc, in that
order. Everything else was verified through the bridge, including the ten new
assertions in a-log-is-not-a-ledger.spec.ts.

No web change. Nothing in the app reads any of this yet.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The money the city never saw
 Push — Railway rebuilds and applies the migration on boot.
 Nothing on screen changes; the page is the next commit.
===============================================================

DONE
