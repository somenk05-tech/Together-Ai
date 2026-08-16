#!/usr/bin/env bash
# land-a-draft-is-not-a-reading.sh  ·  run from the REPO ROOT
#
# "Help me reply" returned three paragraphs of reading, then "You could try:",
# then the sentence the citizen actually wanted. On a draft turn the brief
# itself now changes rather than a closing clause trying to outvote it.
#
# No migration. Independent of the three other pending landings - different
# folders, any order.
#
# RUN AFTER "Find someone you can trust".
set -uo pipefail
W=together-city-react
A=together-city-chat
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }
[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A draft is not a reading' >/dev/null && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Find someone you can trust' >/dev/null || die "run land-find-someone-you-can-trust.sh first"
ok "the base is here, this is not"

say "2 - scope"
MINE='(mira/persona\.ts|mira/mira\.controller\.ts|mira/mira\.service\.ts|mira/she-reads-one-chat\.spec\.ts|mira/api\.ts|mira/MiraConfidant\.tsx)$'
DIRTY="$(git status --porcelain -uall -- "$A/src/mira" "$W/src/features/chat/mira")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; die "another session is editing the same code - do not force past this"; }
[ -n "$OTHERS" ] && printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS" || ok "the six files this commit touches are the only ones it will add"

say "3 - sha256"
FILES=(
  "${A}/src/mira/persona.ts"
  "${A}/src/mira/mira.controller.ts"
  "${A}/src/mira/mira.service.ts"
  "${A}/src/mira/she-reads-one-chat.spec.ts"
  "${W}/src/features/chat/mira/api.ts"
  "${W}/src/features/chat/mira/MiraConfidant.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){ got="$(shasum -a 256 "$1" | awk '{print $1}')"; [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"; }
check "${A}/src/mira/persona.ts"                       8a0f8423772539e2fe205003c431fff63c418ef045264c47f53fbf60f3927d6e
check "${A}/src/mira/mira.controller.ts"               321200ee4866b843fb7f3238b6bdc84a12a37026f5eebba5d649363666e8dc99
check "${A}/src/mira/mira.service.ts"                  44cde9fdf5f625937e9ca1540ea3726781abd99f898ebd9adb8a9cdb62dcb72e
check "${A}/src/mira/she-reads-one-chat.spec.ts"       353380dab26d9df20da0613e715d3586a7abb71ae61d3dc55cf5a5f7bc6d0354
check "${W}/src/features/chat/mira/api.ts"            6573e3df35cf118a90567ec63f6d3ea7a87016ff20f9f7e95e8deda2f204a251
check "${W}/src/features/chat/mira/MiraConfidant.tsx" 3824dd816b7a947a5f556a960922289e0b5502d1378f9f153d6531ee8b8d34cc

say "4 - api gates"
cd "$A" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$A/src" "$A/prisma" | sed -n "s|^?? $A/||p")"
TSC_API="$(npx tsc --noEmit 2>&1 || true)"; FILTERED_API="$TSC_API"
while IFS= read -r f; do [ -n "$f" ] && FILTERED_API="$(printf '%s\n' "$FILTERED_API" | grep -vF "$f" || true)"; done <<EOF
$FOREIGN
EOF
printf '%s\n' "$FILTERED_API" | grep -q "error TS" && { printf '%s\n' "$FILTERED_API"; die "api tsc"; }
ok "api tsc"
npx jest src/mira && ok "the whole Mira suite" || die "the Mira suite"
cd ..

say "5 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"; FILTERED="$TSC_OUT"
while IFS= read -r f; do [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"; done <<EOF
$FOREIGN
EOF
printf '%s\n' "$FILTERED" | grep -q "error TS" && { printf '%s\n' "$FILTERED"; die "web tsc"; }
ok "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-a-draft-is-not-a-reading.sh || die "git add"
git commit -F - <<'MSG' || die commit
A draft is not a reading

The owner, 16 Aug: when someone presses Help me reply, write only the
reply.

WHAT CAME BACK WAS THREE PARAGRAPHS OF READING, then "You could try:",
then the sentence they actually wanted. The one button whose output is
meant to be pasted into a chat produced something that had to be
unwrapped first - and Copy sits directly underneath it, so the button
put the commentary on the clipboard too.

THE PROMPT HAD SAID "REPLY WITH THE MESSAGE ONLY" SINCE IT WAS WRITTEN.
It lost, and the reason is worth keeping: it was one clause at the
BOTTOM of a brief whose second paragraph asked her to read where the
other person is coming from and say it tentatively. A closing line does
not outvote the brief above it, and a stronger closing line would not
have either.

So on a draft turn the brief itself changes. "What you are for here:
reading where they are coming from" becomes "what you are for THIS turn:
writing the message this person will send - read them silently, and keep
the reading to yourself." The register line changes with it: two to four
sentences is the shape of a panel answer, not of a text message. The
closing instruction then only has to name the shapes it kept coming back
wearing - "you could try", "here is a draft", quotation marks around it.

CARRIED AS A MODE, NOT SNIFFED OUT OF THE ASK. The button sends
`mode: 'draft'`; nothing matches on the label, because a check against a
button's wording breaks the day somebody rewords the button.

AND DISTRESS OUTRANKS THE DRAFT. The service passes draftOnly only when
the deterministic situation read found nothing: the one turn where
handing over polished words is the wrong help is the turn where somebody
is hurting. A shorter brief is not a laxer one - the bans, the crisis
hand-off and the voice rules all stay, and the suite asserts each of
them is still in the draft prompt.

Gates: api tsc, the whole Mira suite (604 tests, 5 new); web tsc, the
whole vitest suite, the four audits at their ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push"
