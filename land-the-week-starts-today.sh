#!/usr/bin/env bash
# land-the-week-starts-today.sh  ·  run from the REPO ROOT
#
# The planner's day rail opened at the PLAN's first day — ten mornings nobody
# can cook again scrolling ahead of today. The rail now starts at today, shows
# one week, and offers two on request. Past days stay in the plan (locks,
# history, the basket's arithmetic all keep their absolute day indexes); they
# just stop being offered as places to go, and a link that points at one snaps
# forward to today. The selected day is always kept on the rail, so DayLock's
# "next unlocked day" hand-off can never land outside it.
#
# APPLY-SCRIPT SHAPE (the Tuesday script's): edits land here via exactly-once
# anchors, so this file does not depend on a pre-state hash — it runs the same
# whether it is next in the queue or third. Every anchor was verified to match
# exactly once against the current tree before this was written.
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The week starts today' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The list says who it feeds' >/dev/null; [ $? -eq 0 ] || die "run land-the-list-says-who-it-feeds-2.sh first - this lands on top of it"
ok "the sheet is in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/nutrition/pages/MealPlan\.tsx$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  printf '   \033[31mx\033[0m Tracked files outside the packages have uncommitted changes:\n'
  echo "$TRACKED_ELSEWHERE"
  exit 1
fi
ok "packages clean; untracked scratch at root left alone"

say "3 - apply, with exactly-once assertions"
python3 - "$W" <<'PYEOF' || die "an anchor did not match exactly once - see above"
import sys, pathlib
W = pathlib.Path(sys.argv[1])
def edit(rel, old, new, label):
    p = W / rel; s = p.read_text(); n = s.count(old)
    if n != 1:
        print(f"   x {label}: anchor found {n} times, expected 1"); sys.exit(1)
    p.write_text(s.replace(old, new)); print(f"   * {label}")

PLAN = 'src/features/nutrition/pages/MealPlan.tsx'

edit(PLAN,
"""  // Default the strip to today; an explicit ?day= wins so navigation is shareable.
  const dayParam = sp.get('day');
  const day = Math.max(0, Math.min(wk.days.length - 1, dayParam !== null ? (Number(dayParam) || 0) : todayIdx));
  const d = wk.days[day];""",
"""  // Default the strip to today; an explicit ?day= wins so navigation is shareable.
  // THE RAIL STARTS AT TODAY. A planner that opens on the 3rd when it is the
  // 13th is ten mornings nobody can cook again, scrolled past before the day
  // that matters. Past days keep their locks, their history and their place in
  // the basket's arithmetic - they just stop being offered as places to go,
  // and a link that points at one snaps forward to today.
  const dayParam = sp.get('day');
  const day = Math.max(todayIdx, Math.min(wk.days.length - 1, dayParam !== null ? (Number(dayParam) || 0) : todayIdx));
  const d = wk.days[day];
  // One week from today by default, two on request ("?span=14" so the choice
  // survives a recipe round-trip like day and mode do), clamped to what the
  // plan still has. The SELECTED day is always kept on the rail: DayLock hands
  // off to "the next unlocked day", and a hand-off outside the rail would
  // select a day the strip refuses to show.
  const span = sp.get('span') === '14' ? 14 : 7;
  const setSpan = (n: 7 | 14) => setSp((p) => { p.set('span', String(n)); return p; }, { replace: true });
  const spanEnd = Math.min(wk.days.length - 1, todayIdx + span - 1);
  const lastVisible = Math.max(spanEnd, day);""",
'MealPlan   rail starts at today, span chosen')

edit(PLAN,
"""            <button type="button" aria-label="Previous day" disabled={day === 0} onClick={() => setDay(Math.max(0, day - 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day === 0 ? 'default' : 'pointer', opacity: day === 0 ? 0.4 : 1 }}><NIc name="chevL" size={18} /></button>""",
"""            <button type="button" aria-label="Previous day" disabled={day <= todayIdx} onClick={() => setDay(Math.max(todayIdx, day - 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day <= todayIdx ? 'default' : 'pointer', opacity: day <= todayIdx ? 0.4 : 1 }}><NIc name="chevL" size={18} /></button>""",
'MealPlan   back stops at today')

edit(PLAN,
"              {wk.days.map((_, i) => {",
"              {wk.days.map((_, i) => i).filter((i) => i >= todayIdx && i <= lastVisible).map((i) => {",
'MealPlan   rail shows today through the span')

edit(PLAN,
"""            <button type="button" aria-label="Next day" disabled={day === wk.days.length - 1} onClick={() => setDay(Math.min(wk.days.length - 1, day + 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day === wk.days.length - 1 ? 'default' : 'pointer', opacity: day === wk.days.length - 1 ? 0.4 : 1 }}><NIc name="chevR" size={18} /></button>""",
"""            <button type="button" aria-label="Next day" disabled={day >= lastVisible} onClick={() => setDay(Math.min(lastVisible, day + 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day >= lastVisible ? 'default' : 'pointer', opacity: day >= lastVisible ? 0.4 : 1 }}><NIc name="chevR" size={18} /></button>
            {spanEnd < wk.days.length - 1 || span === 14 ? (
              <button type="button" aria-label={span === 7 ? 'Show two weeks' : 'Show one week'}
                onClick={() => setSpan(span === 7 ? 14 : 7)}
                style={{ display: 'grid', placeItems: 'center', padding: '0 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {span === 7 ? 'Two weeks' : 'One week'}
              </button>
            ) : null}""",
'MealPlan   forward stops at the span, and the span is yours')
PYEOF

say "4 - sha256"
ok "$(shasum -a 256 "$W/src/features/nutrition/pages/MealPlan.tsx" | cut -c1-16)  src/features/nutrition/pages/MealPlan.tsx"

say "5 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "6 - reported, not gated"
node scripts/dead-export-audit.mjs || true
node scripts/paper.mjs || true
cd ..

say "7 - commit"
git add $W/src/features/nutrition/pages/MealPlan.tsx land-the-week-starts-today.sh
git commit -F - <<'MSG'
The week starts today

The planner's day rail opened at the PLAN's first day, so by the second week a
citizen scrolled past ten mornings nobody can cook again before reaching the
one that matters. The rail now starts at today and shows one week; a control
extends it to two, and the choice rides in the URL beside day and mode so it
survives a recipe round-trip.

PAST DAYS ARE NOT DELETED, THEY ARE NOT OFFERED. Day indexes stay absolute -
locks, skips, pins, history and the basket's arithmetic all keep meaning what
they meant. The change is entirely in what the rail is willing to show: days
before today are off it, a ?day= link that points at one snaps forward to
today, and the back chevron stops at today instead of the plan's edge.

THE SELECTED DAY IS ALWAYS ON THE RAIL. DayLock hands off to "the next
unlocked day" after locking; if that day sits past the visible span, the rail
stretches to include it rather than selecting a day it refuses to show. The
span control disappears only when the plan has less than a week left AND the
rail is already showing all of it - a control offering more days than exist
is lying, which is ShoppingRange's own rule for its range.

One file. No engine change, no lock change, no new state outside the URL.
MSG

ok committed
say "review, then:  git push"
