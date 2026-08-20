#!/usr/bin/env bash
# land-mira-3.sh — unblock the deploy. Chats.tsx stops calling a send that
# only exists in the working tree.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-3.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

WEB=together-city-react
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="A call site cannot outrun its callee"
PREV="Mira's map is held against the real one"
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

say "verifying the patch"
shasum -a 256 -c - <<'SHASUMS'
9ba7656fbc69bebdf04bb1cf6cd17686bdb25e509b13cbf5b12c653929155123  together-city-react/src/features/chat/pages/Chats.tsx
SHASUMS

# ── THE GATE THAT WAS MISSING ───────────────────────────────────────────────
# Typecheck against what will actually be COMMITTED, not against the working
# tree. That distinction is the entire reason the last two deploys failed:
# Chats.tsx was staged while the chat.api.ts change it depended on was not, so
# every gate passed on this machine and Vercel — building from the commit —
# got `Expected 1-3 arguments, but got 4`.
#
# A pristine checkout of HEAD plus exactly the staged files, typechecked. It is
# the cheapest possible simulation of the build host.
say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
cp "$WEB/src/features/chat/pages/Chats.tsx" "$TMP/$WEB/src/features/chat/pages/Chats.tsx"
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is exactly what Vercel would report"

say "WEB · tsc against the working tree"; (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";      (cd "$WEB" && npx eslint src/features/chat/pages/Chats.tsx) || die "lint"
say "WEB · vitest";      (cd "$WEB" && npx vitest run)                  || die "vitest"
say "WEB · nav-audit";   (cd "$WEB" && node scripts/nav-audit.mjs)      || die "nav audit"
say "WEB · build";       (cd "$WEB" && npm run build)                   || die "build"

say "staging"
git add "$WEB/src/features/chat/pages/Chats.tsx"

git commit -F - <<'MSG'
A call site cannot outrun its callee

Vercel has failed twice — 5992d29 and e7938d2 both ERROR, so production is
still serving c761e13 and Mira is not on the site. One error, both times:

  src/features/chat/pages/Chats.tsx(219,40)
  error TS2554: Expected 1-3 arguments, but got 4.

Chats.tsx calls send(body, attachments, answering, share). The fourth argument
exists in an in-progress change to chat.api.ts that has NOT landed. Locally the
call compiles against the modified file; Vercel compiles against the committed
one, where send still takes three.

WHY EVERY GATE PASSED ANYWAY. They all ran against the working tree. tsc,
vitest and `npm run build` were all reading a chat.api.ts that is not in any
commit — so the machine that wrote the change is the one machine that cannot
detect it. A half-landed feature is invisible to every check that runs where
it is half-landed.

That was called out in 5992d29's own message — "Chats.tsx also carries ~6 lines
of unrelated in-progress chat work that could not be separated by path" — and
shipped regardless. Naming a risk is not managing it.

THE FIX IS TO STOP FORWARDING, NOT TO SHIP THE FEATURE. The share control lives
in Composer.tsx, which has not landed either, so no caller in this branch can
supply a share: nothing is lost by dropping it. The parameter is removed rather
than ignored because eslint has no underscore exemption, and a callback taking
fewer arguments is still assignable where more are expected — so Composer's
onSend type keeps accepting this and the working tree keeps compiling. When the
share work lands, the parameter and the fourth argument return together.

AND A NEW GATE, so this cannot recur. land-mira-3.sh typechecks a pristine
`git archive HEAD` plus exactly the staged files, which is the cheapest
available simulation of the build host. Any future script that stages a file
touching work in flight should carry it.
MSG

say "committed. Now: git push"
git log --oneline -1
