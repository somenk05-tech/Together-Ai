#!/usr/bin/env bash
# land-phone-door.sh — Mira has a door on a phone.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-phone-door.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="Mira has a door on a phone"
PREV="The capability scan may not stop the API from booting"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-react/src/(pages/Home\.tsx|app/mira-has-a-door-on-a-phone\.test\.ts)$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/(a-place-and-a-person|a-reply-shows-what-it-answers|mira-speaks-and-listens)\.test\.ts|components/ui/Icon\.tsx|features/chat/(mira/MiraThread\.tsx|components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
250f03ce4a1cea0b26102f729b7cd25e9646cbb6ebd2d815b1f7291efbf068fb  together-city-react/src/pages/Home.tsx
ac00ac9fa5cbaa4479734d9e30b3d420e7a37cec2e6b59ec84cf76b2868c84b5  together-city-react/src/app/mira-has-a-door-on-a-phone.test.ts
SHASUMS

say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/pages/Home.tsx src/app/mira-has-a-door-on-a-phone.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";          (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";       (cd "$WEB" && npx eslint src/pages/Home.tsx src/app/mira-has-a-door-on-a-phone.test.ts) || die "lint"
say "WEB · vitest";       (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling"; (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · a11y-audit";   (cd "$WEB" && node scripts/a11y-audit.mjs)       || die "a11y ceiling"
say "WEB · build";        (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add "$WEB/src/pages/Home.tsx" "$WEB/src/app/mira-has-a-door-on-a-phone.test.ts"

git commit -F - <<'MSG'
Mira has a door on a phone

The home screen's primary button was `phone ? null : <Link…>` for a signed-in
citizen, so on a phone there was no way to reach her from the home screen at
all.

THE GUARD WAS WRITTEN FOR A DIFFERENT BUTTON. It used to say "Enter your city",
and on a phone the citizen has already entered: the hub wall is under the fold,
the bottom bar is under their thumb, and a second door into the same room is
clutter. Sound reasoning, and it was written down, which is most of why it
survived being read afterwards.

The copy changed to "Talk to Mira" and the guard stayed. It stopped hiding a
redundant door and started hiding the only one — on the device most people use.
A signed-out visitor kept the button, because theirs points at sign-up and never
had the guard; the signed-in citizen, the one who actually has an assistant to
talk to, was the only person who lost it.

The argument that justified hiding it now argues the other way round. A hub wall
answers "what is here" and cannot answer "a table for four on Saturday", and the
smaller the screen, the more it costs to go and find the page yourself.

── WHY THIS IS A TEST ─────────────────────────────────────────────────────────

Because it was invisible from a desk. Every screenshot taken while this was
built had the button in it, because every one was a browser window wider than
899px. Nothing failed and nothing looked wrong. The owner found it on his phone.

The test names the specific shape — no width check around the primary button —
and also asserts the two labels stay identical, because a landing page
advertising something the app then calls by another name is the next version of
this same drift.

`phone` still does its real jobs; the resume shelf still moves to the foot on a
small screen. This did not fix one thing by deleting another.
MSG

say "landed. now: git push"
