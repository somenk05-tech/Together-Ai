#!/usr/bin/env bash
# land-she-reads-one-chat-2.sh  ·  run from the REPO ROOT
#
# Supersedes land-she-reads-one-chat.sh, which died on a state it did not
# expect: an earlier partial run of land-she-remembers.sh had already landed
# "A friend keeps her own room" (and nothing after it), so the old script's
# first commit had nothing to commit and the guard read that as failure.
# This one starts from the state the repo is actually in.
#
# TWO commits, one verified run:
# 1 · SHE REMEMBERS, AND SHE CAN BE TOLD TO FORGET — MiraTurn memory, the
#     strict forget command, the owner's verbatim welcome in the FRIEND tab,
#     the capability rundown moved to the CITY tab (this is the fix for both
#     tabs currently showing the same opening).
# 2 · SHE READS ONE CHAT — her mark in every conversation header, side panel
#     scoped to that one thread.
#
# AFTER LANDING: Railway applies the MiraTurn migration on boot.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'She reads one chat' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A friend keeps her own room' >/dev/null
[ $? -eq 0 ] || die "base commit 'A friend keeps her own room' is not here"
HAVE_MEM=0
printf '%s\n' "$LOG" | grep 'She remembers' >/dev/null && HAVE_MEM=1
# The predecessor ran, died on the unexpected state, and is therefore frozen.
rm -f land-she-reads-one-chat.sh land-she-remembers.sh
if [ "$HAVE_MEM" = 1 ]; then ok "memory already landed - only the confidant will be committed"
else ok "landing her memory, then the confidant"; fi

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/mira/" "$A/src/privacy/" "$A/prisma/" "$W/src/features/chat/mira/" "$W/src/features/chat/pages/Chats.tsx" "$W/src/styles/mira.css" "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" "$W/src/app/mira-reads-one-chat.test.ts" \
  | grep -Ev '(src/mira/(forget\.ts|mira\.service\.ts|ledger\.ts|persona\.ts|mira\.controller\.ts|she-remembers-and-forgets\.spec\.ts|she-reads-one-chat\.spec\.ts)|src/privacy/purge-plan\.ts|prisma/schema\.prisma|prisma/migrations/20260815060000_mira_remembers(/|/migration\.sql)|src/features/chat/mira/(day\.ts|MiraThread\.tsx|api\.ts|MiraConfidant\.tsx)|src/features/chat/pages/Chats\.tsx|src/styles/mira\.css|src/app/mira-is-two-tabs-and-a-door\.test\.ts|src/app/mira-reads-one-chat\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/mira/forget.ts"                          db5e03a9993bf8a007b210d9f9c5e072f1bcbff64c861fc560f07844e1f2bff2
check "$A/src/mira/she-remembers-and-forgets.spec.ts"  beac0c63bb162c3f235039b37d784d1177c296c76ce7580ff7c4932264b6c67f
check "$A/prisma/schema.prisma"                        0823a27568b56953708cb7be2db6bd66026cd8caed3041bbfbcb125e8071d5ae
check "$A/prisma/migrations/20260815060000_mira_remembers/migration.sql" 9f42f09f5d923172f0e12e38d872e994e18e488aa5f8ecfac84160ccafc54a14
check "$A/src/privacy/purge-plan.ts"                   ca4e8bdbe9dd0e5e4a7c1b408d3684484e17f42acdd5e705903d89b0b265cd18
check "$W/src/features/chat/mira/day.ts"               32afdede5f3ce2b70f0a5f578c85b49942aeecfe9320c7f1bb0fce060d45ac6e
check "$W/src/features/chat/mira/MiraThread.tsx"       b1f95e88c6272027b090a0cab708ff770882e09772161fb8e1ac06eae6fc2162
check "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" aa8b8e5d6cb68ac1eb413b573322eb69f346e1e1d2ef67fea0f2694632bb18ab
check "$A/src/mira/mira.service.ts"                    61f3d88f44094417e545636347695012a7e93f5a1b76da049171f3abf7979945
check "$A/src/mira/persona.ts"                         293c5126d17b8816a24719df91f3c901e8e6d922e9ff0d0c26473694a36e39ac
check "$A/src/mira/ledger.ts"                          007b6c604688332c807321750f12dfef8e1d8452a095d5187f33f8615af4b027
check "$W/src/styles/mira.css"                         cb940ee149186f2ff4ffb7ff4a5baf24ead23a79debeab35ca5084d5d87fff28
check "$A/src/mira/mira.controller.ts"                 355929f2a708545b1c3cb7494512bea942c32eb496fc87f3121577410060ae66
check "$A/src/mira/she-reads-one-chat.spec.ts"         fe27bf0ed58421e0683a3730aa044e4f5064e9f86dc9f549472606f4c2fe28b8
check "$W/src/features/chat/mira/api.ts"               4a579106ce869ec1a75d96d4418ba4d2fbd56d01efc01433551d7da99547e570
check "$W/src/features/chat/mira/MiraConfidant.tsx"    0661d2b43e2d43a7606d26ef2c3b5421e50327718792d6ce49cd2b71f2febe4b
check "$W/src/features/chat/pages/Chats.tsx"           c501c8e332ae719d73dd01e5392244f36a7104c6b72b51a1dc1aaefcbc84b52f
check "$W/src/app/mira-reads-one-chat.test.ts"         0152404fd80ee2a0c2190236ce6eb7b5fbb974eb42e1c9ef4a2c9e184cb9cb10

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                    && ok "prisma validate" || die "prisma validate"
npx prisma generate                    && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit                       && ok "api tsc"         || die "api tsc"
npx jest src/mira src/privacy --silent && ok "api jest"        || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                          && ok "api build"       || die "api build"
cd ..

say "5 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

if [ "$HAVE_MEM" = 0 ]; then
say "6 - commit 1 · she remembers, and she can be told to forget"
git add "$A/src/mira/forget.ts" \
        "$A/src/mira/mira.service.ts" \
        "$A/src/mira/ledger.ts" \
        "$A/src/mira/persona.ts" \
        "$A/src/mira/she-remembers-and-forgets.spec.ts" \
        "$A/prisma/schema.prisma" \
        "$A/prisma/migrations/20260815060000_mira_remembers/migration.sql" \
        "$A/src/privacy/purge-plan.ts" \
        "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/styles/mira.css" \
        "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" || die "git add (memory)"
git commit -F - <<'MSG' || die "commit (memory)"
She remembers, and she can be told to forget

Mira now keeps every conversation. MiraTurn stores both sides of every
exchange, per citizen, per room - and that record IS her memory: the
model's context is drawn from it first, device day-store second, so
tomorrow's Mira remembers today across devices, and "remember my dog?"
lands as a real question with a real answer. The record is written
fire-and-forget after every turn (the reply stamped a millisecond after the
question so pairs read back in order), bounded reads, try/caught whole -
memory is best-effort, never load-bearing, and a slow table costs
continuity, never an answer.

THE PROMISE THAT MAKES A MEMORY TOLERABLE IS THE WAY OUT. "forget about
<topic>" deletes every stored turn that mentions it and says how many;
"forget everything" empties the record. This is the ONLY write she performs
anywhere in the city, it only ever removes, and it is scoped to the asker's
own rows by construction. forget.ts is strict about what counts as the
command - "I forgot my keys", "don't forget the milk" and "how do i forget
my ex" all flow to the conversation, because deleting history off a figure
of speech is the scariest bug this feature could have, and the negative
cases get as many tests as the feature. The forget exchange itself is not
recorded: a wipe that keeps a receipt kept the thing they asked to lose.
MiraTurn is purge-classified - the most personal record in the city - and
cascades with the account.

AND SHE INTRODUCES HERSELF. The owner's welcome, verbatim, emojis and all,
is her first message in the FRIEND tab - once per device, as a real bubble.
The capability rundown ("tell me what you want done in the city") becomes
the CITY tab's opening, per the owner: "I'm here, what do you need" belongs
to the assistant. Until this commit both tabs shared the old opening, which
the owner flagged from production. Bubbles keep their line breaks now
(pre-wrap).

This commit also carries the MiraThread half of "A friend keeps her own
room" - both changes rewrote the same file - and, in mira.service.ts,
persona.ts, ledger.ts and mira.css, the confidant additions the NEXT
commit describes: a file's changes cannot be sliced, so the shared files
ride here at their final state.
MSG
ok "committed her memory"
else
say "6 - memory already landed; staging the confidant's half of the shared files"
git add "$A/src/mira/mira.service.ts" "$A/src/mira/ledger.ts" "$A/src/mira/persona.ts" "$W/src/styles/mira.css" || die "git add (shared)"
fi

say "7 - commit · she reads one chat"
git add "$A/src/mira/mira.controller.ts" \
        "$A/src/mira/she-reads-one-chat.spec.ts" \
        "$W/src/features/chat/mira/api.ts" \
        "$W/src/features/chat/mira/MiraConfidant.tsx" \
        "$W/src/features/chat/pages/Chats.tsx" \
        "$W/src/app/mira-reads-one-chat.test.ts" \
        land-she-reads-one-chat-2.sh || die "git add (confidant)"
git commit -F - <<'MSG' || die "commit (confidant)"
She reads one chat

"add a mira icon on all chats so if user clicks on the mira button mira
reads the chats brings in context and helps user send messages with
emotional dept and understanding, it also analysis incoming messages and
give an side tab of where the other person is coming from.... the tab only
gives asses to that chat box not entire context" - the owner.

Her mark now sits in every conversation's header. A press opens a side
panel - her material, laid against the screen's edge - where she reads
THAT thread: what is going on, where the other person might be coming
from, and a hand with saying what you mean. Three quick asks and a free
one.

THE SCOPE IS THE FEATURE, AND IT IS STRUCTURAL. The transcript she reads
is the window the screen already shows, sent BY THE CLIENT to its own
route (POST /mira/confide) - the server never queries the chat tables for
this, so the only thing she can ever see is what the citizen was looking
at. confide() touches no MiraTurn (no recall, no remember - what two
people said to each other is not hers to keep), no chart, no name, no
router, no executor. The panel persists nothing on the device either:
close it and it is gone. she-reads-one-chat.spec.ts pins all of this with
spies that record any reach beyond the window and demand zero; "forget
everything" typed in this panel deletes nothing, because there is nothing
here to forget.

She reads the other person tentatively - "this reads like", never a
verdict; the prompt bans diagnosing either person, assigning villain and
victim from one window of text, and coaching manipulation. Her drafts are
written in the CITIZEN's voice and land on the clipboard, never in the
composer: she helps you say it, you still say it. The crisis hand-off
outranks the model here exactly as in her own room, deterministically,
before any model sees a word; and the meter is the same meter, one
subscription covering her everywhere, the voice gate dropping (and not
billing) any reply that breaks her.
MSG
ok "committed the confidant"

say "review the commits, then:  git push"
