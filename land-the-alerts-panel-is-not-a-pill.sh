#!/usr/bin/env bash
# land-the-alerts-panel-is-not-a-pill.sh  ·  run from the REPO ROOT
#
# The notifications dropdown renders inside `.tc-actionbar`, and both
# layout.css and relief.css style `.tc-actionbar button` with a DESCENDANT
# selector. Every row in the panel was claiming a 32px fixed height and a black
# pill: three stacked lines of content in a 32px box, so the rows overlapped
# each other and the list was unreadable.
#
# Web only. No API change, no migration.
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
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The alerts panel is not a pill' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Find someone you can trust' >/dev/null \
  || die "run land-find-someone-you-can-trust.sh first"
ok "the base is here, this is not"

say "2 - scope"
MINE='(layouts/Header\.tsx|styles/layout\.css|app/no-borrowed-class-names\.test\.ts)$'
DIRTY="$(git status --porcelain -uall -- "$W/src/layouts" "$W/src/styles" "$W/src/app")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
else
  ok "the three files this commit touches are the only ones it will add"
fi

say "3 - sha256"
FILES=(
  "${W}/src/layouts/Header.tsx"
  "${W}/src/styles/layout.css"
  "${W}/src/app/no-borrowed-class-names.test.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "${W}/src/layouts/Header.tsx"                  03336e1914703bf02329dee892b64b8b8b418575730c692afb5df7e46ed45520
check "${W}/src/styles/layout.css"                   3b377ea9e525a091671774462c78ea6628ea8a1db3bf7a93d87641c3a627e1de
check "${W}/src/app/no-borrowed-class-names.test.ts" 5dd2fcbb2464dbd8075161db0ccf81a919072879ce7ccb27b9eb2056bf7da82f

say "4 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
FILTERED="$TSC_OUT"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED"; die "web tsc"
fi
ok "web tsc"

# no-borrowed-class-names.test.ts gains three assertions and is IN this run.
# The reset it guards cannot be removed without the suite going red.
npx vitest run                  && ok "web vitest (the new reset is asserted)" || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "5 - commit"
git add "${FILES[@]}" land-the-alerts-panel-is-not-a-pill.sh || die "git add"
git commit -F - <<'MSG' || die commit
The alerts panel is not a pill

The owner, 16 Aug, looking at a render: the Alerts dropdown is broken.
Every row overlapped the one beneath it and the whole list was black.

BOTH CAUSES ARE ONE DESCENDANT SELECTOR, WRITTEN TWICE.
`.tc-actionbar button` - not `> button` - sets a 32px height and a
nowrap in layout.css, and a black pill with relief's `--ink` fill and an
`--e2` shadow in relief.css. The notifications panel is rendered inside
the bell's wrapper, which is inside the action bar, so every button in
that panel matched both rules: the row buttons, "Mark all read" and "See
all notifications".

THE FIXED HEIGHT IS WHAT MADE IT UNREADABLE. A row is three stacked
lines - title, body, timestamp - about 48px of content forced into a
32px box. It spilled onto the row below, and with twenty of them the
list read as one column of overlapping text.

AND IT ONLY LOOKED WRONG AFTER THE PANEL HAD BEEN OPENED ONCE, which is
why it survived being built. An UNREAD row sets `background:
var(--well)` inline and wins; a READ row sets `undefined`, so relief's
`var(--ink)` painted it black. Opening the panel marks everything read -
by design, that is how the badge clears - so the first open turned every
row black at once. Anybody testing with fresh unread items saw a working
panel.

`>` IS NOT THE FIX. The bell is a grandchild of the bar, inside its own
relatively-positioned wrapper, so scoping to direct children would strip
the pill off the one control that is meant to wear it. The panel names
itself `.notif-panel` and the reset undoes exactly what it inherited -
height, white-space, radius, fill, shadow, lift - and stays scoped to
the bar so it cannot become the next global rule in a file full of them.

THIRD INSTANCE OF THE SAME FAILURE, and it goes in the same ledger.
no-borrowed-class-names.test.ts already documents `.tag` and `.row`: a
class wearing somebody else's rule. This is that pointed the other way -
markup inheriting a rule it was never meant to match, because the rule
was written as a descendant selector and something got nested inside it.
All three were found by the owner looking at a render rather than by any
gate, so the file now asserts this reset exists, that the panel names
itself, and that no `.notif-panel` selector escapes the action bar.

Gates: web tsc, the whole vitest suite (3 new assertions), the four
audits at their ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push"
