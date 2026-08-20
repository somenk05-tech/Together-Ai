#!/usr/bin/env bash
# land-mira-relate.sh — the relationship lane. API only.
#
# Run last of the four pending:
#   land-phone-door.sh → land-speaker-icon.sh → land-mira-mood.sh → this
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-relate.sh && git push

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="She can help with a person, not only a task"
PREV="She tells you what kind of day she is having"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history — run land-mira-mood.sh first" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^together-city-chat/src/mira/(relate(\.spec)?\.ts|ledger\.ts|mira\.service\.ts)$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/a-place-and-a-person\.test\.ts|features/chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- together-city-chat together-city-react | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
e4ad5b8ea6945028874138fbb1fb87f49e754eaab001d49073092e405bcc09fe  together-city-chat/src/mira/relate.ts
69dc27839433d28716cd2ebe51574793ca184841c3df62c7aa1b27f00dbb913a  together-city-chat/src/mira/relate.spec.ts
cc2bba00874d53a8990c9f7092ee63488b9a8ea8d83ec7a56352f2a1eb20d57d  together-city-chat/src/mira/ledger.ts
468fa08a75f6bd92d8f63ce5c5665ad98e7b153d94c25d3eb93b7ea6753be7a6  together-city-chat/src/mira/mira.service.ts
SHASUMS

# ── THE GATE THIS CHANGE EXISTS UNDER ────────────────────────────────────────
# No model call in the relationship lane. Every word is written by a person and
# can be read before it ships. A model improvising about somebody's marriage is
# precisely what the framework's own guardrail is about, and the failure mode is
# invisible: a fluent, confident, wrong sentence about a person it has never met,
# delivered to somebody who is upset.
say "no model reaches the relationship lane"
grep -nE '\b(this\.ai|AiService|openai|anthropic)\b' "$API/src/mira/relate.ts" \
  && die "a model call is in relate.ts — every line in that file must be readable before it ships" || true
say "  none"

API_STAGED="src/mira/relate.ts src/mira/relate.spec.ts src/mira/ledger.ts src/mira/mira.service.ts"
# ── THE GATE THAT WAS MISSING ON THIS SIDE ───────────────────────────────────
# The web package has had a committed-tree typecheck since two Vercel deploys
# died of a staged file depending on an unstaged one. THE API NEVER GOT ONE, and
# it cost a day: 5392f63 staged mail.controller.ts for an unrelated decorator
# and carried four lines of another session's in-progress feature with it. Its
# service method stayed uncommitted, so `main` stopped compiling, every Railway
# build failed, and the host kept serving the previous container — which looks
# from the outside exactly like a deploy that did nothing.
#
# Every gate passed the whole time, because every gate read the WORKING tree,
# where the missing method is present.
say "API · tsc against the committed tree (not the working one)"
ATMP=$(mktemp -d)
git archive HEAD "$API" | tar -x -C "$ATMP"
for f in $API_STAGED; do cp "$API/$f" "$ATMP/$API/$f"; done
ln -s "$PWD/$API/node_modules" "$ATMP/$API/node_modules"
(cd "$ATMP/$API" && npx tsc --noEmit -p tsconfig.json) \
  || { rm -rf "$ATMP"; die "the API fails against the committed tree — Railway would fail this build and keep serving the old container"; }
rm -rf "$ATMP"

say "API · tsc";            (cd "$API" && npx tsc --noEmit -p tsconfig.json) || die "API tsc"
say "API · eslint";         (cd "$API" && npx eslint src/mira/)              || die "API lint"
say "API · jest (mira)";    (cd "$API" && npx jest src/mira --silent)        || die "mira suite"
say "API · jest (security)";(cd "$API" && npx jest src/security --silent)    || die "security suite"
say "API · production build (what the host runs)"
(cd "$API" && npm run build) || die "the production build fails — the host would too"

say "staging"
git add \
  "$API/src/mira/relate.ts" "$API/src/mira/relate.spec.ts" \
  "$API/src/mira/ledger.ts" "$API/src/mira/mira.service.ts"

git commit -F - <<'MSG'
She can help with a person, not only a task

Every capability so far answers a question about the citizen's own record.
Nothing answered "my mum keeps asking and I can't say no" — the router found no
capability, the place-finder found no place, and she said "that's not something
I can do yet" to the thing people actually open an assistant for.

`relate.ts` is the lane: nine relationship kinds including the one most products
drop — the relationship with yourself — six shapes of stuck, and one written
opening sentence per shape.

── WHY THERE IS NO MODEL IN IT ────────────────────────────────────────────────

The same argument `Astrology-Voice-Principles.md` already won: language rules
that live in a system prompt are suggestions. A model improvising about
somebody's marriage is the exact thing the framework's own guardrail names, and
the failure is invisible — a fluent, confident, wrong sentence about a person it
has never met, delivered to somebody who is upset.

So every word was written by a person and can be read before it ships. A model
comes later and, as everywhere else here, will only rewrite prose that already
exists and is already correct. The land script greps for it.

── THE THREE RULES THE LIBRARY IS BUILT ON ────────────────────────────────────

SHE DESCRIBES BEHAVIOUR, SHE DOES NOT DIAGNOSE A PERSON. "He didn't answer" is
an observation. "He's avoidant" is a judgement about somebody who is not in the
room, cannot reply, and did not consent to being assessed — delivered by the one
person present who is upset with them. `LABELS` bans narcissist, gaslight,
toxic, avoidant, trauma, red flags, "you should leave", "they'll never change".
The spec sweeps EVERY line the library can produce, not the handful anybody
remembered to test, and asserts the rule can still fail.

THE SCRIPT IS A FIRST SENTENCE, NOT A STRATEGY. What people are stuck on is how
to open. Every script is the same construction — say the effect, ask for the
thing — because that survives being repeated back in an argument, which it will
be. And each carries one line saying why it is shaped that way, so it can be
disagreed with rather than obeyed.

SOME THINGS ARE NOT HERS. Control, coercion, violence, addiction: she stops,
says so, and points at a person. No script. A communication script handed into a
controlling relationship is not neutral — it can be used as evidence by the
person causing the harm, and it tells somebody that what they are living inside
is a communication problem.

── AND THAT CHECK RUNS BEFORE EVERYTHING, INCLUDING BEFORE GIVING UP ──────────

It first sat AFTER the "nothing to read here" return, and the spec caught it on
four of the six cases that matter most: "I am scared of him", "he threatened
me", "he checks my phone and tracks me", "she won't let me see my friends". None
names a relationship in a word this file knows — "him" is not in the list and
never will be — and none matches a conversational shape, so all four fell out of
the early return and she said nothing at all.

Silence is not the safe default there. It is the same as not noticing.

The spec also caught "do not" reading differently from "don't", which cost a
script on "I do not know how to tell my dad". One normaliser at the door rather
than both spellings in every pattern — the version that cannot be forgotten
halfway down a list.

── WIRING ─────────────────────────────────────────────────────────────────────

Three places, and the order is the argument:

- LISTEN checks for a hand-off FIRST. If what they described is control or
  violence, "what's going on?" is the wrong next move.
- ADVISE reads the situation before falling through to the day brief.
- And it is asked BEFORE the place-finder, because A PERSON IS NOT A PLACE:
  "I don't know how to tell my dad" must never become "Dad. Want me to take
  you?".

It returns nothing at all unless there is genuinely a situation to read, so
somebody mentioning their sister while asking about dinner still gets dinner.

The ledger gains a `relate` outcome — counted on its own because it is the one
lane where "she answered" and "she helped" are different questions, and that
file is how we find out which.
MSG

say "landed. now: git push"
