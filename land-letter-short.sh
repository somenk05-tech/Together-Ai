#!/bin/bash
# land-letter-short.sh (v2) — the astrology letters get a title and lose most of
# their length. Daily 80–150 words, monthly 240–320, both titled.
#
# WHY THIS ONLY VERIFIES AND COMMITS. Two earlier runs applied their patches and
# then stopped at a gate, so the four files in your tree already carry every
# change — the title, the lengths, the 300-word month, the closing without a
# name under it. The second stop was this script's own fault: it ran `npx
# vitest` in a backend that uses JEST, which downloaded a config-less vitest and
# killed all thirteen astrology specs on `describe is not defined`, twelve of
# which this change never touched. Nothing was wrong with the code.
#
# So this writes nothing. It checks the four files are byte-for-byte what was
# intended, runs the RIGHT gate, and makes one commit.
#
# BACKEND ONLY (together-city-chat).
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="A letter is short or it is an article"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

A=together-city-chat/src/astrology
check() {
  local want="$1" file="$2" got
  got="$(shasum -a 256 "$file" | awk '{print $1}')"
  [ "$got" = "$want" ] || { echo "!! $file is not what v1 produced."; echo "   want $want"; echo "   got  $got"; exit 1; }
}
check 962ac36c37cc27d5156f524278ab574d2dee254207de3b7f2deab2b67c2031e1 $A/astrology.service.ts
check cb030f9e067cb155e94f0ce9a0074a7ce732fd8e291421c6e2a5567f38098e40 $A/letter-delivery.spec.ts
check c180c601ff037e24425b942f5d9d35a4677b5517bceb7944ae4d68377b21d15c $A/letter.ts
check 53258595d43779f75d2513e8671eed34e7205d541c2d1c21e87014b3b2e56af4 $A/letter.spec.ts
echo "== all four files verified"

ALLOWED='^( M together-city-chat/src/astrology/(letter|astrology\.service|letter\.spec|letter-delivery\.spec)\.ts| M together-city-react/(public/assets/img/(apple-touch-icon-180|tc-icon-1024|tc-icon-192|tc-icon-512|tc-icon-maskable-512)\.png|public/downloads/TogetherCity\.apk))$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

echo "== nothing to write — the tree already carries every change"

cd together-city-chat
npx tsc --noEmit
# JEST, NOT VITEST. This backend runs jest; the react app is the vitest one, and
# they live in the same repository. `npx vitest` in here downloads a fresh
# vitest with no config, so globals are off and every spec dies on `describe is
# not defined` — including the twelve this change never touched. Every previous
# chat land script says `npx jest`, and this one now says it too.
npx jest src/astrology
cd ..

git add together-city-chat/src/astrology/letter.ts \
        together-city-chat/src/astrology/astrology.service.ts \
        together-city-chat/src/astrology/letter.spec.ts \
        together-city-chat/src/astrology/letter-delivery.spec.ts
git commit -F - <<'MSG'
A letter is short or it is an article

The owner read the Today page and said what it actually was: a long
AI-generated article inside a dark dashboard. The length is where that starts.
A daily ran 230–430 words and a monthly 820–1500 — and the second half of a
long letter is where a writer with nothing left to say begins restating the
first half in different words. Length was doing the work that insight is
supposed to do.

Daily is now 80–150 words. That is not a smaller version of the same brief, it
is a harder one: 110 words cannot carry career, money, love, health and growth,
so the writer has to decide which single thing is worth saying to this person
today. That decision is the product. The rules handed to it say so — "do not
solve length by writing faster or vaguer; solve it by having less to say and
meaning all of it."

THE MONTH IS 240–320 WORDS, AND IT GOT THERE BY BEING WRONG FIRST. The first
cut put it at 120–180, which was the daily's discipline applied to a longer
period and undersold what a month actually contains. A day has one thing worth
saying; a month has a SHAPE — what it is asking, where the judgement is
sharpest, what is worth protecting. Three hundred words is room for that and
still a fifth of what it replaced. The real test is whether it fits one letter
composition on the page, not the count.

AND EVERY LETTER NOW HAS A TITLE. Three to seven words naming what the period
is actually asking — "Move, But Don't Rush" — because the page it is going to
needs something to be the page, and "Daily Horoscope" is not it.

THE TITLE IS A SEPARATE FIELD, AND THAT IS WHY THIS DIFF IS SMALL. The obvious
implementation is to make it the first line of the letter, and it would have
made every structural rule in letter.ts ambiguous about its own first line: the
check that refuses a short line ending in a colon, the check that refuses a
heading, the check that the letter opens with the salutation. As its own JSON
field, `letterProblems()` did not change at all — one new `titleProblems()`
sits beside it and the two run on one pass.

IT IS VALIDATED AS STRICTLY AS THE BODY, and then some. A title is the one line
everybody reads and the only line anyone screenshots: a clean letter under
"Saturn's Lesson" has told the reader exactly what produced it, and not one
check on the body would have noticed. So the whole vocabulary ban applies, plus
two families of its own — titles that name the PRODUCT (the three the owner
listed by hand, and the neighbours a writer reaches for once those are refused)
and titles that only say where you already are. "Today" is printed above it as
a label; a title repeating it is a heading, and a heading is what this page
stopped having.

ONE PASS, NOT TWO. The title comes back with the letter from the same call. A
title written by a second call is written ABOUT a letter rather than out of it,
and the two drift into a heading that is nearly what the letter says.

READING_VER v5 → v6, WHICH IS THE WHOLE MIGRATION. Letters are cached per
period, so without a bump everyone who has already opened today keeps the old
one until tomorrow and this month's until the 1st. The next person to open
Today gets one fresh letter written to the new brief; the archive keeps the old
ones as what they were, which is honest — they were long.

Token budgets follow the lengths: 1600 → 700 daily, 4000 → 800 monthly.

AND THE LETTER NO LONGER SIGNS ITSELF. It ended "— Together City", and the
owner cut the name. A letter signed by a company is a newsletter, and a
broadcast is the one thing this surface is not allowed to feel like. What is
left is the closing on its own — "With care," — the warmth without the
letterhead. Nobody needs telling which application they are standing in; the
header says it twice above. The value is still stored on each letter rather
than assumed by the client, for the reason it always was: a screen renders what
it was sent, so an archived letter keeps the ending it was written with.

THE FIXTURES HAD TO MOVE WITH THE RULE. `GOOD_BODY` in letter.spec.ts is
roughly three hundred words and is no longer a passing daily, so it changed
jobs: it is the harness for "a daily that has run away with itself", which is a
more useful thing for it to be. Two fixtures sit beside it — a 103-word daily
and a 306-word month — chosen so one test shows the same letter passing as a
day and failing as a month. The ranges themselves are asserted rather than
assumed, because an edit that quietly restored 430-word dailies would otherwise
pass every test in the file.

Every assertion in the new spec was run against the real implementation before
it was written down, not inferred from reading it.

tsc clean, the astrology jest suite green (thirteen spec files).

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS"
echo " Daily 80–150 words, monthly 240–320, titled, closing with"
echo " \"With care,\" and nothing under it."
echo " Backend only — the page that renders them is next."
echo "==============================================================="
