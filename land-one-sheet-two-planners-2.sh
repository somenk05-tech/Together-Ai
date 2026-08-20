#!/bin/bash
# land-one-sheet-two-planners-2.sh — the readability pass on the two sheets,
# and a week that stops printing one sentence seven times.
#
# -2: planner-rail.test.ts reads MealPlan.tsx as TEXT and asserted AboutThisMenu
# was declared there. It moved to PressDay.tsx, so three assertions failed. They
# now read the file it lives in — unchanged in substance, same sentences on the
# same panel. The alternative was widening each regex until it matched either
# file, which is how a guard stops being able to say where anything is.
#
# Renamed from land-the-sheet-is-for-reading-N: the sheet moved out of MealPlan
# into components/PressDay.tsx, which is the change the family planner needs and
# is worth its own name.
#
# -6 fixed the family planner contradicting itself about who is eating.
#
# -5 removes the Family / Individual switch from the top of the page.
#
# -4 drops one character. The lint ceiling caught a non-null assertion in
# dayBalance.ts's `pick` helper — `xs[...]!` — which this project does not need,
# because noUncheckedIndexedAccess is off and the index already returns T. The
# gate was right: the backlog is not mine to fix, but adding one to it is.
#
# -3 adds the plan-comparison removal below. -2 because the day sheet was
# printing the same five figures twice — `Daily
# summary` near the top and `Total calories` again lower down — with the verso
# making it three. The recto's repeat is gone. Only MealPlan.tsx changed; the
# other three files are byte-identical to the first script.
#
# Precondition: "The week has seven papers" is already committed. This is the
# correction that seeing it on a real screen produced.
#
# `npx vitest run` and `npm run build` cannot run in the Cowork bridge — the
# Mac's node_modules are darwin-arm64 and the bridge VM is linux-arm64, so
# rollup's native binary is missing. tsc is pure JS and passed there. Both are
# gates below. Verified through the bridge: tsc clean, and the guard logic for
# borrowed class names, the five depths, colour-in-one-file and the AA of all
# thirteen papers, re-implemented standalone against the real files.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"; rm -f .git/index.lock
fi

NEEDS="One sheet, two planners"
LOG="$(git log --oneline -40)"
case "$LOG" in *"$NEEDS"*) echo "== \"$NEEDS\" is already here."; exit 0 ;; esac
case "$LOG" in
  *"The week has seven papers"*) ;;
  *) echo "!! Run land-the-week-has-seven-papers-3.sh first."; exit 1 ;;
esac

ALLOWED='^((M | M|MM) together-city-react/src/(styles/(tokens|relief)\.css|features/(nutrition/(dayBalance\.ts|pages/MealPlan\.tsx)|family/pages/Weekly\.tsx)|app/planner-rail\.test\.ts))$|^\?\? together-city-react/src/features/nutrition/components/PressDay\.tsx$'
STATUS="$(git status --porcelain)"
IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E 'together-city-react/' | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! together-city-react carries changes this script did not expect:"
  echo "$IN_SCOPE"; echo "   Another session may be working here. Do not force past this."; exit 1
fi
CHAT="$(printf '%s\n' "$STATUS" | grep -E '^ ?M together-city-chat/' || true)"
[ -n "$CHAT" ] && echo "== note: together-city-chat still has the spending log uncommitted. Not staged here."
OTHER="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev 'together-city-(react|chat)/' || true)"
if [ -n "$OTHER" ]; then echo "!! Tracked files outside both packages changed:"; echo "$OTHER"; exit 1; fi
echo "== the tree is what this script expects"

cd together-city-react
verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || { echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify afd11b938ec1bd6101ab6d5fbaa3d8fb1a447a80ba1cd0420ef514353e8ddf86 src/styles/relief.css
verify 1a06d6b15a429bf8a6a7dfdd0421f5958d8473dfcfc1cb225bd422c151f40ef4 src/styles/tokens.css
verify 90ba072ff2d72fa6778b7b09cd748f8328c7cbc93f71054cddb4c0c74fc23097 src/features/nutrition/dayBalance.ts
verify 1d9c55eb69ddc0cfc306078bfacd09404ca85d5ec448ba3bc8e55cf653470719 src/features/nutrition/pages/MealPlan.tsx
verify 361985c33deb9883f9bdc902778906f8c0322c01ac330021b26e1b611173464f src/app/planner-rail.test.ts
verify bdb9048e9ee45747e01e7a588621cca58c91c7ce9cfd8dc22562c4fd26a4a784 src/features/family/pages/Weekly.tsx
echo "== five files verified (PressDay.tsx is new and unhashed)"

echo "== gate: tsc";        npx tsc --noEmit
echo "== gate: the suite";  npx vitest run
echo "== gate: lint";       node scripts/lint-ceiling.mjs
echo "== gate: nav";        node scripts/nav-audit.mjs
echo "== gate: a11y";       node scripts/a11y-audit.mjs
echo "== gate: motion";     node scripts/motion-ceiling.mjs
echo "== report only: dead exports (main already fails this at 3 vs 2)"
node scripts/dead-export-audit.mjs || true
echo "== gate: the build";  npm run build
cd ..

git add together-city-react/src/styles/relief.css \
        together-city-react/src/styles/tokens.css \
        together-city-react/src/features/nutrition/dayBalance.ts \
        together-city-react/src/features/nutrition/pages/MealPlan.tsx \
        together-city-react/src/features/family/pages/Weekly.tsx \
        together-city-react/src/features/nutrition/components/PressDay.tsx \
        together-city-react/src/app/planner-rail.test.ts

git commit -F - <<'MSG'
One sheet, two planners

THE PRINTED DAY MOVED OUT OF MealPlan.tsx into components/PressDay.tsx. The
family planner has to look like the individual one, and the only way two pages
stay identical is for there to be one of them — a second copy of two hundred
lines of markup diverges the first time somebody fixes a rule on one sheet.

What is shared is the sheet: the recto and verso, the papers, the scored rules,
the stamped plates, the course table. What differs is passed in as slots —
`summary`, `action`, the two-up plate, `under` — because a citizen has a target
to read percentages against and a HOUSEHOLD DOES NOT. AboutThisMenu moved with
it, for the same reason: both planners print that plate and neither should own
the other's copy. planner-rail.test.ts follows it to its new file rather than
loosening its three assertions.

This commit rewires the INDIVIDUAL planner onto it and changes nothing you can
see there. Wiring the family planner is the next commit; it needs the press
grant taken from three files to four, which is an argument to write rather than
a line to add.


Seven papers landed and then had to be read on a real screen, which found two
things no amount of arithmetic was going to.

── THE SHOPPING QUANTITIES WERE INVISIBLE, AND THAT WAS A LEAK ────────────────

The two panels on the recto are Relief components handed printed material, and
they carry inline `color: var(--muted)` and `var(--ink-soft)` — ROOT values,
tuned for white paper. On Saturday's olive, --muted is #666666 against a ground
of #57554a: about 1.1:1. The grams were there and nobody could see them.

The ground measurement was never wrong. It measured --press-*-ink against the
sheet and those numbers hold. It simply never covered the city's own ink scale,
because I re-pointed the press tokens and stopped. An inline style beats every
stylesheet in Relief, so the only place this can be fixed is the token it reads:
each sheet now re-points --ink, --ink-soft, --muted, --faint, --line and
--accent-ink alongside the press ones. Every component inside either sheet
follows, and none of them has to know which sheet it is on.

── THE EMBOSS WAS ON EVERYTHING, INCLUDING THE THINGS YOU READ ────────────────

A 1px shadow under a 90px weekday is a bevel. The same shadow under 13px body
copy is a blur, and the sheet was carrying it on every glyph. It moves to the
display type only — the weekday, the note, the figures, the verdict, the course
heads — and everything you actually read is left crisp. The emboss survives
where it was doing work and stops where it was costing legibility.

THE STAMP STOPS SHADING ITS OWN MIDDLE. --press-stamp's inner glow was .13,
which is a vignette: the two-up plate read visibly darker than the sheet around
it, spending contrast the ground measurement had already promised to the words
inside. A stamp should be an edge you notice and a middle you do not.

LABELS COME OFF THE FLOOR OF THE SCALE. -ink-3 is 3.3–4.0:1 and correct for
metadata on paper you hold in your hand; at 10px under .23em of tracking on a
photograph it is not correct for anything. Labels, column heads and footer terms
move to -ink-2, which is AA, and up about two points. The tracking is what makes
them read as labels — the smallness was never doing that work.

The dish table comes up with them: names, macros and descriptions all gain a
point or two, because that table is the thing this page exists to be read down.

── AND THE DAY SHEET STOPS REPEATING ITSELF ───────────────────────────────────

The recto printed the five figures twice: `Daily summary` near the top, and a
`Total calories` plate eighty pixels below it carrying the identical numbers.
The verso then printed them a third time. The recto's repeat is deleted.

The summary is the one that survives up there because it carries MORE — each
figure AND its percentage against the target — so the plate underneath was a
strictly weaker copy of the row above it. Each sheet now prints the row once,
and the two do different jobs: the recto reads the day against its targets, the
verso sums the menu you have just read.

── AND THE PLAN AUDIT COMES OFF THE PAGE ──────────────────────────────────────

The scorecard printed a paragraph restating both its dials in words, then two
columns under it — HEALTH GAPS and PREFERENCE MATCH — carrying twelve figures:
sodium, saturated fat, potassium and phosphorus against their targets, plus
protein-source and cuisine ratios. Below that, a medical-guidance banner named
one of those same concerns again and repeated a number the dial had already
given.

All of it is gone at the owner's word, and the reason it goes cleanly is that
the page never asked anybody to act on any of it. The two dials answer "which
plan am I looking at". The audit behind them was not the question, and printing
an audit where a summary belongs is how a page stops being read at all.

NOTHING WAS DELETED FROM THE API. `sc.summary`, `sc.healthNotes`,
`sc.preferenceNotes` and `wk.compliance.concerns` are all still computed and
still returned; MedicalRecs and the medical hub still read the last of them. One
page stopped rendering them, which is the cheap way back if any of it should
return somewhere quieter.

── AND THE SECOND DOOR INTO THE SAME ROOM IS CLOSED ───────────────────────────

The Family / Individual switch came off the top of the meal plan. The hub rail
already carries both as its first two entries, so this was a second door into a
room you had already chosen, sitting above a page that had just told you which
room you were in.

IT SURVIVES IN EXACTLY ONE PLACE, and that instance is not a duplicate. When a
household plan fails to build, the error state renders the switch because it is
then the ONLY way back to your own plan — a bug that was found once and fixed by
putting it there. Deleting both would have restored it. The comment that
explains this now sits where the removed one used to be, so the next person to
tidy reads the reason before the code.

── THE FAMILY PLANNER STOPS CONTRADICTING ITSELF ──────────────────────────────

It printed "Mains are cooked together for the whole family (1 person)" directly
beside a portions table listing two people's plates, and both were stated as
fact. Two sources of truth for who is eating: the caption counted
`headcount(state)` — the LOCAL family state, which tracks members you have
disabled on this device — while the table listed whoever the server portioned
the day for.

The caption now counts what the table counts, because the table is the thing on
screen beside it. `headcount` stays as the fallback for the moment before the
query settles.

WHAT WAS DELIBERATELY NOT CHANGED: the grocery cart is still portioned by
`headcount`. If disabling a member locally is meant to change what you BUY as
well as what you read, that is a real decision about what a local toggle means,
and not one a caption should make quietly on its way past.

Two more things on that page were found and left alone, both because they are
not this page's to fix: the portions panel heads a section "es", which is
`meal.slotName` arriving from the API un-expanded, and the day strip renders
every day of a three-week plan where the individual planner scrolls them.

── AND EVERY DAY GETS ITS OWN SENTENCE ────────────────────────────────────────

A week routinely contains three days light on the same macro, and they printed
the identical line three times. Read down the day tabs, that looks like a page
that has not noticed which day it is on.

THE FACT IS FIXED AND THE PHRASING ROTATES, seeded by the day index. Every
variant says the same thing about the same numbers — which macro is short, which
is over, whether anything else is fine. None of them softens a verdict, hedges
one, or adds a claim the arithmetic did not make; that would make this a
horoscope rather than a reading of a day. Seeding by the day rather than at
random is what makes it variety instead of noise: a given day says the same
thing every time you open it.

Seed 0 is the original wording on purpose. The tests that pin these sentences
are pinning a promise about tone, and a rotation that quietly retired the
sentence they check would be a rotation nobody reviewed.

No API change, no new field. The day's reading is still one BalanceVerdict.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: One sheet, two planners

THE PRINTED DAY MOVED OUT OF MealPlan.tsx into components/PressDay.tsx. The
family planner has to look like the individual one, and the only way two pages
stay identical is for there to be one of them — a second copy of two hundred
lines of markup diverges the first time somebody fixes a rule on one sheet.

What is shared is the sheet: the recto and verso, the papers, the scored rules,
the stamped plates, the course table. What differs is passed in as slots —
`summary`, `action`, the two-up plate, `under` — because a citizen has a target
to read percentages against and a HOUSEHOLD DOES NOT. AboutThisMenu moved with
it, for the same reason: both planners print that plate and neither should own
the other's copy. planner-rail.test.ts follows it to its new file rather than
loosening its three assertions.

This commit rewires the INDIVIDUAL planner onto it and changes nothing you can
see there. Wiring the family planner is the next commit; it needs the press
grant taken from three files to four, which is an argument to write rather than
a line to add.

 Push, then walk the day tabs — the shopping quantities should
 be legible on every paper, the five figures should appear once
 per sheet, the scorecard should be two dials and nothing else,
 the plan switch should be gone from the top (and still present
 if a family plan fails to build),
 and no two days should open with the same sentence unless the
 week is four days long.
===============================================================

DONE
