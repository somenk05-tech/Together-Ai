#!/usr/bin/env bash
# land-the-doors-take-the-right-edge.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug, looking at the bar that landed an hour earlier:
#   "make the icons on the right and instead of the icons write the words…
#    show me first and then create."
#
# SHOWN FIRST. Four states were rendered from the city's own stylesheets, at
# real widths, and sent before a line was written - including the 1512 crop,
# which is the state that decides the whole shape of this change.
#
# TWO CHANGES, AND ONLY ONE OF THEM IS FREE.
#
#   THE SIDE IS FREE. Three right-hand arrangements were rendered before this
#   one was picked. Logo-left / tabs-centred / pills-right splits the slack
#   into two holes; tabs-and-pills-as-one-block-right leaves the signature
#   stranded alone on the left. This one has a SINGLE gap and it falls between
#   the city's districts and the citizen's own four doors - the only line in
#   the bar worth drawing. Measured gap: 158px at 1728, 50px at 1620.
#
#   THE WORDS COST 170px, and there is no arguing with it:
#       icons only ....... 1420px
#       words back ....... 1590px
#   So they are promised at 1620 - the measurement plus room for a first name
#   longer than the owner's, because that pill is USER DATA and a breakpoint
#   set to the exact measurement is a breakpoint that crops for somebody else.
#   From 1400 to 1619 the pills keep their icons, their titles and their
#   aria-labels, in the same right-hand position.
#
# THE OWNER CHOSE THAT LADDER over the two alternatives he was shown: words at
# every width with the district type dropped to 9.5px (the size the city
# otherwise uses only on a phone), and the three-row masthead returning below
# 1620. And he chose "Mail" over the "email" he typed, once shown that the
# burger drawer, the Hubs page and the hub's own title all say Mail.
#
# NO COMPONENT CHANGES. The right edge is `order` plus one `margin-left: auto`,
# because the SOURCE order is the reading order the burger drawer, the
# three-row masthead below 1400 and the tab sequence all walk. Only the desktop
# line rearranges it, and only visually.
#
# Swept 2560 → 390: no header overflow and no document overflow at any width,
# the words switching exactly at 1620/1619 and the row/column masthead switching
# exactly at 1400/1399.
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
git log --oneline -40 | grep 'The doors take the right edge' >/dev/null \
  && die "already landed - re-running is a no-op by design"
git log --oneline -40 | grep 'The header holds one line' >/dev/null \
  || die "this sits on top of 'The header holds one line' - land that first"
ok "not landed yet, and the line it edits is in"

say "2 - the edit is already in the tree"
L="$W/src/styles/layout.css"
G="$W/src/app/the-header-holds-one-line.test.ts"
for f in "$L" "$G"; do [ -f "$f" ] || die "missing $f"; done
grep -q 'justify-content: flex-start;' "$L"                                  || die "the header still centres its block"
grep -q '.tc-header .tc-navrow { order: 2; }' "$L"                           || die "the districts did not come forward"
grep -q '.tc-header .tc-actionrow { order: 3; margin-left: auto; }' "$L"      || die "the doors are not pinned to the right edge"
grep -q '@media (min-width: 1620px)' "$L"                                    || die "no block puts the words back"
grep -q '.tc-header .tc-actionbar .lab { display: inline; }' "$L"            || die "the words never come back"
# The one thing that would silently make this crop. A shell grep cannot strip
# comments, so the ABSENCE checks - no centred axis left in the block, no
# --chip-fs reached for to buy room - live in the vitest guard below, which
# can. That division is the lesson from a grep that matched its own comment.
grep -qE '@media \(min-width: (1[0-3][0-9][0-9]|[0-9]{1,3})px\) \{[^}]*tc-header' "$L" \
  && die "a header breakpoint below 1400 - the icon row was measured to need 1384"
ok "layout.css carries the right edge and the words"

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/layout\.css|the-header-holds-one-line\.test\.ts|land-the-doors-take-the-right-edge\.sh)' | grep -v '^[[:space:]]*$' || true)"
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
git add "$L" "$G" land-the-doors-take-the-right-edge.sh
git commit -q -m "The doors take the right edge, and get their words back

Owner, an hour after the line landed: 'make the icons on the right and instead
of the icons write the words - show me first and then create.' Four states were
rendered from the city's own stylesheets at real widths and shown before a line
was written, the 1512 crop among them.

THE SIDE IS FREE. Mail, Chat, Personal, Alerts and the citizen's own name pin
to the right edge; the districts come forward beside the signature. Three
right-hand arrangements were rendered first: logo-left/tabs-centred/pills-right
splits the slack into two holes, and tabs-and-pills-as-one-block-right strands
the signature alone on the left. This one leaves a single gap, and it falls
between the city's districts and the citizen's own four doors - 158px at 1728,
50px at 1620.

THE WORDS COST 170px: 1420 with icons, 1590 with the words. So they are
promised at 1620, which is the measurement plus room for a first name longer
than the owner's - that pill is user data, and a breakpoint set to the exact
measurement crops for somebody else. From 1400 to 1619 the pills keep their
icons, their titles and their aria-labels in the same right-hand position. The
owner chose that ladder over words-everywhere-with-9.5px-districts (phone type
on a desktop) and over the masthead returning below 1620.

No component changed. The right edge is 'order' plus one 'margin-left: auto',
because the source order is the reading order the burger drawer, the three-row
masthead below 1400 and the tab sequence all walk; only the desktop line
rearranges it, and only visually.

'Mail', not the 'email' that was asked for, at the owner's call once shown that
the drawer, the Hubs page and the hub's own title all say Mail.

Swept 2560 to 390: no header overflow and no document overflow at any width,
the words switching exactly at 1620/1619, the masthead exactly at 1400/1399." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
