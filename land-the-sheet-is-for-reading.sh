#!/bin/bash
# land-the-sheet-is-for-reading.sh — the readability pass on the two sheets,
# and a week that stops printing one sentence seven times.
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

NEEDS="The sheet is for reading"
LOG="$(git log --oneline -40)"
case "$LOG" in *"$NEEDS"*) echo "== \"$NEEDS\" is already here."; exit 0 ;; esac
case "$LOG" in
  *"The week has seven papers"*) ;;
  *) echo "!! Run land-the-week-has-seven-papers-3.sh first."; exit 1 ;;
esac

ALLOWED='^((M | M|MM) together-city-react/src/(styles/(tokens|relief)\.css|features/nutrition/(dayBalance\.ts|pages/MealPlan\.tsx)))$'
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
verify 81fd34b66e36e6a218cd092b9cef6b9715d3fa0a99c6f1f7d8dabf5260897454 src/features/nutrition/dayBalance.ts
verify 56a45e0cb8075401f14e32a3e85cde64ec25c67932af35e6fba36dce319fcb0d src/features/nutrition/pages/MealPlan.tsx
echo "== four files verified"

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
        together-city-react/src/features/nutrition/pages/MealPlan.tsx

git commit -F - <<'MSG'
The sheet is for reading

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
 Landed: The sheet is for reading
 Push, then walk the day tabs — the shopping quantities should
 be legible on every paper, and no two days should open with
 the same sentence unless the week is four days long.
===============================================================

DONE
