#!/usr/bin/env bash
# land-mail-door.sh — the Mail button opens the mailbox.
#
# Its own script, and its own commit: this has nothing to do with Mira and it
# IS separable by path, which is the whole test for whether it should ride
# along in somebody else's change. 5992d29 carried six lines of unrelated chat
# work because they could not be separated; these two files can.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mail-door.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="The Mail button opens the mailbox"
# NOTE: this is the subject as it was actually COMMITTED, which is not the
# string land-mira-5.sh held in its own SUBJECT variable. That script's variable
# was updated when the voice work was folded in; the first line of its commit
# heredoc was not, so the two disagree by ", and speaks". Harmless except that
# -5's own "already here" guard can no longer match its own commit. Recorded
# here rather than fixed there, because -5 has run and its name is frozen.
PREV="She stops asking the same question, and gets the whole city"

# Captured, not piped — grep -q closes the pipe and SIGPIPEs git under pipefail,
# which reports failure BECAUSE the check succeeded. That cost a run once.
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-react/src/(layouts/QuickActions\.tsx|app/layout-claims-its-room\.test\.ts)$'
KNOWN_MAIL='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/(chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|mail/)|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN_MAIL" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
21f72d81eacc64efd001879863bd2ad19f3f1e8440be7967f85ae828ff733cf9  together-city-react/src/layouts/QuickActions.tsx
38e77f04d11bde765437ec61734d898aac7ca58404bbc425e875cc37147a7fa6  together-city-react/src/app/layout-claims-its-room.test.ts
SHASUMS

# The gate that has been on every script since two deploys failed: typecheck
# what will be COMMITTED, not the working tree.
say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/layouts/QuickActions.tsx src/app/layout-claims-its-room.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";            (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";         (cd "$WEB" && npx eslint src/layouts/QuickActions.tsx src/app/layout-claims-its-room.test.ts) || die "lint"
say "WEB · vitest";         (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · nav-audit";      (cd "$WEB" && node scripts/nav-audit.mjs)        || die "nav audit"
say "WEB · lint-ceiling";   (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · build";          (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add "$WEB/src/layouts/QuickActions.tsx" "$WEB/src/app/layout-claims-its-room.test.ts"

git commit -F - <<'MSG'
The Mail button opens the mailbox

The pill in the header pointed at `/mail/inbox` — the flat list of every
message. That is a reasonable default and the wrong front door: it skips the
projects entirely, so somebody who has filed their mail into rooms arrives on
the one screen that ignores them, and has to navigate back out of it to reach
what they built.

`/mail` renders the hub's own landing — All Emails and the projects side by
side — and it is the path `config/hubs.ts` has declared for this hub since it
was written. The header was the only thing in the application not using it.
The folder is one click IN from the mailbox; the mailbox was not one click out.

WHY THIS IS A TEST AND NOT A ONE-LINE COMMIT. Both paths work. The old one
renders a real page with real mail in it, nothing errors, nothing looks broken,
and no gate would have caught the regression coming back. The only symptom is a
citizen never finding the rooms they filed things into — which is a thing a
person cannot notice, because the screen they land on looks fine. So the
assertion lives in `layout-claims-its-room.test.ts`, beside the other guards on
the header's shape.

That file's phone clause got stricter on the way past: it asserted the phone
media query does not hide `/mail/inbox`, because Mail is not in the bottom bar
and hiding it would leave the mailbox with no door on a phone at all. It now
asserts the same thing about `a[href="/mail"]`, which is a prefix of the old
string and therefore covers both spellings rather than only the one that just
stopped existing.

Separate from the Mira work on purpose. It has nothing to do with it and it is
separable by path — which is the whole test for whether a change may ride along
in somebody else's commit.
MSG

say "landed. now: git push"
