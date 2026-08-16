#!/usr/bin/env bash
# land-the-sidebar-does-not-move.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug, half an hour after asking for the opposite:
#   "keep the side bar fixed for the website... no change in the mobile design."
#
# Asked which "fixed" he meant, out of three, he chose the plainest: ALWAYS FULL
# WIDTH, NOTHING THAT COLLAPSES. So this removes the rail I shipped an hour ago
# rather than defaulting it open.
#
# AND THAT IS THE RIGHT CALL, which is worth saying plainly because the rail was
# not badly built. It was measured - 280px to 112px, exactly the 60% asked for,
# both states rendered on the live page before a line was written, a peek that
# provably did not reflow the page, labels clipped rather than removed so a
# screen reader still read them. It measured well and it READ badly. A panel
# that appears because a mouse crossed it is a panel that appears when nobody
# asked, and the pin only turned a width into something you had to hold an
# opinion about. The answer to "how wide should this be" was "the width it was".
#
# GONE RATHER THAN DEFAULTED OPEN: a collapse nobody uses is still a collapse
# somebody has to read. The 112px rail, the hover peek, the chevron, the
# `pinned` class and the remembered preference behind it all come out. A stored
# width nobody can change any more is a value that can only ever be wrong.
#
# ONE THING SURVIVES IT, and not by accident: the mode tabs' geometry, which
# came out of Sidebar.tsx's inline style object on the way in. That was right
# for its own reason - an inline rule a stylesheet can only reach with
# `!important` is the problem relief.css already records against those pills -
# and it is not part of what was asked to be undone.
#
# NO CHANGE IN THE MOBILE DESIGN, which was the second half of the sentence and
# is the easy half: every rule that was removed lived inside
# `@media (min-width: 900px)`, and below that this aside has always been the
# phone drawer with its scrim, its swipe and the burger that opened it. The
# guard asserts all three are untouched.
#
# THE GUARD IS REPLACED, NOT EDITED. `a-rail-you-can-open.test.ts` guarded a
# feature that no longer exists; its replacement asserts the reverse, and its
# job is to stop the rail coming back BY HALVES - a hover rule here, a stored
# width there - which is exactly how it would return.
#
# Frontend only. Touches neither relief.css nor social.css, so it is independent
# of the other two scripts waiting and can land in any order among them.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
git log --oneline -40 | grep 'The sidebar does not move' >/dev/null \
  && die "already landed - re-running is a no-op by design"
git log --oneline -40 | grep 'A rail you can open' >/dev/null \
  || die "this undoes 'A rail you can open' and that commit is not in - nothing to undo"
ok "not landed yet, and the rail it removes is in"

say "2 - the edit is already in the tree"
L="$W/src/styles/layout.css"
S="$W/src/layouts/Sidebar.tsx"
U="$W/src/store/ui.store.ts"
OLD="$W/src/app/a-rail-you-can-open.test.ts"
NEW="$W/src/app/the-sidebar-does-not-move.test.ts"
for f in "$L" "$S" "$U" "$NEW"; do [ -f "$f" ] || die "missing $f"; done
grep -q '.tc-side { width: 280px; flex-shrink: 0;' "$L"        || die "the sidebar lost its one width"
grep -q '.tc-side .mode-tab { gap: 12px; padding: 13px 16px; }' "$L" || die "the mode tabs' geometry went missing with the rail"
grep -q 'transform: translateX(-100%)' "$L"                    || die "the phone drawer is not where it was"
# The ABSENCE checks - no 112px, no .pinned, no rail-toggle, no railPinned, no
# localStorage - live in the vitest guard, which strips comments before it
# looks. A shell grep cannot, and every one of those strings appears in the
# paragraph above explaining what was removed. That division is the lesson from
# a grep that matched its own comment.
ok "layout, sidebar and store carry it"

say "2b - the old guard goes with the feature it guarded"
if [ -f "$OLD" ]; then
  # -f, and the first run without it is the reason. That guard is not merely
  # tracked, it is MODIFIED - the plate change extended it earlier the same
  # night with the mode-tab assertions - and `git rm` refuses to drop a file
  # with local modifications unless told to. Forcing is right here precisely
  # because those modifications are the ones being thrown away with it.
  git rm -q -f "$OLD" || die "could not remove the old guard"
  ok "a-rail-you-can-open.test.ts removed - it guarded a rail that no longer exists"
else
  note "the old guard is already gone"
fi

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/layout\.css|layouts/Sidebar\.tsx|store/ui\.store\.ts|a-rail-you-can-open\.test\.ts|the-sidebar-does-not-move\.test\.ts|land-the-sidebar-does-not-move\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  note "(relief.css + the plate guard belong to land-the-plate-is-shown-whole.sh;"
  note " social.css, main.tsx and relief.spec.ts to land-social-life-has-its-stylesheet-back.sh)"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-sidebar-does-not-move.test.ts || die "the sidebar guard"
# relief.spec checks .side-menu's class names against Sidebar.tsx itself, so it
# is the one most likely to notice a span that just left; the-drawer-closes-at-a-tap
# and layout-claims-its-room both read this aside.
npx vitest run src/app/relief.spec.ts src/app/the-drawer-closes-at-a-tap.test.ts \
               src/app/layout-claims-its-room.test.ts src/app/one-layout-system.test.ts \
               src/app/tap-targets.test.ts src/app/citizen-facing-copy.test.ts \
  || die "the shell / drawer / layout guards"
ok "the sidebar guard and its six neighbours pass"
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
git add "$L" "$S" "$U" "$NEW" land-the-sidebar-does-not-move.sh
git commit -q -m "The sidebar does not move

Owner, half an hour after asking for the opposite: 'keep the side bar fixed for
the website - no change in the mobile design.' Asked which 'fixed' he meant, out
of three, he chose the plainest: always full width, nothing that collapses. So
this removes the rail rather than defaulting it open.

That is the right call and the rail was not badly built, which are both worth
saying. It was measured - 280px to 112px, exactly the 60% asked for, both states
rendered on the live page first, a peek that provably did not reflow the page,
labels clipped rather than removed so a screen reader still read them. It
measured well and it READ badly: a panel that appears because a mouse crossed it
is a panel that appears when nobody asked, and the pin only turned a width into
something you had to hold an opinion about.

Gone rather than defaulted open, because a collapse nobody uses is still a
collapse somebody has to read. The 112px rail, the hover peek, the chevron, the
pinned class and the remembered preference behind it all come out - a stored
width nobody can change any more is a value that can only ever be wrong.

One thing survives it, and not by accident: the mode tabs' geometry, which came
out of Sidebar.tsx's inline style object on the way in. That was right for its
own reason - an inline rule a stylesheet can only reach with !important - and it
is not part of what was asked to be undone.

No change in the mobile design, which is the easy half: every removed rule lived
inside @media (min-width: 900px), and below that this aside has always been the
phone drawer with its scrim, its swipe and its burger. The guard asserts all
three are untouched.

a-rail-you-can-open.test.ts is deleted rather than edited - it guarded a feature
that no longer exists. Its replacement asserts the reverse, and its job is to
stop the rail coming back by halves: a hover rule here, a stored width there,
which is exactly how it would return." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
