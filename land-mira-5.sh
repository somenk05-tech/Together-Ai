#!/usr/bin/env bash
# land-mira-5.sh — she stops looping, gets the city, and finds a voice.
#
# A new script rather than an edit to -4: that one has been run, so its name is
# frozen and its contents must keep matching what shipped.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-5.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="She stops asking the same question, gets the whole city, and speaks"
PREV="Mira reads her own decorators at runtime, in a red room"

# Captured, not piped — grep -q closes the pipe and SIGPIPEs git under pipefail,
# which reports failure BECAUSE the check succeeded. That cost a run once.
LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^(together-city-chat/src/(mira/|security/route-(inventory\.ts|reach\.spec\.ts)|medical/image-normalize\.ts|(astrology|travel|fitness|beauty|entertainment|prescriptions|nutrition|mail|notifications|profile|financial|restaurants|drive|thoughts|medical)/[a-z-]+\.(controller|module)\.ts)|together-city-react/src/(features/chat/mira/|app/mira-(remembers-the-day|speaks-and-listens)\.test\.ts|styles/mira\.css))'
KNOWN_MAIL='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/(chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|mail/)|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- "$API" "$WEB" | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN_MAIL" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
0d63bd9f66051ffb87d8f4c7152925476bfed67b054259dafb648c81f3176198  together-city-chat/src/mira/ledger.ts
113b3663ed2a215b490fe05e7a746fdd36c4a2be4f9c78a26cf9dcf0e19a4393  together-city-chat/src/mira/ledger.spec.ts
055e0b0dee181e4cefa2c59536b8a140e06f39b4c131162f56ceca631b507ecf  together-city-chat/src/mira/say.ts
8793b3b627e41b8f6e2063d71a85b7b269b2c7c9c364528b83f28c04fafd591d  together-city-chat/src/mira/say.spec.ts
b363e159a261ec3e27694fdc990e0686864e04cd53ee18f00d50ff5672f1a0ea  together-city-chat/src/mira/choose.ts
2e19b78cad2f3c951dc7abcfd41440103572443d0e5547aae5211e69877614d9  together-city-chat/src/mira/choose.spec.ts
4602d6df71ae254cc6e51ad656dffc92d9d2085c279a414f0213490f8cbb450b  together-city-chat/src/mira/mira.service.ts
4f836c29cd36cc9578757f0571d7a8348315a90ee6b963a022fc0c1efe10445b  together-city-chat/src/mira/mira.service.spec.ts
62267498d0cd1b87145f23f5e75e136c14b80813c2d98ec44375eb3b5b27efef  together-city-chat/src/mira/mira.module.ts
f16e0de8a501733146aa48fc5a9d9821374ee5549d06c51c4ef3f2c268d2de80  together-city-chat/src/mira/mira.controller.ts
408428851ef1a48758459b29b91c750c26c9d9cbab896e69710a6f8d5cae4967  together-city-chat/src/mira/manifest.ts
787473ec9c009aebd43abfac0f768db7aa93fbc2b03b85fad3eb5301f0b49bee  together-city-chat/src/mira/manifest.spec.ts
8aaaa86858a9afd440b365d44d9e85a5aa54ef64e7ca5e986bf2908902126f04  together-city-chat/src/mira/city.ts
f0fc7915b11ba88b8b3a04cd45dcf4916a3d744980ea8faef988cf36e59edf87  together-city-chat/src/security/route-inventory.ts
2b405c5627436166458b26cefe27052599ea7090d45937ffa12ae9f306d46fcc  together-city-chat/src/security/route-reach.spec.ts
64a045c897b6a639804fb77aca202cce8fef9df5213bf3d4d7f41bfb3b48a3bc  together-city-chat/src/medical/image-normalize.ts
39d2f0d0a02371519f529a386893e1e7f5805cccc5751a562c0e237f9a77970e  together-city-chat/src/astrology/astrology.controller.ts
b99b53c5340a2f5b035afe147747ad5c9674c4e6b43ad75b7d49853b45514e62  together-city-chat/src/astrology/astrology.module.ts
a3e3e64ceac20bf4ed78be8e2403f48fe87791e80d4605e6af732ffa80c7da06  together-city-chat/src/prescriptions/prescriptions.controller.ts
00dbdfe4ea719a501c19e5dcc314a5054eefbd66c9a720cf9ea3d4d8b4924b40  together-city-chat/src/nutrition/nutrition.controller.ts
919121069f7e490d0fd87a8210310b38713728391eb5b53f87fc43dd87410b80  together-city-chat/src/mail/mail.controller.ts
5b7da59568489e24256c7bec6ea5537fe7b658d20b23aecbb4a152370ffd0494  together-city-chat/src/notifications/notifications.controller.ts
b32a3087579f7ea30580f5d7bbc12cd3071b5ac62d3040fd10b69a9a4f7cd9d0  together-city-chat/src/profile/profile.controller.ts
f0aab0bb8a85791789b6f0a9620ff10a9f7a967d4529d511c0b8f24eee2de2ee  together-city-chat/src/medical/medical.controller.ts
48835158503bfa16979979474cfa433d22dcf8d96a31bf1bc5c06621f4b1df94  together-city-chat/src/financial/financial.controller.ts
68f49427910ed2d642251a9f75d03f64f683258a39a213c9bb0b74bfaa1b4cee  together-city-chat/src/restaurants/restaurants.controller.ts
9f1fa283a67a2bc075c61b4c12eb487d960beb0ed52436736343381c2fb0b7ab  together-city-chat/src/travel/travel.controller.ts
ba8b9bbfdffaa1bf9393a0c505788cf45b54a2a2a125264591a3c46823cd73ab  together-city-chat/src/travel/travel.module.ts
576358106a78d97cf340228d8431043411c63aee526674caa55961b25e1f3a9c  together-city-chat/src/drive/drive.controller.ts
9e809465c677bc6f349e2b9cca6b1ad5f351218141a7eec8cc24d4f82c4106e5  together-city-chat/src/fitness/fitness.controller.ts
9e65a883878a987dd682488f02397cb29f38449d98935a2c2f8b6508a68cc347  together-city-chat/src/fitness/fitness.module.ts
cfc64df2c9a2cf14a3c1bb3261884528a7a8f2286190d35e843f9bf9abf792ab  together-city-chat/src/beauty/beauty.controller.ts
3307b318a2bfc6d7563ec7f385bce0f21d4dd2423a4250cac18f5bc1c1a106ee  together-city-chat/src/beauty/beauty.module.ts
73e80a2f346d3097d7aee10b4b78682dc1e4573f9ae424f57927f693ca1c8993  together-city-chat/src/entertainment/entertainment.controller.ts
bd110b0086f2d11f33c07dda5f93fcfea5f36b5fe760dd54c0e6217ff1ce167b  together-city-chat/src/entertainment/entertainment.module.ts
d340e933733712ef2537a15e2929a61f4a914125ff33c9412303ac8a888440e5  together-city-chat/src/thoughts/thoughts.controller.ts
e3cb95518fb005b97561480a74a8ef53274ce85066b83f03c5bbe6dd7e22d248  together-city-react/src/features/chat/mira/day.ts
21f94950ae9b98e7125a91eaf8e4b592907d59cac883477e55c0da7d79e754db  together-city-react/src/features/chat/mira/MiraThread.tsx
6eae5b740979dbd290fb52520bc281c76e2b76ac9e9fb99de092d63bd66c75c8  together-city-react/src/features/chat/mira/voice.ts
56182b0bb2346ab2f65cdd6a430589578a75121a39b0a63a64b9552e276afe01  together-city-react/src/app/mira-speaks-and-listens.test.ts
6758dcf79f21efa93ced7e22f26ae4e85cfd11e9ac49e5fe7388edaa5769932c  together-city-react/src/features/chat/mira/api.ts
28479e75fdfa85467351f3f3d0ac5e2473226e7db8327cb042314760750f147d  together-city-react/src/app/mira-remembers-the-day.test.ts
2d723fe1bfc544c76d6343386745c608a2bfc7861ac35a0b0d71fb2e9c7748e6  together-city-react/src/styles/mira.css
SHASUMS

say "API · prisma validate"; (cd "$API" && npx prisma validate) || die "prisma"
say "API · tsc";            (cd "$API" && npx tsc --noEmit -p tsconfig.json)  || die "API tsc"
say "API · eslint";         (cd "$API" && npx eslint src/mira/ src/security/route-inventory.ts src/medical/image-normalize.ts) || die "API lint"
say "API · jest (mira)";    (cd "$API" && npx jest src/mira --silent)         || die "mira suite"

# route-reach was RED ON MAIN before this change, for three financial/log routes
# — every script since Mira started has warned past it. It should be GREEN now:
# the three fictional /prescriptions/* entries came off the reviewed list and the
# three real /financial/log ones went on. So this is a hard gate, not a warning.
say "API · jest (security)"; (cd "$API" && npx jest src/security --silent)    || die "security suite — route-reach should be GREEN after this change"

# ── THE GATE FROM -3, KEPT ───────────────────────────────────────────────────
# Typecheck what will be COMMITTED, not the working tree. Two deploys failed
# because a staged file depended on an unstaged one, and every gate on this
# machine passed. A pristine checkout of HEAD plus exactly the staged files is
# the cheapest simulation of the build host, and it is not optional again.
say "WEB · tsc against the committed tree (not the working one)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD "$WEB" | tar -x -C "$TMP"
mkdir -p "$TMP/$WEB/src/features/chat/mira"
for f in src/features/chat/mira/day.ts src/features/chat/mira/MiraThread.tsx \
         src/features/chat/mira/api.ts src/features/chat/mira/voice.ts \
         src/app/mira-remembers-the-day.test.ts src/app/mira-speaks-and-listens.test.ts \
         src/styles/mira.css; do
  cp "$WEB/$f" "$TMP/$WEB/$f"
done
# useDictation.ts is DELETED by this commit. The archive still has it, and a file
# that exists in the simulation but not in the commit is how a stale import
# typechecks here and fails on Vercel — the exact shape of the last two failed
# deploys, in reverse.
rm -f "$TMP/$WEB/src/features/chat/mira/useDictation.ts"
ln -s "$PWD/$WEB/node_modules" "$TMP/$WEB/node_modules"
(cd "$TMP/$WEB" && npx tsc --noEmit -p tsconfig.json) \
  || die "fails against the committed tree — this is what Vercel would report"

say "WEB · tsc";             (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";          (cd "$WEB" && npx eslint src/features/chat/mira src/app/mira-remembers-the-day.test.ts src/app/mira-speaks-and-listens.test.ts) || die "WEB lint"
say "WEB · vitest";          (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling";    (cd "$WEB" && node scripts/lint-ceiling.mjs)     || die "lint ceiling"
say "WEB · motion-ceiling";  (cd "$WEB" && node scripts/motion-ceiling.mjs)   || die "motion ceiling"
say "WEB · nav-audit";       (cd "$WEB" && node scripts/nav-audit.mjs)        || die "nav audit"
say "WEB · build";           (cd "$WEB" && npm run build)                     || die "build"

say "staging"
git add \
  "$API/src/mira/ledger.ts" "$API/src/mira/ledger.spec.ts" \
  "$API/src/mira/say.ts" "$API/src/mira/say.spec.ts" \
  "$API/src/mira/choose.ts" "$API/src/mira/choose.spec.ts" \
  "$API/src/mira/mira.service.ts" "$API/src/mira/mira.service.spec.ts" \
  "$API/src/mira/mira.module.ts" "$API/src/mira/mira.controller.ts" \
  "$API/src/mira/manifest.ts" "$API/src/mira/manifest.spec.ts" \
  "$API/src/mira/city.ts" \
  "$API/src/security/route-inventory.ts" "$API/src/security/route-reach.spec.ts" \
  "$API/src/medical/image-normalize.ts" "$API/src/medical/medical.controller.ts" \
  "$API/src/astrology/astrology.controller.ts" "$API/src/astrology/astrology.module.ts" \
  "$API/src/prescriptions/prescriptions.controller.ts" \
  "$API/src/nutrition/nutrition.controller.ts" \
  "$API/src/mail/mail.controller.ts" \
  "$API/src/notifications/notifications.controller.ts" \
  "$API/src/profile/profile.controller.ts" \
  "$API/src/financial/financial.controller.ts" \
  "$API/src/restaurants/restaurants.controller.ts" \
  "$API/src/travel/travel.controller.ts" "$API/src/travel/travel.module.ts" \
  "$API/src/drive/drive.controller.ts" \
  "$API/src/fitness/fitness.controller.ts" "$API/src/fitness/fitness.module.ts" \
  "$API/src/beauty/beauty.controller.ts" "$API/src/beauty/beauty.module.ts" \
  "$API/src/entertainment/entertainment.controller.ts" "$API/src/entertainment/entertainment.module.ts" \
  "$API/src/thoughts/thoughts.controller.ts" \
  "$WEB/src/features/chat/mira/day.ts" \
  "$WEB/src/features/chat/mira/MiraThread.tsx" \
  "$WEB/src/features/chat/mira/api.ts" \
  "$WEB/src/features/chat/mira/voice.ts" \
  "$WEB/src/app/mira-remembers-the-day.test.ts" \
  "$WEB/src/app/mira-speaks-and-listens.test.ts" \
  "$WEB/src/styles/mira.css"

# The old hook goes. Nothing imports it, and an unused module that still
# compiles is where the next person reintroduces the send-on-first-pause
# behaviour by finding it and assuming it is live.
git rm -q --ignore-unmatch "$WEB/src/features/chat/mira/useDictation.ts"

git commit -F - <<'MSG'
She stops asking the same question, and gets the whole city

Four capabilities became twenty-eight, a loop found in production is closed,
and the personality the governor has been guarding for three commits is finally
applied to something.

── THE LOOP ───────────────────────────────────────────────────────────────────

From the owner's own chat, in production:

    — You can't assess my astrology profile
    — Two places that could be: Astrology or Profile. Which one?
    — Astrology
    — Two places that could be: Astrology or Log. Which one?

THREE separate faults, and it needed all three fixed. Any one alone still loops.

1. `'take me to astrology'.includes('log')` IS TRUE. "log" sits inside
   "astroLOGy". `findInCity` matched raw substrings on normalised text, so the
   room called Log scored against a sentence that had nothing to do with it.
   That is the whole class: "art" in "start", "ate" in "later". Whole words now.

2. SHE ASKED WHENEVER THERE WERE TWO HITS. `Astrology` at 1.0 beside
   `Astrology Log` at 0.5 is an answer with a runner-up, not a tie — but the
   score was discarded at the return of `findInCity`, so the caller could not
   tell those apart. `Found` carries its score, and a runner-up now has to be
   within 0.25 before a question is worth a turn.

3. AND SHE DID NOT KNOW SHE HAD ASKED. Every turn started from nothing, so
   "Astrology" arrived as a fresh utterance and went back through the matcher
   that had just produced the question. `choose.ts` reads a reply as an answer:
   the label, the label inside a short sentence, a word only one option owns, or
   a position. It refuses prefixes — "pro" is not "Profile" — and refuses long
   sentences, because somebody who typed a paragraph has moved on.

   The options ride out on the reply and come back on the next ask, exactly as
   `hour` and `recent` already do. No session store: a server that remembers the
   last question has to expire it, scope it to a device, and decide what happens
   when two tabs disagree.

── TWENTY-EIGHT CAPABILITIES ─────────────────────────────────────────────────

Asked "how is my day going to be", she said "That's not something I can do yet"
— while the citizen's reading for that exact day sat in `astroReading`, their
doses were expanded and waiting in `medicines/today`, and their unread count was
one query away. Every part of the answer existed. Nothing joined them up.

`dayBrief()` is the one composite in the executor and the shape the rest of
proactive will take: her own reading first, because that is what was asked, then
only the facts that change what somebody does before lunch. Five hubs,
`Promise.allSettled`, and a dead one contributes nothing rather than taking the
morning down — this is the turn most likely to be somebody's first.

Twenty-four more routes are decorated: astrology (daily, gems, remedies, tarot),
medicines due, nutrition targets and prep, medical summary, mail, notifications,
profile and health score, budgets and spending, orders, reservations, trips,
storage, fitness plan and log, beauty routine, watchlist, notes. Five modules
grew an `exports:`.

NOTHING NEW IS ROUTED AND NOTHING IS WRITTEN. Every one is an existing GET the
web app already calls, so route-reach gains no orphans, and the executor is
still a switch with no branch that writes — which is what keeps "R0 only"
verifiable by reading it rather than by trusting a flag.

Chat, dating, social, jobs and real estate are deliberately NOT imported: those
are the hubs where a read is about somebody else, and `dating-isolation.spec.ts`
exists because that boundary has been crossed before.

── THE HUMOUR WAS NEVER APPLIED ──────────────────────────────────────────────

`levity()` computed a level, `moodFor()` picked a colour, and the executor
returned a bare sentence and dropped both on the floor. Every safety rail in the
governor worked perfectly and guarded nothing. "Deadpool but sensitive" was a
spec with no implementation, which is worse than no spec: it reads as done.

`say.ts` splits it so the property is structural rather than hoped for: a branch
hands up its fact AND the asides that would be true of it, and only `say()` may
append one — after asking `spanAllowsLevity()`, which is false in a confirmation
clause at every level and false everywhere at L0, where distress, the listen
lane, a failed step, medical and R4 all land. A BRANCH CANNOT MAKE ITSELF FUNNY.

── AND TWO THINGS FOUND ON THE WAY ───────────────────────────────────────────

THE ROUTE INVENTORY HAD A WRONG URL IN IT. `route-inventory.ts` matched the
FIRST `@Controller(...)` in a file. `prescriptions.controller.ts` declares two,
so every handler in it was reported under the `prescriptions` prefix — and
`route-reach`'s reviewed list carried three routes that do not exist
(`/prescriptions/today`, `/prescriptions/logs`, `POST /prescriptions/doses`)
while the real `/medicines/*` ones passed as reached by luck. A fiction compared
against a fiction, in the one file whose job is to know the URLs. It survived
because exactly one file in this API has two controllers.

Fixed there and in `manifest.ts` — the same divergence the runtime registry was
written to end, one layer down. With it fixed, ROUTE-REACH IS GREEN: the three
fictional entries are gone and the three real `financial/log` ones are written
down with the decision still open. That gate has been red on main since before
Mira existed and every land script has warned past it. This one does not.

`sharp` IS LOADED ON FIRST USE, NOT AT IMPORT. It is a native module, so
importing it at the top of `image-normalize.ts` meant every file that
transitively reaches MedicalService loaded a platform-specific binary —
including tests that never touch an image. `heic-convert` two functions down was
already deferred; the two now match.

── A VOICE NOTE, AND A VOICE ─────────────────────────────────────────────────

THE MICROPHONE NO LONGER SENDS FOR YOU. `useDictation` fired on the recogniser's
first FINAL transcript, so a pause to think committed half a sentence and a
misheard word went to the server with no chance to fix it. `useVoiceNote` runs
`continuous`, accumulates for as long as you talk, and lands the transcript in
the composer as a draft. Discard or Done, then read it, then send it.

That review step is not politeness. It is the honest fix for the thing speech
recognition is actually bad at — names, amounts, places. "Send ₹500 to Priya"
misheard is a very different sentence from "send ₹5000 to Piya", and the day she
can act rather than read, an unreviewed transcript is how the wrong thing
happens. Building the step now means it is already there.

Recording is its own bar rather than a state of the composer, with an elapsed
timer and a two-minute stop, because a blinking dot where the text box was is
how somebody sends a half-transcript by reflex.

AND SHE SPEAKS, ON THE PLATFORM'S SYNTHESISER. `Mira-Voice-Cost.md` priced the
alternative: ElevenLabs at ten thousand monthly citizens is about $24,500 a
month, eleven times the entire backend. Web Speech is on-device, free at every
volume, needs no key and works offline. It is not her designed voice — that is a
recording session and a fine-tune, and it is still phase 3 — but a synthesiser
she has now beats a beautiful one she does not. `pickVoice` walks a curated name
list and then an accent list, nearest first; a name list rather than a heuristic,
because `SpeechSynthesisVoice` carries no gender field and a heuristic on names
is how an assumption gets encoded quietly.

OFF UNTIL ASKED, and remembered per device. A chat surface that starts talking
out loud on a phone in a room with other people in it is a betrayal in one second
flat, and no amount of good voice design buys that back.

`useDictation.ts` is deleted rather than left unused: a module that still
compiles is where the next person finds the send-on-first-pause behaviour and
assumes it is live.

── STILL OPEN ────────────────────────────────────────────────────────────────

The `financial/log` decision: either Financial grows a log view or the three
routes go. Parking them silently is how that never gets made, so they are named
in the spec and here.
MSG

say "landed. now: git push"
