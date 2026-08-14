#!/usr/bin/env bash
# land-mira-can-actually-talk-3.sh  ·  run from the REPO ROOT
#
# -2 fixed the scope guard (git status reports an untracked directory as
# "?? path/", which the file-path filter did not know). -3 fixes the new
# spec's own wrong assumption, which -2's gates correctly caught: "just
# feeling lonely" routes to nothing-matched, not to LISTEN — LISTEN wants
# "i feel…". With the model off, each of the owner's two screenshot
# sentences falls back to its own phase-1 line, and the spec now says so
# instead of expecting the LISTEN line for both. Verified through the
# bridge: 15/15 green.
#
# "give mira personality … make her friendly someone you can talk to" — the
# owner, 15 Aug, with the screenshot where "just feeling lonely" was answered
# by "That's not something I can do yet." She was deterministic by design;
# this is the phase the service docstring always promised: the model arrives.
#
# WHAT LANDS:
#  · persona.ts — the Master Intelligence & Response Framework distilled into
#    her system prompt: 70% friend / 15% assistant / 10% strategist / 5%
#    menace, her Vedic chart as quiet insight (never a guarantee), the honest
#    list of what she can actually do, the generic-AI register banned by name.
#  · Claude (the ANTHROPIC_API_KEY the other AI features already use) behind
#    exactly two lanes: LISTEN, and the nothing-matched fallback. Everything
#    load-bearing stays in code — crisis hand-off outranks the model, her
#    voice rules reject any reply that breaks them, and with no key she is
#    byte-for-byte the phase-1 Mira.
#  · The meter: 200 model conversations free (capabilities, navigation and
#    the greeting are never counted), then ₹999/30 days from the city wallet
#    through the same unified rail as every checkout. MiraPass model +
#    migration; classified in the purge plan.
#  · The day's transcript rides with each ask, so she remembers the previous
#    sentence — the other half of the screenshot.
#  · Web: subscribe card in her thread (price on the key), meter note when
#    ≤25 remain, transcript sent with each turn.
#
# ALSO: purge-plan classifications for MailProject and SpendLogEntry — added
# by earlier work without one, which the purge spec is designed to force; the
# suite was red on main because of them and is green with the decisions made.
#
# AFTER LANDING: set ANTHROPIC_API_KEY on Railway if it is not already set —
# without it Mira stays deterministic (and says deterministic things).
#
# Verified through the bridge: web tsc clean, lint 0, a11y 0, motion at
# ceiling, relief rules green over mira.css; api tsc clean but for the
# MiraPass typings that prisma generate below resolves, all pure mira suites
# green (485 tests), privacy suite green (41). The real full run is here.
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
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'Mira can actually talk' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/mira/" "$A/src/ai/" "$A/src/privacy/" "$A/prisma/" "$W/src/features/chat/mira/" "$W/src/styles/" \
  | grep -Ev '(src/mira/(persona\.ts|mira\.service\.ts|mira\.controller\.ts|mira\.module\.ts|ledger\.ts|mira\.service\.spec\.ts|she-can-actually-talk\.spec\.ts)|src/ai/ai\.service\.ts|src/privacy/purge-plan\.ts|prisma/schema\.prisma|prisma/migrations/20260815040000_mira_finds_her_voice(/|/migration\.sql)|src/features/chat/mira/(api\.ts|MiraThread\.tsx)|src/styles/mira\.css)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/mira/persona.ts"                    79339fdfb08984bda01f5c4e9c16528c4dc5220d7a2ed1a6f7909540c81867e6
check "$A/src/mira/mira.service.ts"               ebcbc93020e62e455eb398f49f1de619908132af117c5308945b2a81e15cd446
check "$A/src/mira/mira.controller.ts"            0d70b098aea0262d6536ab0acf024102c9f7aec62b9cccdd647c58b252638ffc
check "$A/src/mira/mira.module.ts"                e9fd8b0ff6213ea6d69ea631d7ad42ed191fc52f51b6466cf6f4d79a0fd384a1
check "$A/src/mira/ledger.ts"                     e802ec7b51b3302cfb6943ef9618eed95845931a79ebd0f858911ff8194bec38
check "$A/src/mira/mira.service.spec.ts"          3b87dfe1595a0c08c90d4095efa584962b929f1272c1785cec615aa17a299a88
check "$A/src/mira/she-can-actually-talk.spec.ts" 79ab9f223062e856ae696606faa15eb6c48a11bc4b2fbcaf35e7a3857890dad5
check "$A/src/ai/ai.service.ts"                   261c4a1dafdff9f0c97c3890d4e2f7fcfc537c29c281ed1572e50668f61d41db
check "$A/src/privacy/purge-plan.ts"              46853c40df410e1891eba32fc9af1e5c60c5dde25730762bc2584d3008ea842a
check "$A/prisma/schema.prisma"                   044c6913efadaa5534d56e7a54da385bb42ed7a09fa76dfd01da464fbf7bd1f5
check "$A/prisma/migrations/20260815040000_mira_finds_her_voice/migration.sql" 0d932551a8dfc3bdb1072cf886f8f4399626bcc483a16c3db5e17ca39352dbb6
check "$W/src/features/chat/mira/api.ts"          f334dc091f1f84e86fc5685269f07b96b3699ea10f64ffdc8154eeef993d974e
check "$W/src/features/chat/mira/MiraThread.tsx"  dfed6120be64583f763e692698ef20f03c3e18d88c0f96bc77bb0fc6e19d0c43
check "$W/src/styles/mira.css"                    d0dc1c9e2aa49a4837e584ebeecb27eeefd54109d92058625d08dd927628ef83

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                  && ok "prisma validate" || die "prisma validate"
npx prisma generate                  && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit                     && ok "api tsc"         || die "api tsc"
npx jest src/mira src/privacy --silent && ok "api jest (mira + privacy)" || die "api jest (mira + privacy)"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                        && ok "api build"       || die "api build"
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

say "6 - commit"
git add "$A/src/mira/persona.ts" \
        "$A/src/mira/mira.service.ts" \
        "$A/src/mira/mira.controller.ts" \
        "$A/src/mira/mira.module.ts" \
        "$A/src/mira/ledger.ts" \
        "$A/src/mira/mira.service.spec.ts" \
        "$A/src/mira/she-can-actually-talk.spec.ts" \
        "$A/src/ai/ai.service.ts" \
        "$A/src/privacy/purge-plan.ts" \
        "$A/prisma/schema.prisma" \
        "$A/prisma/migrations/20260815040000_mira_finds_her_voice/migration.sql" \
        "$W/src/features/chat/mira/api.ts" \
        "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/styles/mira.css" \
        land-mira-can-actually-talk.sh \
        land-mira-can-actually-talk-2.sh \
        land-mira-can-actually-talk-3.sh

git commit -F - <<'MSG'
Mira can actually talk

"i am feeling low" -> "Yeah. What's going on?" -> "just feeling lonely" ->
"That's not something I can do yet." The owner screenshotted that exchange
and asked for the Mira the framework describes: warm, funny, compassionate,
someone you can talk to, who knows you - including through your chart - and
who can still get things done. She was deterministic by design; this is the
phase the service docstring promised from the start, arriving on the terms
the codebase set for it.

THE MODEL SPEAKS IN EXACTLY TWO LANES. LISTEN, and the nothing-matched
fallback - the two places the deterministic Mira had only a canned sentence.
Capabilities, navigation, clarifying between two hits, the day brief and the
relationship lane are untouched: they were already right, and a model
rewriting a correct answer can only make it differently right. The transcript
of the day now rides with each ask (twelve turns, both voices), so the
follow-up to "what's going on?" finally lands as a continuation.

EVERYTHING LOAD-BEARING STAYS IN CODE. The crisis hand-off in relate.ts
outranks the model entirely. levity.ts still computes distress before the
model is called, and a distressed turn strips the persona of every joke
before the model sees a word. voice.ts still rejects any reply that breaks
her register - a rejected reply costs warmth, never correctness, because the
deterministic sentence stands. And with no ANTHROPIC_API_KEY she is
byte-for-byte the phase-1 Mira, which is what keeps all 279 existing mira
tests true without modification beyond two appended constructor stubs.

THE PERSONA IS BUILT FROM WHAT IS TRUE. Their name. Their clock, in their
zone. Their Vedic chart - sun, moon, ascendant - from the astrology engine
when birth details exist, used as quiet insight and never a guarantee. The
honest capability list from the generated manifest, so the model cannot
promise an order button that does not exist. The framework's own bans,
verbatim: no "As an AI", no "great question", no "the universe is telling
you". 70% friend, 15% assistant, 10% strategist, 5% menace - the owner's
ordering, chosen with the framework in hand.

TWO HUNDRED CONVERSATIONS FREE, THEN 999 A MONTH. Only model turns are
metered - the working city stays free, forever, and the spec pins that. The
meter is checked BEFORE the model is called; at zero she says so herself, in
her own voice, and the thread offers the subscription with the price on the
key. The charge goes through the same unified wallet rail as every checkout
in the city, inside one transaction with the pass extension, and extending
early stacks from the end of the current pass. Mira herself still cannot
spend money: the subscribe route is not a capability, and the executor still
has no branch that writes.

MiraPass is one row per citizen (chatUsed, paidUntil), migrated, cascaded on
account deletion, and classified in the purge plan. The ledger grows two
outcomes - chat, and paywall, the number the pricing needs.

ALSO CARRIED: purge-plan classifications for MailProject and SpendLogEntry,
added by earlier work without one. The purge spec exists precisely to force
that decision; it was red on main until made.

New spec: she-can-actually-talk.spec.ts - the lonely sentence gets a
conversation; no key means the phase-1 Mira exactly; a reply that breaks her
voice is dropped and not billed; turn 201 is the paywall and the model is
never called; a subscriber is never metered; the deterministic lanes never
touch the meter; the subscription charges 999 through the rail and stacks
from the end of an active pass.

OPERATIONS: Railway needs ANTHROPIC_API_KEY set (the same key the meal
planner and blood reading already use - one key, all AI). Until it is set she
answers deterministically, which is a degradation and not an outage.
MSG

ok committed
say "review, then:  git push"
