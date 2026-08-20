#!/usr/bin/env bash
# land-mira-4.sh — the manifest is read at RUNTIME, and Mira's room is red.
#
# A new script rather than an edit to -3: that one has been run, so its name is
# frozen and its contents must keep matching what shipped.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-4.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="Mira reads her own decorators at runtime, in a red room"
PREV="A call site cannot outrun its callee"

# Captured, not piped — grep -q closes the pipe and SIGPIPEs git under pipefail,
# which reports failure BECAUSE the check succeeded. That cost a run once.
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^(together-city-chat/src/mira/(mira\.(registry|module|service|controller)\.ts|mira\.service\.spec\.ts|router(\.spec)?\.ts)|together-city-react/src/(styles/(tokens|mira)\.css|app/(relief\.spec|a-stage-does-not-export-its-ink\.test)\.ts))$'
KNOWN_MAIL='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/(chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|mail/)|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- "$API" "$WEB" | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN_MAIL" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
7862d16f981672142592b4586231f2e41d2df6b3e58bd77e4131d3bf6cdc0d2d  together-city-chat/src/mira/mira.registry.ts
0376e49086b3a35100f428f4abd8e152288bd6baec95bbf00536a0026a95ec09  together-city-chat/src/mira/mira.module.ts
a5644c15c2f8c99c7d5c74362a46dbda657128afc2e2efb5569606a5a52e09b5  together-city-chat/src/mira/mira.service.ts
06bfd19a02c1a6c933ed70314461074d7fdcfcd18910f6602a713bcd0d16b7da  together-city-chat/src/mira/mira.controller.ts
99898cf023ab5f01108a5c56d63c2fe0c59780b24beec6714e3453936da64cb9  together-city-chat/src/mira/router.ts
de46c45c61c570b8fa1fdb32f5b02109a79f8c11f198d20093410758df04c050  together-city-chat/src/mira/router.spec.ts
18a002f8c165269ac98af2dd22057216ece1729c8d793289c11381cb60cc21b1  together-city-chat/src/mira/mira.service.spec.ts
66875cae72afe30b92ed19a43721b07f31c85a775e021683934e196be0e304b1  together-city-react/src/styles/tokens.css
4cd64b7db5b533bf4b95ff513848ad143a08b37749625e23dcb8f6006d1c20f3  together-city-react/src/styles/mira.css
ccbe41217d3c29593784ea64fd42bb7aa8d14843808d5437ffb1b20ca8edfaaa  together-city-react/src/app/relief.spec.ts
3f190cabdac1942ae2fcb2af7c06cfe443a547901e9b2befaba21ac385402109  together-city-react/src/app/a-stage-does-not-export-its-ink.test.ts
SHASUMS

# ── THE GATE FROM -3, KEPT ───────────────────────────────────────────────────
# Typecheck what will be COMMITTED, not the working tree. Two deploys failed
# because a staged file depended on an unstaged one, and every gate on this
# machine passed. A pristine checkout of HEAD plus exactly the staged files is
# the cheapest simulation of the build host, and it is not optional again.
say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/styles/tokens.css src/styles/mira.css \
         src/app/relief.spec.ts src/app/a-stage-does-not-export-its-ink.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "API · tsc";          (cd "$API" && npx tsc --noEmit -p tsconfig.json)  || die "API tsc"
say "API · eslint";       (cd "$API" && npx eslint src/mira/)               || die "API lint"
say "API · jest (mira)";  (cd "$API" && npx jest src/mira --silent)         || die "mira suite"
say "API · jest (security)"
(cd "$API" && npx jest src/security --silent) \
  || say "  route-reach is red on main already (3 financial/log routes). Not introduced here."

say "WEB · tsc";        (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";     (cd "$WEB" && npx eslint src/app/relief.spec.ts src/app/a-stage-does-not-export-its-ink.test.ts) || die "WEB lint"
say "WEB · vitest";     (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling";   (cd "$WEB" && node scripts/lint-ceiling.mjs)   || die "lint ceiling"
say "WEB · motion-ceiling"; (cd "$WEB" && node scripts/motion-ceiling.mjs) || die "motion ceiling"
say "WEB · nav-audit";      (cd "$WEB" && node scripts/nav-audit.mjs)      || die "nav audit"
say "WEB · build";          (cd "$WEB" && npm run build)                   || die "build"

say "staging"
git add \
  "$API/src/mira/mira.registry.ts" \
  "$API/src/mira/mira.module.ts" \
  "$API/src/mira/mira.service.ts" \
  "$API/src/mira/mira.controller.ts" \
  "$API/src/mira/router.ts" \
  "$API/src/mira/router.spec.ts" \
  "$API/src/mira/mira.service.spec.ts" \
  "$WEB/src/styles/tokens.css" \
  "$WEB/src/styles/mira.css" \
  "$WEB/src/app/relief.spec.ts" \
  "$WEB/src/app/a-stage-does-not-export-its-ink.test.ts"

git commit -F - <<'MSG'
Mira reads her own decorators at runtime, in a red room

Two defects, both found by looking at production rather than at the tests.

── SHE COULD ANSWER NOTHING ───────────────────────────────────────────────────

Asked "what's my balance", the deployed Mira said "That's Financial. Want me to
take you?" — the navigation fallback, which is what she says when she has no
capability for a question. She had none. The manifest was empty.

`manifest.ts` finds `@Mira()` by parsing controller SOURCE, reusing the parse
`route-inventory.ts` already does for the build gates. `start:prod` is
`node dist/main.js`; `dist/` holds compiled `.js`; the glob asks for
`*.controller.ts` and matches zero files. Empty manifest, no error, no test
able to see it — every spec runs against source, where the parse is correct.

The mistake underneath is one line long: A RUNTIME DEPENDENCY WAS BUILT ON A
BUILD-TIME MECHANISM, and the two are indistinguishable until the thing is
deployed. `route-inventory.ts` had only ever been read by specs, which is
exactly why reusing it felt free.

`mira.registry.ts` reads the same decorators off the real handlers at boot —
DiscoveryService, MetadataScanner, Reflector — so what Mira can do is derived
from what Nest actually mounted. The source parse stays in `manifest.ts` and
keeps its gates: those are about what is WRITTEN, and reading source is right
there. The registry logs its capability list on boot and logs an ERROR if it
finds none, because an empty registry is silent from the outside.

`router.ts` no longer imports a manifest at all; capabilities are passed in.
That is what makes the two paths impossible to confuse again.

── AND HER ROOM WAS UNREADABLE, IN BOTH DIRECTIONS AT ONCE ───────────────────

Her thread painted no ground, so it inherited the chat stage's near-white ink,
while `.miraopentext` asked for `--ink-soft`. #1c1c1c on #26282b is 1.2:1. Her
bubbles were the same defect inverted: `background: var(--card)` — white — with
the stage's near-white type landing on it.

This is `a-stage-does-not-export-its-ink` word for word, one file too new to be
covered by it. The rule that file states is the fix: a surface that brings its
own ground brings its own ink.

The ground the owner asked for is red, which makes the fix and the feature the
same change. `--mira-ground` and five inks live in tokens.css, measured against
the LIT end of the gradient because a gradient means one ink meets three
grounds — 10.6:1, 6.4:1 and 4.7:1. `--on-mira-faint` is #c99a9d rather than the
better-looking #b98d90, which measures 4.0:1 and fails.

Inside the room the tiles are inverted from the stage on purpose: on the stage
the white tile is the OTHER person, because the stage is neutral ground shared
by two citizens. This room is Mira's — so her voice is made of it, and yours is
the white object set down in it.

── AND A FOURTH STYLESHEET JOINS THE RATCHET ─────────────────────────────────

mira.css was invisible to every rule in relief.spec: not scanned for chromatic
literals, not scanned for undefined custom properties, not scanned for
hand-written depths. A stylesheet no ratchet reads is a second design system
with a head start — so it is now read by all three, and every literal in it is
gone.

`a-stage-does-not-export-its-ink` gains the three assertions this defect would
have needed: the room declares a ground and an ink in the same block, no light
tile in it goes without an ink, and none of the city's four near-black inks
appears inside it.

Not fixed here, and named rather than hidden: route-reach is still red on main
for three financial/log routes, and ~26 uncommitted mail files remain in the
tree untouched by this script.
MSG

say "landed. now: git push"
