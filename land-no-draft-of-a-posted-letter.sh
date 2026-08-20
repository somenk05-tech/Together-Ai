#!/usr/bin/env bash
# land-no-draft-of-a-posted-letter.sh  ·  run from the REPO ROOT
#
# Audit finding 5: autosave could outlive a send and leave a resurrectable copy
# of the message that had already gone.
#
# "SKIPPED WHILE SENDING" ONLY EVER STOPPED THE TIMER BEING ARMED. A save
# already in the air kept going, and its onSuccess set `draftId.current` —
# after the send had already read it:
#
#   t+1.2s  autosave fires with id: undefined   →  CREATE, in flight
#   t+1.3s  Send reads draftId.current (still undefined), clears nothing
#   t+1.4s  the autosave lands and creates the row
#
# A full copy of the message that just went out sits in Drafts & Failed for
# good, and resuming it sends the whole thing a second time — the exact outcome
# `draftId` exists to prevent.
#
# TWO REFS, NEITHER OF THEM A TIMER.
#   · `sentRef` — set when the KEY IS PRESSED, not when the send returns,
#     because the autosave it is racing may land first and a flag set in
#     onSuccess is set too late to catch it. Any draft that arrives after it
#     is a ghost of a posted letter and is discarded on arrival.
#   · `savingRef` — a CREATE is in flight. Without it a second autosave firing
#     before the first resolves also carries `id: undefined` and makes a second
#     row: the "thirty near-identical drafts" the function's own docstring says
#     it exists to prevent, reachable on any slow connection.
#
# THE PARTIAL-FAILURE PATH IS PUT BACK CAREFULLY. When some recipients were
# refused the citizen stays on the page — so `sentRef` is released, and
# `draftId.current` is dropped because send() has already cleared that row and
# the id in hand now points at nothing. Autosave starts a fresh draft for
# whatever they type next instead of failing silently against a deleted row.
#
# One file. Verified through the bridge: tsc clean, lint 0, a11y 0, nav-audit
# clean, motion at ceiling.
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
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/mail/pages/Compose\.tsx$'
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
ok "packages carry only this change"

say "3 - sha256"
verify(){
  local want="$1" path="$2" got
  [ -f "$path" ] || die "missing: $path"
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify ed6d3fd0350a3bed836e91dfb8ca77b061ae36abe88e6d01021b4ccdd9892006 "$W/src/features/mail/pages/Compose.tsx"

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
git add $W/src/features/mail/pages/Compose.tsx land-no-draft-of-a-posted-letter.sh

git commit -F - <<'MSG'
No draft of a posted letter

Autosave could outlive a send and leave a resurrectable copy of the message
that had already gone.

"SKIPPED WHILE SENDING" ONLY EVER STOPPED THE TIMER BEING ARMED, and that is
not the same as stopping a save. A request already in the air kept going, and
its onSuccess set draftId.current — after the send had already read it:

  t+1.2s  autosave fires with id: undefined   →  CREATE, in flight
  t+1.3s  Send reads draftId.current (still undefined) and clears nothing
  t+1.4s  the autosave lands and creates the row

A full copy of the message that just went out then sits in Drafts & Failed
permanently, and resuming it sends the whole thing a second time — which is
the precise outcome draftId exists to prevent. The window is one keystroke
wide and opens every time somebody types and sends in the same breath, which
is how short replies are written.

TWO REFS, AND NEITHER IS A TIMER. `sentRef` is set when the KEY IS PRESSED
rather than when the send returns: the autosave it is racing may land BEFORE
onSuccess, and a flag set in onSuccess is a flag set too late to catch it. Any
draft that arrives after it is a ghost of a letter already posted, and is
discarded on arrival rather than left for somebody to find. `savingRef`
records that a CREATE is in flight — without it, a second autosave firing
before the first resolves also carries id: undefined and makes a second row,
which is the "thirty near-identical drafts" this function's own docstring says
it exists to prevent, reachable on any slow connection.

THE PARTIAL-FAILURE PATH IS PUT BACK CAREFULLY, because it is the one case
where the citizen stays on this page after a send. sentRef is released so
autosave resumes, and draftId.current is dropped: send() has already cleared
that draft, so the id in hand points at a row that no longer exists, and an
autosave carrying it would 404 quietly for the rest of the session while the
screen went on saying "Draft saved". A fresh draft is started for whatever
they type next.

Found by the mail audit. No API change.
MSG

ok committed
say "review, then:  git push"
