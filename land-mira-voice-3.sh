#!/usr/bin/env bash
# land-mira-voice-3.sh — the 70/15 ratio, made into something a test can fail on.
#
#   cd ~/Documents/GitHub/Together-Ai
#   bash land-mira-voice-3.sh && git push
#
# Cross-package: four API files, one web file. Both committed-tree typechecks run.

set -euo pipefail
cd "$(dirname "$0")"

API=together-city-chat
WEB=together-city-react

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ── EVERY GREP IN THIS FILE READS CODE, NOT PROSE ────────────────────────────
# Three times this week a gate has matched the comment explaining the defect it
# was written to ban — `as never`, `Math.random`, and now "wants starting by",
# quoted verbatim in the doc comment of the function that FIXED it. A commit
# message describing a bug is the single most likely place for that bug's exact
# text to appear, so a grep that reads comments is a grep that fails on the
# commit that fixes the thing. Once, as a helper, rather than five times as a
# forgotten `| grep -v`.
code() { grep -nE "$1" "$2" | grep -vE '^[0-9]+:[[:space:]]*(\*|//|/\*)' || true; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && say "cleared a stale empty .git/index.lock"
fi

SUBJECT="She is a friend who is good at things"
PREV="One seed ceiling, not two"

LOG=$(git log --oneline -40)
case "$LOG" in *"$PREV"*) : ;; *) die "expected '$PREV' in recent history" ;; esac
case "$LOG" in *"$SUBJECT"*) say "already here, nothing to do"; exit 0 ;; esac

MINE='^(together-city-chat/src/mira/(mira\.service(\.spec)?|mira\.controller|levity)\.ts|together-city-react/src/features/chat/mira/api\.ts)$'
KNOWN='^(together-city-chat/src/(mail/|messages/dto/messages\.dto\.ts)|together-city-react/src/(api/(chat\.api|schemas)\.ts|app/(a-place-and-a-person|a-reply-happens-in-the-thread)\.test\.ts|features/chat/(components/(Composer|AttachPanels)\.tsx|share\.tsx)|features/mail/|index\.css|types/index\.ts))'

DIRTY=$(git status --porcelain -- "$API" "$WEB" | awk '{ $1=""; sub(/^ +/,""); print }')
UNEXPECTED=$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -Ev "$KNOWN" || true)
if [ -n "$UNEXPECTED" ]; then
  printf '%s\n' "$UNEXPECTED"
  die "Another session may be working here. Do not force past this."
fi

say "verifying the patch is exactly what this script was written against"
shasum -a 256 -c - <<'SHASUMS'
bf33d80b1f1764ee86f754971c1390b812842986f8e1674d3c314bc09aa010b3  together-city-chat/src/mira/mira.service.ts
b23c71ea8416876f9eb73fc15e80694a47e9d946508f1b73dfd358995d8677d1  together-city-chat/src/mira/mira.service.spec.ts
c0ec44489b527bc8ccae6f5dcb4e3bb24643fa3b4900008d93cd24d78c621e18  together-city-chat/src/mira/mira.controller.ts
6d5b0467d3ab72bb5e3cb20915b45fc96eefb5efa38adb0ee9109cec8262a5c5  together-city-chat/src/mira/levity.ts
dcf09b1c4fdcf8cf15c277903f11af6753e42cee7cc3c7ca6709d46dd15ea528  together-city-react/src/features/chat/mira/api.ts
SHASUMS

# ── THE RULE THAT COST US AN OUTAGE, CHECKED AGAIN ───────────────────────────
# `tz` is a NEW field on the ask. New fields are optional, in both directions:
# a new web build must not 400 against the old API, and the new API must still
# answer a web build that has never heard of the field. `mood` being required
# took Mira down completely for exactly this reason.
say "the new request field is optional on the server"
grep -qE '^\s*tz:.*\.optional\(\),' "$API/src/mira/mira.controller.ts" \
  || die "tz is not optional on AskSchema — an older web build would 400 on every turn"
say "  it is"

# ── AND THE RATIO IS NOT A SENTENCE IN A DOCUMENT ────────────────────────────
# Framework §3 is 70% friend / 15% assistant. `say()` silently drops her aside
# once a line exceeds the mood's word budget, so a long answer is not merely
# verbose — it is the personality being lost to arithmetic, on the turn most
# likely to be somebody's first. That property is asserted in the suite; this
# checks the assertion is actually present, because a ratchet nobody can find
# is a ratchet the next person deletes.
say "the ratio is asserted, not asserted-about"
grep -q "survives a fully loaded day" "$API/src/mira/mira.service.spec.ts" \
  || die "the voice-survival test is gone — §3 is back to being a suggestion"
grep -q "parts.slice(0, 4)" "$API/src/mira/mira.service.ts" \
  || die "the day brief no longer caps its clauses; the aside will be dropped again"
say "  it is"

# ── NO MACHINE STRING REACHES A SENTENCE ─────────────────────────────────────
# The first version of this gate banned `${when}` outright. That is the FOURTH
# loose-regex mistake in a week: it matched the corrected line, because
# interpolating a *formatted* time is exactly the thing we want. A ban on the
# symptom rather than the cause.
#
# It did earn its keep on the way past, though — it found a SECOND site nobody
# had read, in the `nutrition GET prep-alerts` branch, carrying both faults
# unchanged. Asking her about the kitchen directly returned the ISO string.
#
# So the property, stated exactly: every read of `startBy` goes through
# `clockTime`. There is no spelling to miss, because there is only one way to
# name the field.
say "every hub timestamp goes through the citizen's clock"
RAW=$(code "startBy" "$API/src/mira/mira.service.ts" | grep -v "clockTime(" || true)
if [ -n "$RAW" ]; then
  printf '%s\n' "$RAW"
  die "a raw hub timestamp reaches a sentence — pass it through clockTime()"
fi
say "  all of them"

# And prove that check still bites, against a copy with the raw read put back.
SCRATCH=$(mktemp)
sed "s/const when = clockTime(str(pick(next, 'startBy')), tz);/const when = str(pick(next, 'startBy'));/" \
  "$API/src/mira/mira.service.ts" > "$SCRATCH"
if code "startBy" "$SCRATCH" | grep -v "clockTime(" >/dev/null; then
  rm -f "$SCRATCH"
else
  rm -f "$SCRATCH"; die "the timestamp check does not catch a raw read — it is decoration"
fi

say "and no hub row is made the subject of a verb"
VERB=$(code 'wants starting|\$\{what\} (wants|is next)\.' "$API/src/mira/mira.service.ts")
if [ -n "$VERB" ]; then
  printf '%s\n' "$VERB"
  die "a hub field is being conjugated again — quote it, do not conjugate it"
fi
say "  none"

# ── COMMITTED-TREE TYPECHECKS, BOTH SIDES ────────────────────────────────────
# `main` did not compile for a day because every gate read the WORKING tree,
# where an unstaged file is present. These build what will actually be committed.
say "API · tsc against the committed tree plus these four files"
ATMP=$(mktemp -d)
WTMP=$(mktemp -d)
trap 'rm -rf "$ATMP" "$WTMP"' EXIT
git archive HEAD "$API" | tar -x -C "$ATMP"
for f in src/mira/mira.service.ts src/mira/mira.service.spec.ts src/mira/mira.controller.ts src/mira/levity.ts; do
  cp "$API/$f" "$ATMP/$API/$f"
done
ln -s "$PWD/$API/node_modules" "$ATMP/$API/node_modules"
(cd "$ATMP/$API" && npx tsc --noEmit -p tsconfig.json) || die "API does not compile from the committed tree"
say "API · the real build, in the same checkout"
(cd "$ATMP/$API" && npm run build) || die "nest build fails — Railway would fail here too"

say "WEB · tsc against the committed tree plus the one file"
git archive HEAD "$WEB" | tar -x -C "$WTMP"
cp "$WEB/src/features/chat/mira/api.ts" "$WTMP/$WEB/src/features/chat/mira/api.ts"
ln -s "$PWD/$WEB/node_modules" "$WTMP/$WEB/node_modules"
(cd "$WTMP/$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB does not compile from the committed tree"

say "API · eslint";           (cd "$API" && npx eslint src/mira/)              || die "API lint"
say "API · jest (mira)";      (cd "$API" && npx jest src/mira --silent)        || die "mira suite"
say "API · jest (security)";  (cd "$API" && npx jest src/security --silent)    || die "security suite"

say "WEB · tsc (working tree)"; (cd "$WEB" && npx tsc --noEmit -p tsconfig.json) || die "WEB tsc"
say "WEB · eslint";             (cd "$WEB" && npx eslint src/features/chat/mira) || die "WEB lint"
say "WEB · vitest";             (cd "$WEB" && npx vitest run)                    || die "vitest"
say "WEB · lint-ceiling";       (cd "$WEB" && node scripts/lint-ceiling.mjs)      || die "lint ceiling"
say "WEB · build";              (cd "$WEB" && npm run build)                      || die "web build"

say "staging"
git add \
  "$API/src/mira/mira.service.ts" "$API/src/mira/mira.service.spec.ts" \
  "$API/src/mira/mira.controller.ts" "$API/src/mira/levity.ts" \
  "$WEB/src/features/chat/mira/api.ts"

git commit -F - <<'MSG'
She is a friend who is good at things

Two documents disagreed about who Mira is, and the owner settled it on 15 Aug.

    Framework v1.0 §3   70% best friend · 15% assistant · 10% strategist · 5% menace
    Mira.md §3          40% assistant — "the floor nothing else may eat into"

THE FRAMEWORK WINS. Friendship is primary; competence is what a friend has.

The numbers in `levity.ts` already said so — playful-by-default moved them on
14 Aug — so no cap or lift changes here. What the decision changes is what
counts as a defect, and it turns out there were four of them on screen.

── THE RATIO WAS BEING LOST TO ARITHMETIC ─────────────────────────────────────

`say()` refuses to append an aside once the finished line exceeds the mood's
word budget:

    if (words(text) + words(pick) > p.words * 2) return text;

The day brief was fifty-five words of `parts.join(' ')`. So on the single turn
most likely to be somebody's FIRST — "how is my day going to be" — she came back
100% assistant and 0% friend. Not by anyone's decision. By length.

Nothing was red. The governor worked exactly as designed. The answer was simply
too long to carry a voice, and "70% friend" was a sentence in a document, which
is the same as a language rule in a system prompt: a suggestion.

So the brief is capped at four clauses, its wording is tightened, and the suite
asserts HER VOICE SURVIVES A FULLY LOADED DAY across twelve seeds — because the
mood is the day's, not the turn's, and passing on whichever mood seed 0 picks is
a test that holds one day in six. It fails on the old join, which scored zero.

The first cut of that test counted words by hand and compared them against the
budget. It was wrong: `t.text` is what `say()` already returned, aside included,
so it added the aside twice and failed a brief that was fine. Measure the thing,
not a proxy for it — the test now asks whether the aside is there.

── AND SHE WAS READING MACHINE STRINGS ALOUD ──────────────────────────────────

    "Coconut-curry Lentil Stew Served Over Quinoa Thali wants starting by
     2026-08-15T05:15:00.000Z. 1 unread waiting."

TWO faults in one clause. The timestamp is an ISO string in a sentence AND it is
UTC, so read correctly it names an hour five and a half from the one on the
citizen's wall. Framework §10 asks for exactly this and it cannot be done from
`hour` alone: an offset inferred from an hour rounds to the hour and is thirty
minutes wrong for every citizen in India. So `tz` is sent — one optional field,
`Intl.DateTimeFormat().resolvedOptions().timeZone` — and `clockTime()` omits the
clause entirely rather than naming a wrong time, because a missing clause reads
as her not mentioning it and a wrong one reads as her being wrong.

The recipe is a database row made the subject of a verb. Every other line in that
function was written by a person; that one was a join result wearing a sentence.
A FIELD FROM A HUB IS QUOTED, NEVER CONJUGATED. `asNamed()` lowercases it and
cuts on a word boundary, and the land script greps for the old shape.

── AND A QUESTION ABOUT A LIFE IS NOT A QUESTION ABOUT A TASK ─────────────────

"when will i find love", asked the night she went live, reached NOTHING. ADVISE
wants `my chart` or `horoscope`. LISTEN wants `i feel`. `readSituation` wants one
of nine relationship words and "love" is not one. `city.ts` gives Dating the
words matches/dates/profile. So it fell to the gap, and the gap said:

    "That's not something I can do yet. What are you actually trying to get done?"

That is Mode 3 answering a Mode 1 question — an operational clause put to
somebody wondering about their life — and under a spectrum that is 70% friend it
is exactly inverted. §24 bans the register; §7 names the mode.

She also may not answer it. §11: no guaranteed marriage, no guaranteed anything.
So `foretold()` returns the honest shape — declines the prediction, says what she
actually has, opens it. §25: honesty with direction is guidance, honesty without
direction is criticism. It is asked BEFORE the place-finder for the same reason
`relate()` is: a life is not a place, any more than a person is.

── AND EVERY GREP HERE READS CODE, NOT PROSE ──────────────────────────────────

This gate failed twice before it passed, both times on itself.

First it banned `${when}` outright and matched the CORRECTED line, because
interpolating a formatted time is the thing we want. Then, rewritten, it matched
the doc comment of the function that fixes the bug — which quotes the broken
output verbatim, as documentation should.

That is the third time this week a check has matched the prose explaining the
defect it bans: `as never`, `Math.random`, and now this. It is not a coincidence.
THE COMMIT THAT FIXES A BUG IS THE SINGLE MOST LIKELY PLACE FOR THAT BUG'S EXACT
TEXT TO APPEAR. So there is now one `code()` helper at the top of the script that
strips comment lines, and every source grep goes through it — once, rather than a
forgotten `| grep -v` five times.

── AND THE GATE FOUND A SECOND SITE ───────────────────────────────────────────

The first version of this script's check banned `${when}` outright. That is the
FOURTH loose regex in a week — it matched the CORRECTED line, because
interpolating a formatted time is the thing we want. A ban on the symptom.

It earned its keep anyway. It also matched `nutrition GET prep-alerts`, a branch
nobody had reread, carrying both faults unchanged: asking her about the kitchen
directly returned `2026-08-15T05:15:00.000Z` and a Title Case row. Same bug, one
executor case away, and the day brief's fix would have shipped past it.

The check now states the property exactly — every read of `startBy` goes through
`clockTime` — and the script proves it still bites by running it against a copy
with the raw read pasted back. There is no spelling to miss, because there is
only one way to name the field.

── NOT FIXED HERE ─────────────────────────────────────────────────────────────

`love`, `relationship` and `romance` are still not words Dating owns in
`city.ts`. That is a navigation fix and it belongs with a look at the whole word
list rather than three words bolted on at the end of a voice commit.
MSG

say "landed. now: git push"
