#!/usr/bin/env bash
# land-mira-boots.sh — THE DEPLOY BLOCKER. Run this first.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-boots.sh && git push
#
# Two API files. Nothing else in this repo is waiting on it, and everything Mira
# does is waiting on it.

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="The capability scan may not stop the API from booting"
PREV="A new field in a reply is optional, or the deploy is an outage"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-chat/src/mira/mira\.registry(\.spec)?\.ts$'
# Everything else in flight — the mail work from another session, and the two
# web changes of mine sitting behind this one. Allowed to be dirty, never staged.
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/(a-place-and-a-person|a-reply-shows-what-it-answers|mira-speaks-and-listens)\.test\.ts|components/ui/Icon\.tsx|features/chat/(mira/MiraThread\.tsx|components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
b811c274525621a274b25e14000a5fcff32195108328badfab8d98b9bdd4406e  together-city-chat/src/mira/mira.registry.ts
5ecbbd364d09ce8cd01a79eb99df591aa960ba09cd4311cbfa69c00d62155b4c  together-city-chat/src/mira/mira.registry.spec.ts
SHASUMS

# THE ONE THAT MATTERS. `as never` on a nullable metatype is what took the API
# down; a cast is how the null was hidden from the compiler and from the author.
say "no cast is hiding a nullable metatype again"
grep -n 'as never' "$API/src/mira/mira.registry.ts" | grep -v '^\s*[0-9]*:\s*\*' \
  && die "a cast is back in the scan — that is the exact shape of the bug" || true
say "  none outside the comment that explains it"

say "API · tsc";            (cd "$API" && npx tsc --noEmit -p tsconfig.json) || die "API tsc"
say "API · eslint";         (cd "$API" && npx eslint src/mira/)              || die "API lint"
say "API · jest (mira)";    (cd "$API" && npx jest src/mira --silent)        || die "mira suite"
say "API · jest (security)";(cd "$API" && npx jest src/security --silent)    || die "security suite"

# What the host actually does, minus the DB: install clean, generate, compile.
# `npm ci` and `nest build` are the two steps a broken deploy dies in, and
# neither runs during any other gate here.
say "API · the production build, from the lockfile (this is what Railway runs)"
(cd "$API" && npm run build) || die "the production build fails — Railway would too"

say "staging"
git add "$API/src/mira/mira.registry.ts" "$API/src/mira/mira.registry.spec.ts"

git commit -F - <<'MSG'
The capability scan may not stop the API from booting

Mira has been answering "that's not something I can do yet" to questions she has
had a capability for since 5392f63. The capabilities were never the problem. The
API never started.

── WHAT HAPPENED ──────────────────────────────────────────────────────────────

`MiraRegistry.onModuleInit` threw. A throw there aborts Nest's bootstrap, so the
container never became healthy, so Railway — correctly, and as the runbook says
it will — kept the PREVIOUS release serving.

From outside there is nothing to see. /api/health returns 200. Every endpoint
answers. `git push` succeeds, GitHub has the commit, the build compiles. The
only symptom is that deploying has no effect, and the thing that finally gave it
away was a string: production said "That's Beauty. Want me to take you?" and the
code on main has said "Beauty. Want me to take you?" since the commit that was
supposedly live.

── THE THROW WAS ONE CAST ─────────────────────────────────────────────────────

    this.reflector.get(PATH_METADATA, wrapper.metatype as never)

Nest types `InstanceWrapper.metatype` as `Type | Function | null`, and a
controller wrapper genuinely can have none. `Reflect.getMetadata(key, null)`
does not return undefined — IT THROWS A TYPEERROR. So the first metatype-less
wrapper in the graph took down the entire API.

`as never` was written to make the compiler stop objecting. The compiler was
objecting about exactly this. A cast that silences a nullable is not a
convenience, it is a decision to handle null that never got made — and it hides
it from the next reader as effectively as from the author.

Nothing caught it. tsc passed, 397 tests passed, `nest build` exits 0, and the
image builds clean from the lockfile — verified by running `npm ci` and
`npm run build` from a fresh extract on Node 22, which is what the Dockerfile
does. A unit test never builds a Nest container, and every wrapper in a
hand-made fixture has a metatype. So the new fixtures deliberately do not.

── TWO GUARDS, AND THE SECOND IS THE POINT ────────────────────────────────────

The narrow one skips a wrapper with no metatype, no instance, or no prototype.
That is the failure already paid for.

The broad one wraps the whole scan: if it throws for any reason, the registry
comes up EMPTY and the process comes up. This scan walks every controller in the
application, so it is only a matter of time before one of them does something
unexpected — and the asymmetry is not close. Mira with no capabilities is a
degraded assistant. An API that will not boot is the whole city. A feature this
optional may never be load-bearing for the process.

It logs which one it is on the way past: the capability list on success, a named
error on failure, both on the boot log where an operator is already looking.

── HOW TO CONFIRM IT WORKED ───────────────────────────────────────────────────

The Railway deploy log will carry a line from MiraRegistry: either
"28 capabilities: astrology/daily, …" or an error saying the scan failed. Either
is a boot that finished. Silence from that logger means the container is still
not starting, and the reason will be above it.
MSG

say "landed. now: git push"
