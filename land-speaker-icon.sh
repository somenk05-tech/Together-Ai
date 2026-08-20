#!/usr/bin/env bash
# land-speaker-icon.sh — the button says what it is.
#
# Independent of everything else in flight. The reply-screen change is parked in
# _to_delete/reply-shows-it/ — Compose.tsx carries another session's uncommitted
# autocomplete rewrite — and land-phone-door.sh is its own commit. Run this in
# either order with that one.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-speaker-icon.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="A control icon that has to be asked about is the wrong icon"
PREV="A new field in a reply is optional, or the deploy is an outage"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-react/src/(components/ui/Icon\.tsx|features/chat/mira/MiraThread\.tsx|app/mira-speaks-and-listens\.test\.ts)$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/(a-place-and-a-person|mira-has-a-door-on-a-phone)\.test\.ts|pages/Home\.tsx|features/chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
eb74dd6c4faac8bfb959d022ebfd7e6255e49d033b1c01ebf15ec81f96efef8f  together-city-react/src/components/ui/Icon.tsx
85da1c08760e8308a2508c0b945aac88669947725c797e950b2fba1e2c9119b3  together-city-react/src/features/chat/mira/MiraThread.tsx
b4e123b5f24ced62f6bb302572fc7787b69d1b537144ff6e1972235b61c4e8e9  together-city-react/src/app/mira-speaks-and-listens.test.ts
SHASUMS

say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/components/ui/Icon.tsx src/features/chat/mira/MiraThread.tsx \
         src/app/mira-speaks-and-listens.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";          (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";       (cd "$WEB" && npx eslint src/components/ui/Icon.tsx src/features/chat/mira src/app/mira-speaks-and-listens.test.ts) || die "lint"
say "WEB · vitest";       (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling"; (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · build";        (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add \
  "$WEB/src/components/ui/Icon.tsx" \
  "$WEB/src/features/chat/mira/MiraThread.tsx" \
  "$WEB/src/app/mira-speaks-and-listens.test.ts"

git commit -F - <<'MSG'
A control icon that has to be asked about is the wrong icon

The button that turns Mira's voice on and off was a megaphone. The owner's
first question on seeing it was "what does this button do?" — which is the only
review a control icon ever gets, and it failed it.

The megaphone was not a taste decision, it was the nearest name Icon.tsx
happened to have. Icon.tsx's own rule is that chrome uses the line icons rather
than emoji, so an emoji speaker was out; the map had no speaker in it; the
megaphone was close enough to ship and close enough to mean something else.
"Broadcast" is a different feature from "read this aloud".

`speak` and `mute` join the map — Volume2 and VolumeX, the icons Lucide already
ships and every other application uses for exactly this. THE ICON IS NOW THE
STATE: crossed-out when she is silent, which is the resting position, and plain
when she will speak. No tooltip needed to find out which.

Asserted in mira-speaks-and-listens.test.ts because the failure is silent. An
icon that means the wrong thing renders perfectly, passes every type check, and
is only ever caught by somebody being confused in front of it.
MSG

say "landed. now: git push"
