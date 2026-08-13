#!/usr/bin/env bash
# land-no-draft-of-a-posted-letter-2.sh  ·  run from the REPO ROOT
#
# WHY THERE IS A -2, and it is two separate reasons.
#
# 1 · THE -1 STOPPED AT VITEST, and the test that stopped it was right.
#     mail-reads-on-a-phone.test.ts has held a place since it was written:
#     the row's bin is hidden on a phone wherever deleting has another door,
#     and DRAFTS were the one exception "because the composer has no Discard —
#     the day the composer grows one, drop the exception and this line."
#     Importing useDiscardDraft for the ghost-draft cleanup tripped it. The
#     honest answer is not to narrow the guard: it is to grow the Discard the
#     guard has been waiting for. So the composer has one now, the exception is
#     gone, and that test says the opposite of what it used to.
#
# 2 · THE TWO SCRIPTS BLOCKED EACH OTHER. Both sets of changes are in the
#     working tree, so each one's scope check saw the other's files and
#     refused. This one now TOLERATES the two API files by name without
#     committing them — land-the-thread-is-the-unit.sh owns those, runs after
#     this, and will then find only its own.
#
# WHAT IT CARRIES. Audit finding 5: autosave could outlive a send and leave a
# resurrectable copy of the message that had already gone. "Skipped while
# sending" only ever stopped the timer being ARMED — a save already in the air
# kept going and set draftId.current after the send had read it:
#
#   t+1.2s  autosave fires with id: undefined   →  CREATE, in flight
#   t+1.3s  Send reads draftId.current (still undefined), clears nothing
#   t+1.4s  the autosave lands and creates the row
#
# Plus the Discard the composer never had, and the phone exception it forced.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit clean,
# motion at ceiling. vitest cannot run here (rollup's native binary is macOS
# only), so the rewritten assertions were evaluated by hand against the four
# files they read — all six conditions hold — and the suite gates below.
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'No draft of a posted letter' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'One message is one message' >/dev/null; [ $? -eq 0 ] || die "run land-one-message-is-one-message.sh first - this lands on top of it"
ok "the send path is fixed, the autosave race is not"

say "2 - scope"
PKG='together-city-(chat|react)/'
# The two API files are the NEXT script's work. They are tolerated here so the
# two stop refusing each other, and they are NOT in the git add below.
ALLOWED_IN='^(M |MM| M) (together-city-react/src/(app/mail-reads-on-a-phone\.test\.ts|features/mail/pages/(Compose|Folders)\.tsx)|together-city-chat/src/mail/(mail\.service\.ts|one-message-one-thread\.spec\.ts))$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi
TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  printf '   \033[31mx\033[0m Tracked files outside the packages have uncommitted changes:\n'
  echo "$TRACKED_ELSEWHERE"
  exit 1
fi
ok "packages carry this change, plus the next script's two files"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify a3c08f63812764bcf82a7fe8c139515ebb451e140a11eb330cd7b72c7235d5e9 "$W/src/features/mail/pages/Compose.tsx"
verify 51b5ad36ac1788a183f63559491081b7a2756bbe5fba7c3923ce998ca3952fe0 "$W/src/features/mail/pages/Folders.tsx"
verify bc4b3888bb9cc91ffcacc5193b3c30c1c23463cc12078f6e68c00fe19cd56813 "$W/src/app/mail-reads-on-a-phone.test.ts"

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "5 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/mail/pages/Compose.tsx \
        $W/src/features/mail/pages/Folders.tsx \
        $W/src/app/mail-reads-on-a-phone.test.ts \
        land-no-draft-of-a-posted-letter-2.sh

git commit -F - <<'MSG'
No draft of a posted letter

Autosave could outlive a send and leave a resurrectable copy of the message
that had already gone — and the composer, it turns out, could never throw a
draft away at all.

"SKIPPED WHILE SENDING" ONLY EVER STOPPED THE TIMER BEING ARMED, and that is
not the same as stopping a save. A request already in the air kept going, and
its onSuccess set draftId.current — after the send had already read it:

  t+1.2s  autosave fires with id: undefined   →  CREATE, in flight
  t+1.3s  Send reads draftId.current (still undefined) and clears nothing
  t+1.4s  the autosave lands and creates the row

A full copy of the message that just went out then sits in Drafts & Failed
permanently, and resuming it sends the whole thing a second time — the precise
outcome draftId exists to prevent. The window is one keystroke wide and opens
every time somebody types and sends in the same breath, which is how short
replies are written.

TWO REFS, AND NEITHER IS A TIMER. `sentRef` is set when the KEY IS PRESSED
rather than when the send returns: the autosave it is racing may land BEFORE
onSuccess, and a flag set in onSuccess is set too late to catch it. Any draft
arriving after it is a ghost of a letter already posted and is discarded on
arrival. `savingRef` records that a CREATE is in flight — without it a second
autosave firing before the first resolves also carries id: undefined and makes
a second row, which is the "thirty near-identical drafts" this function's own
docstring says it exists to prevent, reachable on any slow connection.

THE PARTIAL-FAILURE PATH IS PUT BACK CAREFULLY, because it is the one case
where somebody stays on this page after sending. sentRef is released so
autosave resumes, and draftId.current is dropped: send() has already cleared
that draft, so the id in hand points at a row that no longer exists and an
autosave carrying it would 404 quietly for the rest of the session while the
screen went on saying "Draft saved".

AND THE COMPOSER GREW A DISCARD, which is the part a test asked for rather
than a person. mail-reads-on-a-phone.test.ts has held a place since it was
written: the row's bin is hidden on a phone wherever deleting has another
door, and drafts were the one exception "because the composer has no Discard —
the day the composer grows one, drop the exception and this line." Importing
useDiscardDraft for the cleanup above tripped that assertion, and the honest
answer was not to narrow the guard. Cancel leaves a draft where it is, which
is right for unfinished work; there was simply no way to say "throw this away"
from the surface you are throwing it away from, and on a phone that made the
row's bin the only door. It appears once there is a row to discard, and sets
the same sentRef so autosave cannot put it straight back. The exception is
gone, the row keeps one shape for every kind of message, and the test now says
the opposite of what it said before.

Found by the mail audit. No API change.
MSG

ok committed
say "review, then:  git push"
echo
echo "   then:  bash land-the-thread-is-the-unit.sh && git push"
