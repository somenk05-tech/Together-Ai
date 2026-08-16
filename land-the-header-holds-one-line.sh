#!/usr/bin/env bash
# land-the-header-holds-one-line.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug: "make these in one line... and make sure nothing gets cropped."
#
# THE SECOND HALF IS THE WHOLE PROBLEM, and the numbers that answer it were
# MEASURED IN A BROWSER AT THIRTEEN WIDTHS before a line was changed - the
# discipline the chat header earned in August, applied to the same header.
#
# The three rows on one line, exactly as they are, need 1694px. That fits a
# 16-inch laptop and CROPS a 14-inch one - and the two-row header it would
# replace does not crop at 1440, because with a line to themselves the tabs
# have room. So the naive version of this request trades a header that never
# crops for one that crops on the machine it was asked from.
#
# WHAT EACH SAVING IS ACTUALLY WORTH, measured rather than guessed:
#     the five pill labels ......... 225px  -> 1469
#     tab tracking .13em -> .06em ... 85px  -> 1609
#     both ................................. 1384
# Both, and only both, lands 1440. Nothing tested reaches 1280 without type
# smaller than the city uses anywhere. So: ONE LINE FROM 1400 UP, the three-row
# masthead below it, and the breakpoint is that measurement plus a margin
# rather than a round number somebody liked.
#
# THE HEIGHT MOVES BY RE-POINTING THE TOKEN, not by setting a height here.
# `--header-h` is the one number the main column's padding, the sticky sidebar
# and four full-height surfaces all clear. A literal height, or a second token,
# would have been a 48px band of empty paper under a 60px bar.
#
# THE COMPOSITION WAS RENDERED BEFORE IT WAS CHOSEN. Three: tabs pinned right,
# logo-left/tabs-centre/pills-right, and the three rows laid end to end and
# centred as one block. The first two open a two-hundred-pixel hole in the
# middle of the bar and abandon the single axis this header's whole design
# argument rests on. The third is what landed - the same reading order the
# masthead has had since 15 August, on one line.
#
# AND THE WORDS BECOME ICONS, NEVER NOTHING. Mail, Chat, Personal and Alerts
# already carried `aria-label`; each gains a `title` so a hover says it too,
# which is the Search pill's own pattern. The citizen's own NAME stays - it is
# the one pill that is a person rather than a place.
#
# Frontend only. No API file is touched and the server is not built here.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
git log --oneline -40 | grep 'The header holds one line' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
L="$W/src/styles/layout.css"
T="$W/src/styles/tokens.css"
Q="$W/src/layouts/QuickActions.tsx"
H="$W/src/layouts/Header.tsx"
G="$W/src/app/the-header-holds-one-line.test.ts"
for f in "$L" "$T" "$Q" "$H" "$G"; do [ -f "$f" ] || die "missing $f"; done
grep -q '@media (min-width: 1400px)' "$L" || die "no one-line block in layout.css"
grep -q ':root { --header-h: 60px; }' "$T" || die "tokens.css does not re-point the header height"
grep -q 'aria-label="Mail" title="Mail"' "$Q" || die "an icon lost its name"
grep -q 'aria-label="Notifications" title="Alerts"' "$H" || die "the bell lost its name"
# The one thing that would silently make this crop.
grep -qE '@media \(min-width: (1[0-3][0-9][0-9]|[0-9]{1,3})px\) \{[^}]*tc-header' "$L" \
  && die "a header breakpoint below 1400 - the row was measured to need 1384"
ok "all five files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/layout\.css|styles/tokens\.css|layouts/QuickActions\.tsx|layouts/Header\.tsx|the-header-holds-one-line\.test\.ts|land-the-header-holds-one-line\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-header-holds-one-line.test.ts || die "the one-line guard"
# relief.spec owns the shell's material and asserts it only styles classes the
# shell actually renders; layout-claims-its-room and the-chat-stage-on-a-phone
# both read this header's geometry.
npx vitest run src/app/relief.spec.ts src/app/layout-claims-its-room.test.ts \
               src/app/the-chat-stage-on-a-phone.test.ts src/app/one-layout-system.test.ts \
               src/app/citizen-facing-copy.test.ts \
  || die "the shell / layout guards"
ok "the one-line guard and its five neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
ok "lint, nav, a11y, motion, dead-export all at ceiling"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$L" "$T" "$Q" "$H" "$G" land-the-header-holds-one-line.sh
git commit -q -m "The header holds one line, or it does not try

One line from 1400px up: the name, the citizen's own doors and the districts
laid end to end and centred as one block - the reading order the masthead has
had since 15 August, on a single row. Below 1400 nothing changes.

MEASURED AT THIRTEEN WIDTHS BEFORE A LINE WAS CHANGED. The three rows on one
line as they were need 1694px: fits a 16-inch laptop, crops a 14-inch one - and
the two-row header does not crop at 1440, so the naive version trades a header
that never crops for one that crops on the machine it was asked from. The five
pill labels are worth 225px and the tab tracking 85px; both, and only both,
land 1440. Nothing tested reaches 1280 without type the city uses nowhere.

The height moves by re-pointing --header-h in tokens.css, because that token is
what the main column, the sticky sidebar and four full-height surfaces clear. A
literal height here would have been 48px of empty paper under the bar.

Three compositions were rendered before this one was chosen; the other two open
a two-hundred-pixel hole in the middle of the bar.

The pill words become icons and never nothing: each already carried an
aria-label and now carries a title, the Search pill's own pattern. The citizen's
name stays - the one pill that is a person rather than a place." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
