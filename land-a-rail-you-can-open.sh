#!/usr/bin/env bash
# land-a-rail-you-can-open.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug: "reduce the side profile by 60 percent to be more asthetic
# with an expandable view."
#
# 280px -> 112px is that 60%, exactly. And 280 is the number the sidebar was
# MEASURED at, on the live page in the owner's own browser, rather than the
# number a stylesheet claimed - which is the correction the header needed an
# hour ago, applied this time BEFORE the mistake instead of after it. Both
# states were rendered on the real page and shown before a line was written.
#
# TWO WAYS OPEN, AND THEY ARE NOT THE SAME PROMISE:
#
#   A PEEK - hover, or a tab key landing anywhere inside - floats the full
#   280px panel OVER the page. `margin-right: -168px` (280 - 112) keeps the
#   column 112px wide while the panel paints 280, so a mouse crossing the rail
#   never reflows the page under the reader's eyes. Measured on the live page:
#   the main column's left edge does not move.
#
#   A PIN - the chevron, remembered across sessions - gives back a real 280px
#   column with nothing overlapping: the sidebar exactly as it is today.
#   Somebody who wants the old rail keeps the old rail, and a tablet at 1100px
#   with no hover at all still has a way in.
#
# THE WORDS ARE CLIPPED, NEVER REMOVED. `display: none` on those labels is a
# menu a screen reader announces as "01, 02, 03, 04" - the same mistake the
# header's pill icons would have made without their aria-labels. They are taken
# out of the picture and left in the accessibility tree. The sub-line is the one
# thing genuinely dropped; it repeats on the peek.
#
# AND THE PIN IS REMEMBERED WHILE THE DRAWER IS NOT. Opposite kinds of state: a
# phone drawer that reopens itself on the next page is a bug, and a sidebar
# width that forgets itself on every navigation is a chore. localStorage access
# is wrapped, because it throws in a private window and a rail that cannot
# remember its width is not a reason to fail to render.
#
# Below 900px NOTHING CHANGES. Down there this aside is the phone drawer, with
# its scrim, its swipe and the burger that opened it.
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
git log --oneline -40 | grep 'A rail you can open' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
L="$W/src/styles/layout.css"
S="$W/src/layouts/Sidebar.tsx"
U="$W/src/store/ui.store.ts"
G="$W/src/app/a-rail-you-can-open.test.ts"
for f in "$L" "$S" "$U" "$G"; do [ -f "$f" ] || die "missing $f"; done
grep -q '.tc-side { width: 112px;' "$L"                       || die "the rail does not narrow"
grep -q 'margin-right: -168px;' "$L"                          || die "the peek would reflow the page instead of floating over it"
grep -q 'clip-path: inset(50%);' "$L"                         || die "the labels are not clipped - check they are not display:none"
# FIRST RUN DIED HERE, on relief.spec: the peek's shadow was hand-written
# (`12px 0 28px -18px`) in a stylesheet whose whole argument is that this
# application has exactly three heights. It stands at --e3 now, where `.modal`
# stands, because a panel floating over the page is that height.
grep -q 'box-shadow: var(--e3);' "$L"                         || die "the peek's shadow is not one of the three named heights"
grep -q 'className="rail-toggle" aria-expanded={railPinned}' "$S" || die "no control on the rail"
grep -q 'railPinned: readPinned()' "$U"                       || die "the pin is not remembered"
grep -q "sidebarOpen: false" "$U"                             || die "the phone drawer must NOT be remembered"
# A shell grep cannot strip comments, and the strings below appear in the new
# comments explaining them - so the ABSENCE checks (no display:none on a label,
# no overlay on the pinned state, nothing escaping the 900px breakpoint) live
# in the vitest guard, which can. That division is the lesson from a grep that
# matched its own comment.
ok "all four files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/layout\.css|layouts/Sidebar\.tsx|store/ui\.store\.ts|a-rail-you-can-open\.test\.ts|land-a-rail-you-can-open\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/a-rail-you-can-open.test.ts || die "the rail guard"
# relief.spec owns the shell's material and checks .side-menu's class names
# against Sidebar.tsx itself, so it is the one most likely to notice a new span;
# the-drawer-closes-at-a-tap and layout-claims-its-room both read this aside.
npx vitest run src/app/relief.spec.ts src/app/the-drawer-closes-at-a-tap.test.ts \
               src/app/layout-claims-its-room.test.ts src/app/one-layout-system.test.ts \
               src/app/tap-targets.test.ts src/app/citizen-facing-copy.test.ts \
  || die "the shell / drawer / layout guards"
ok "the rail guard and its six neighbours pass"
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
git add "$L" "$S" "$U" "$G" land-a-rail-you-can-open.sh
git commit -q -m "A rail you can open

Owner: 'reduce the side profile by 60 percent to be more aesthetic with an
expandable view.' 280px to 112px is that 60% exactly - and 280 is the number the
sidebar was measured at on the live page, not the number a stylesheet claimed.
Both states were rendered on the real page and shown before a line was written.

TWO WAYS OPEN, AND THEY ARE NOT THE SAME PROMISE. A peek - hover, or a tab key
landing anywhere inside - floats the full panel OVER the page: margin-right of
-168px (280 minus 112) keeps the column 112 wide while the panel paints 280, so
a mouse crossing the rail never reflows the page under the reader. A pin - the
chevron, remembered across sessions - gives back a real 280px column with
nothing overlapping, which is the sidebar exactly as it is today. That second
way is not decoration: a tablet at 1100px has no hover at all.

THE WORDS ARE CLIPPED, NEVER REMOVED. display:none on those labels is a menu a
screen reader announces as '01, 02, 03, 04' - the same mistake the header's pill
icons would have made without their aria-labels. The sub-line is the one thing
genuinely dropped; it repeats on the peek, and it is why a rail item is 57px.

The pin is remembered and the drawer deliberately is not - opposite kinds of
state. localStorage access is wrapped: it throws in a private window, and a rail
that cannot remember its width is not a reason to fail to render.

Below 900px nothing changes. Down there this aside is the phone drawer, and it
already has a scrim, a swipe and the burger that opened it." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
