#!/usr/bin/env bash
# land-main-compiles.sh — main has not compiled for a day. RUN THIS FIRST.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-main-compiles.sh && git push
#
# One file, four lines removed. Nothing Mira does reaches production until this
# lands, because every Railway build since 5392f63 has failed and the host has
# been serving the container from before it.

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="main compiles again"
PREV="A control icon that has to be asked about is the wrong icon"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-chat/src/mail/mail\.controller\.ts$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts|mira/(relate(\.spec)?\.ts|ledger\.ts|mira\.service\.ts|mira\.controller\.ts))|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/(a-place-and-a-person|mira-says-what-day-she-is-having)\.test\.ts|features/chat/(mira/|components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|styles/mira\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
c756968387444c2452ebbf05850c79f7830cf40048baa9a918341c7226e4db96  together-city-chat/src/mail/mail.controller.ts
SHASUMS

# ── PROVE THE CLAIM BEFORE FIXING IT ─────────────────────────────────────────
# If HEAD already compiles, this script is solving a problem that is not there
# and should not be committing anything.
say "confirming main is actually broken right now"
BTMP=$(mktemp -d)
git archive HEAD "$API" | tar -x -C "$BTMP"
ln -s "$PWD/$API/node_modules" "$BTMP/$API/node_modules"
if (cd "$BTMP/$API" && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1); then
  rm -rf "$BTMP"
  die "HEAD already compiles — somebody has fixed this. Re-read before committing."
fi
say "  it is:"
(cd "$BTMP/$API" && npx tsc --noEmit -p tsconfig.json 2>&1 | head -4 | sed 's/^/    /') || true
rm -rf "$BTMP"

# ── AND PROVE THE FIX, THE WAY RAILWAY WOULD ─────────────────────────────────
say "API · tsc against the committed tree plus this one file"
ATMP=$(mktemp -d)
trap 'rm -rf "$ATMP"' EXIT
git archive HEAD "$API" | tar -x -C "$ATMP"
cp "$API/src/mail/mail.controller.ts" "$ATMP/$API/src/mail/mail.controller.ts"
ln -s "$PWD/$API/node_modules" "$ATMP/$API/node_modules"
(cd "$ATMP/$API" && npx tsc --noEmit -p tsconfig.json) \
  || die "still does not compile from the committed tree"
say "API · the real build, in the same checkout"
(cd "$ATMP/$API" && npm run build) || die "nest build fails — Railway would fail here too"

say "API · tsc (working tree)";  (cd "$API" && npx tsc --noEmit -p tsconfig.json) || die "working tree tsc"
say "API · eslint";              (cd "$API" && npx eslint src/mail/mail.controller.ts) || die "lint"
say "API · jest (mira)";         (cd "$API" && npx jest src/mira --silent)     || die "mira suite"
say "API · jest (security)";     (cd "$API" && npx jest src/security --silent) || die "security suite"

say "staging"
git add "$API/src/mail/mail.controller.ts"

git commit -F - <<'MSG'
main compiles again

`main` has not compiled since 5392f63. Every Railway build since has failed, the
host has kept serving the container from before it, and a day of work has been
pushed to a production that could not receive it.

    src/mail/mail.controller.ts:83:22 - error TS2339:
      Property 'emptyTrash' does not exist on type 'MailService'.

── HOW IT HAPPENED, AND IT WAS MINE ───────────────────────────────────────────

5392f63 is a Mira commit. It staged `mail.controller.ts` to add one `@Mira()`
decorator to `GET /mail/account` — and that file also contained four lines of
another session's in-progress feature, `DELETE /mail/trash`. Its service method,
`MailService.emptyTrash`, was and still is uncommitted: 473 changed lines of
work in flight.

So the call shipped and the method did not.

── WHY NOTHING CAUGHT IT ──────────────────────────────────────────────────────

Every gate read the WORKING tree, where the method is present. tsc passed. 585
tests passed. `nest build` passed. The image built cleanly from the lockfile in
a fresh container on Node 22, because I ran that too — from a tarball of the
working tree.

The web package has had a committed-tree typecheck since two Vercel deploys died
of exactly this shape: a staged file depending on an unstaged one. THE API NEVER
GOT THE SAME GATE. It is added now, to every script that stages an API file, and
it is the only reason this class of failure is findable at all — from the
outside a broken build is invisible, because the previous container answers
every request correctly.

Worse, it sent the diagnosis somewhere else. `/api/health` returned 200, so the
API "was up"; the deployed strings were old, so "the deploy had not run". The
registry hardening in the previous commit was a real bug and a correct fix, and
it was not this one.

── THE REPAIR ─────────────────────────────────────────────────────────────────

The route is REMOVED, not completed. Completing it means committing 473 lines of
somebody else's unfinished service, and committing somebody's work in progress is
the entire cause of this.

The four lines are written into the file where they were, so restoring them is a
paste rather than an archaeology, and they belong in the commit that lands
`MailService.emptyTrash` — not before it. Nothing calls `DELETE /mail/trash`
from the web app, so removing it costs no behaviour.

── AND THE RULE UNDERNEATH ────────────────────────────────────────────────────

A land script may not stage a file it did not write every line of. `mail/` has
been on every allow-list in this run as "allowed to be dirty, never staged" —
and then one decorator was added to a file inside it and that discipline was
quietly dropped. The scope check that names dirty files cannot see this: after
an edit, a file carrying somebody else's work looks exactly like a file carrying
only yours. Only building what will actually be committed can tell them apart.
MSG

say "landed. now: git push — and watch the Railway build finish for once"
