#!/usr/bin/env bash
# land-mira-seed.sh — every ask returns 400. One number, written down twice.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-seed.sh && git push
#
# API only. No web change — the web has been sending a legal seed all along.

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="One seed ceiling, not two"
PREV="main compiles again"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-chat/src/mira/(mira\.controller|seed\.spec)\.ts$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- "$API" "$WEB" | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
b3a2c80a99baba6e2dda724ab16f4e2dd14e5e18bce2a2f8c24e8562c4b0369d  together-city-chat/src/mira/mira.controller.ts
9537c58240c1baf4cf67aab12778ec39a0521db5ca7e72f2ceffa5ff52f4f815  together-city-chat/src/mira/seed.spec.ts
SHASUMS

# ── THE GATE THAT WAS HERE ALREADY, AND WHY IT SAW NOTHING ───────────────────
# land-mira-mood.sh compared the web's ceiling against the API's like this:
#
#   grep -oE 'seed: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\([0-9_]+\)' mira.controller.ts
#
# `z.coerce` matches GreetSchema and ONLY GreetSchema. AskSchema spells it
# `z.number()`, so the gate compared ten million against ten million, printed
# "both 10000000", and never looked at the one that said a million.
#
# A gate that finds the first thing matching its pattern has not checked a
# property, it has checked an example. So this one asserts the ABSENCE of the
# thing that can diverge: no `seed:` line in that file may carry a number at all.
say "no seed bound in the controller is a literal"
LITERALS=$(grep -nE '^\s*seed:.*\.max\([0-9]' "$API/src/mira/mira.controller.ts" || true)
if [ -n "$LITERALS" ]; then
  printf '%s\n' "$LITERALS"
  die "a seed bound is written as a number — it must be SEED_MAX, or it will drift again"
fi
say "  none — both schemas read one constant"

# And that constant still has to agree with the number the web actually sends.
say "the API's one ceiling matches the web's"
CEIL_API=$(grep -oE 'export const SEED_MAX = [0-9_]+' "$API/src/mira/mira.controller.ts" | grep -oE '[0-9][0-9_]*' | tr -d _)
CEIL_WEB=$(grep -oE 'SEED_CEILING = [0-9_]+' "$WEB/src/features/chat/mira/day.ts" | grep -oE '[0-9][0-9_]*' | tr -d _)
[ -n "$CEIL_API" ] && [ -n "$CEIL_WEB" ] || die "could not read both ceilings — this gate is not measuring anything"
[ "$CEIL_API" = "$CEIL_WEB" ] || die "the API accepts up to $CEIL_API and the web sends up to $CEIL_WEB"
say "  both $CEIL_API"

# PROVE THE GATE STILL BITES. A check that has never failed is a check nobody
# has confirmed is wired up — and the check it replaces passed happily through
# the exact defect it was written for.
say "and the gate fails on the defect it was written for"
SCRATCH=$(mktemp)
sed 's/\.max(SEED_MAX)\.optional()/.max(1_000_000).optional()/' \
  "$API/src/mira/mira.controller.ts" > "$SCRATCH"
if grep -qE '^\s*seed:.*\.max\([0-9]' "$SCRATCH"; then
  say "  it does"
else
  rm -f "$SCRATCH"; die "the literal check does not catch a literal — it is decoration"
fi
rm -f "$SCRATCH"

# ── THE COMMITTED-TREE TYPECHECK ─────────────────────────────────────────────
# Every gate below reads the WORKING tree, where an unstaged file is present.
# `main` did not compile for a day because of exactly that. This builds what
# will actually be committed: HEAD, plus these two files, and nothing else.
say "API · tsc against the committed tree plus these two files"
ATMP=$(mktemp -d)
trap 'rm -rf "$ATMP"' EXIT
git archive HEAD "$API" | tar -x -C "$ATMP"
cp "$API/src/mira/mira.controller.ts" "$ATMP/$API/src/mira/mira.controller.ts"
cp "$API/src/mira/seed.spec.ts"       "$ATMP/$API/src/mira/seed.spec.ts"
ln -s "$PWD/$API/node_modules" "$ATMP/$API/node_modules"
(cd "$ATMP/$API" && npx tsc --noEmit -p tsconfig.json) \
  || die "does not compile from the committed tree — Railway would fail here"
say "API · the real build, in the same checkout"
(cd "$ATMP/$API" && npm run build) || die "nest build fails — Railway would fail here too"

say "API · eslint";           (cd "$API" && npx eslint src/mira/)           || die "lint"
say "API · jest (mira)";      (cd "$API" && npx jest src/mira --silent)     || die "mira suite"
say "API · jest (security)";  (cd "$API" && npx jest src/security --silent) || die "security suite"

say "staging"
git add "$API/src/mira/mira.controller.ts" "$API/src/mira/seed.spec.ts"

git commit -F - <<'MSG'
One seed ceiling, not two

Mira answered "I'm not reaching the city right now" to every question, minutes
after the deploy that was supposed to fix her. The city was up. The greeting
returned 200. `POST /api/mira/ask` returned 400.

    00:03:46  GET   /api/mira/greeting   200   22ms
    00:03:53  POST  /api/mira/ask        400   15ms
    00:04:02  POST  /api/mira/ask        400   13ms

Railway's HTTP log is the only place that said so. From the app it looks
identical to the API being down, and it had just been down for a day, so it read
as the deploy not having worked.

── THE DEFECT ─────────────────────────────────────────────────────────────────

The seed appeared twice in one file, with two different bounds:

    AskSchema     seed: z.number().int().min(0).max(1_000_000).optional()
    GreetSchema   seed: z.coerce.number().int().min(0).max(10_000_000)

`daySeed()` in the web package returns `hash % 10_000_000`. So on any day whose
seed lands above a million — most days — the greeting is accepted and every
single ask is rejected. Not degraded. Every turn, all day, until midnight
re-rolls it into the lucky ten percent.

One constant now, `SEED_MAX`, read by both.

── AND THE GATE THAT WATCHED IT HAPPEN ────────────────────────────────────────

There was already a check for this. `land-mira-mood.sh` compared the web's
ceiling against the API's, and it was written the day a full 32-bit hash would
have 400'd every greeting — the right idea, aimed at the right seam. It read the
API side like this:

    grep -oE 'seed: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\([0-9_]+\)'

`z.coerce` matches GreetSchema and only GreetSchema. AskSchema spells it
`z.number()`. So the gate found ten million, compared it against ten million,
printed "both 10000000", and passed — while the bound it was written to protect
sat four lines above, unread.

A GATE THAT MATCHES THE FIRST THING FITTING ITS PATTERN HAS CHECKED AN EXAMPLE,
NOT A PROPERTY. This is the third time this week that a check read a fiction:
`route-inventory.ts` took the first `@Controller` in a file, `manifest.ts` parsed
source that `dist/` does not contain, and now this. Each was green.

So the replacement asserts an ABSENCE rather than an equality: no `seed:` line in
that file may carry a numeric literal at all. There is nothing left for a regex
to miss, because there is nothing left to spell two ways. The script then proves
the check still bites, by running it against a copy with the old bound pasted
back — because a gate that has never failed is a gate nobody has confirmed is
connected, and the one it replaces is precisely that.

── AND FROM INSIDE, WHERE A REGEX CANNOT REACH ────────────────────────────────

`seed.spec.ts` parses the largest number the web can produce through BOTH schemas
and asserts both accept it, and that neither accepts one more — the point is one
ceiling, not no ceiling. It also asserts the ask still parses with no seed at
all, because an older client that has never heard of the field must keep getting
answers. That is the same rule as `mood` being optional on the reply, pointed the
other way down the wire.

── NOT FIXED HERE, AND NAMED ──────────────────────────────────────────────────

`POST /api/chat/__mira__/read` returns 403 on every open of her thread. The
client marks the pinned row read like any conversation, and `__mira__` is not a
conversation — she is a position in the list, not a row in the database, which
is the decision 5992d29 made and the right one. Nothing breaks and nobody sees
it, so it does not ride along in this commit. It is either a client that knows
not to ask, or a route that answers 204 for her, and that is a separate change.
MSG

say "landed. now: git push"
