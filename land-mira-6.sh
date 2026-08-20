#!/usr/bin/env bash
# land-mira-6.sh — the client reads a reply from a server older than itself,
#                  and says which failure it actually hit.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-6.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="A new field in a reply is optional, or the deploy is an outage"
PREV="The Mail button opens the mailbox"

# Captured, not piped — grep -q closes the pipe and SIGPIPEs git under pipefail,
# which reports failure BECAUSE the check succeeded.
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-react/src/(features/chat/mira/(api\.ts|MiraThread\.tsx)|app/mira-tolerates-an-older-server\.test\.ts)$'
KNOWN_MAIL='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/(chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|mail/)|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN_MAIL" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
ca6a023900c5ec0eb506f0ec071db9cfb7d1a1a5860eea42b2c0a5d25dcaaf9f  together-city-react/src/features/chat/mira/api.ts
b72f97e7f0c35f33f2b44204a5d912c355527f7b6a94fe86971ad6eb9fa1858f  together-city-react/src/features/chat/mira/MiraThread.tsx
80f0bdf96677bda41441f725553c7e2482ae6de1d1c1eff08e9bdbb9458eefaf  together-city-react/src/app/mira-tolerates-an-older-server.test.ts
SHASUMS

# THE POINT OF THIS COMMIT, ASSERTED BEFORE ANY OF THE USUAL GATES.
# Every REQUIRED field in the reply schema must be one the previously deployed
# API already sent. A gate rather than a test-only assertion because the whole
# failure mode is that nothing on this machine can see it: locally the two
# halves are always the same version.
say "WEB · every required reply field is one the old server already sent"
node <<'JS' || die "a required field the old API never sent — that is a total outage during the deploy window"
const fs = require('fs');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const api = strip(fs.readFileSync('together-city-react/src/features/chat/mira/api.ts', 'utf8'));
const body = api.slice(api.indexOf('MiraReplySchema = z.object({') + 27, api.indexOf('export type MiraReply'));
const fields = [...body.matchAll(/^\s{2}([a-zA-Z]+):\s*(.+?),?\s*$/gm)].map((m) => [m[1], /\.optional\(\)/.test(m[2])]);
if (fields.length < 5) { console.error('could not read the schema — this gate is not measuring anything'); process.exit(1); }
/* The reply as shipped in 5992d29. Frozen: its whole value is that it is OLD. */
const OLD = ['text', 'lane', 'capabilityId', 'confidence', 'levity', 'trace'];
const bad = fields.filter(([n, o]) => !o && !OLD.includes(n)).map(([n]) => n);
console.log('  required: ' + fields.filter(([, o]) => !o).map(([n]) => n).join(', '));
console.log('  optional: ' + fields.filter(([, o]) => o).map(([n]) => n).join(', '));
if (bad.length) { console.error('  REQUIRED AND NEW: ' + bad.join(', ')); process.exit(1); }
JS

say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
for f in src/features/chat/mira/api.ts src/features/chat/mira/MiraThread.tsx \
         src/app/mira-tolerates-an-older-server.test.ts; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";          (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";       (cd "$WEB" && npx eslint src/features/chat/mira src/app/mira-tolerates-an-older-server.test.ts) || die "lint"
say "WEB · vitest";       (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling"; (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · build";        (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add \
  "$WEB/src/features/chat/mira/api.ts" \
  "$WEB/src/features/chat/mira/MiraThread.tsx" \
  "$WEB/src/app/mira-tolerates-an-older-server.test.ts"

git commit -F - <<'MSG'
A new field in a reply is optional, or the deploy is an outage

Mira answered every question with "I'm not reaching the city right now" while
the API was healthy, fast and answering correctly. Both halves of that sentence
were mine.

── THE CAUSE ──────────────────────────────────────────────────────────────────

`mood` was added to her reply and made REQUIRED in the same commit.

The web app deploys to Vercel; the API deploys to Railway. They are separate
hosts on separate pipelines, so there is ALWAYS a window where the new frontend
is live against the old backend — minutes usually, longer when a build queues.
In that window the old API sends a reply with no `mood`, `MiraReplySchema.parse`
throws, the mutation rejects, and every single turn falls into the catch.

Not degraded. TOTAL. Every question, for as long as the two are out of step.

THE RULE, and it is not about moods: A NEW FIELD IN A RESPONSE IS OPTIONAL ON
THE CLIENT. It may be promoted to required later, once the server that sends it
is the only one deployed — and in practice that day never comes and never
matters. The cost of optional is one `?`; the cost of required is an outage
every time the two pipelines finish out of order.

── WHY IT NEEDED A GATE AND NOT A NOTE ───────────────────────────────────────

Because the failure is invisible on the machine that writes it. Locally the two
halves are always the same version, so the schema always matches, `tsc` passes,
every test passes, and the build is green. The defect exists ONLY in the gap
between two deploys, and nothing in this repo looked at that gap.

So the land script checks it directly: every REQUIRED field in the reply schema
must be one the previously deployed API already sent. `capabilityId`, `payload`,
`goto`, `mood` and `choices` are optional; `text`, `lane`, `confidence`,
`levity` and `trace` are the original contract and stay required — the rule is
about NEW fields, not about giving up on validation.

`mira-tolerates-an-older-server.test.ts` holds the same property from the other
side, by parsing a FROZEN copy of the reply as it shipped in 5992d29. A recorded
payload rather than a list of field names, because a list needs editing exactly
when nobody is thinking about skew.

── AND SHE STOPS REPORTING THE WRONG FAILURE ─────────────────────────────────

One `catch` said "I'm not reaching the city right now" for both causes, and for
this one it was FALSE. The city answered. The client refused to read the answer.
That sentence sent the diagnosis in the wrong direction — at the API, at
Railway, at the network — for as long as it took to stop believing it.

A ZodError now says so in her own voice, and logs the failing issues to the
console. Every other surface in this application says what is true when it
fails; hers has to as well, and it costs one `instanceof`.
MSG

say "landed. now: git push"
