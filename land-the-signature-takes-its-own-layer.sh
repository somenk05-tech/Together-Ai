#!/usr/bin/env bash
# land-the-signature-takes-its-own-layer.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug 12:40am: "move the together city logo on layer on top and at
# the center of the page and the make the top hub layer --- show me"
#
# ─── THE ADMISSION FIRST, BECAUSE THIS COMMIT IS HALF A CORRECTION ───────────
#
# Two commits earlier the same night I put this header on ONE line at 1400px
# and its words back at 1620px, and told the owner in writing that nothing
# would crop at any width. Both numbers came from a headless browser in a Linux
# sandbox, and that rig was wrong twice over:
#
#   · 'General Sans' is a WEBFONT it could not load, so all twelve district
#     labels were measured in a substitute face;
#   · its computed `.tc-nav` gap came out 6px against the real 26px.
#
# It reported the row needing 1420px. On the owner's own machine that row needs
# 1580px, and 1737px with the words - so the header he was looking at when he
# wrote the line above had HIS OWN NAME clipped off the right edge, on a change
# whose entire promise was that nothing would be cropped. The screenshots he
# sent are the bug report.
#
# THE NUMBERS BELOW WERE READ OFF THE LIVE PAGE, IN HIS BROWSER, WITH HIS FONTS:
#     logo 102 · districts 1123 · pills 267 icons / 424 with words
#     one line,   icons 1580      one line,   words 1737
#     two layers, icons 1458      two layers, words 1615
#
# And the detail that turned a near miss into a visible crop: A MEDIA QUERY
# MATCHES `innerWidth`, BUT THE ROW IS LAID OUT IN `clientWidth` - 15px less,
# because the page has a scrollbar. Every breakpoint here is the measured need
# plus that 15px plus a margin, which is why none of them is round.
#
# ─── AND THE SHAPE HE ASKED FOR IS THE ONE THAT FITS ────────────────────────
#
# The signature goes on a layer of its own, centred on the page (measured 777px
# of paper either side at 1720). The districts and the citizen's own doors share
# the layer beneath, doors pinned right. Taking the logo out of the line gives
# back 122px, which is most of the difference between a row that crops and one
# that does not. Centring the districts on that second layer was tried and
# rejected BY MEASUREMENT, not taste: at 1720 the tabs and the pills overlap by
# 62px.
#
#   two layers from 1500 .... 1458 + 15 + margin
#   the words from 1700 ..... 1615 + 15 + room for a longer first name
#   below 1500 .............. the three-row masthead, exactly as since 15 Aug
#
# THE GUARD IS RENAMED, NOT EDITED. `the-header-holds-one-line.test.ts` passed
# twice on a header that cropped; a guard is only as honest as the rig that set
# its constants. The replacement defends the DIRECTION - a header breakpoint may
# move up, never down - and carries the real numbers in its own comments.
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
git log --oneline -40 | grep 'The signature takes its own layer' >/dev/null \
  && die "already landed - re-running is a no-op by design"
git log --oneline -40 | grep 'The doors take the right edge' >/dev/null \
  || die "this corrects 'The doors take the right edge' - land that first"
ok "not landed yet, and the commit it corrects is in"

say "2 - the edit is already in the tree"
L="$W/src/styles/layout.css"
T="$W/src/styles/tokens.css"
OLD="$W/src/app/the-header-holds-one-line.test.ts"
NEW="$W/src/app/the-header-is-two-layers.test.ts"
for f in "$L" "$T" "$NEW"; do [ -f "$f" ] || die "missing $f"; done
grep -q '@media (min-width: 1500px)' "$L"                                     || die "no two-layer block in layout.css"
grep -q 'flex-wrap: wrap;' "$L"                                               || die "the header cannot wrap, so it cannot have two layers"
grep -q '.tc-header .tc-header-top { flex: 0 0 100%; width: 100%; display: flex; justify-content: center; }' "$L" \
                                                                              || die "the signature is not a layer of its own"
grep -q '.tc-header .tc-actionrow { order: 3; margin-left: auto; }' "$L"       || die "the doors are not pinned to the right edge"
grep -q '@media (min-width: 1700px)' "$L"                                     || die "no block puts the words back"
grep -q ':root { --header-h: 90px; }' "$T"                                    || die "tokens.css does not re-point the header height for two layers"
# The two numbers this commit exists to correct. A shell grep cannot strip
# comments - and these strings appear in the new comments describing the
# mistake - so the ABSENCE checks live in the vitest guard below, which can.
# That division is the lesson from a grep that matched its own comment.
grep -qE '@media \(min-width: (1[0-4][0-9][0-9]|[0-9]{1,3})px\) \{[^}]*tc-header' "$L" \
  && die "a header breakpoint below 1500 - the second layer was measured to need 1458 + a 15px scrollbar"
ok "layout.css and tokens.css carry the two layers"

say "2b - the guard is renamed"
if [ -f "$OLD" ]; then
  git rm -q "$OLD" || die "could not remove the old guard"
  ok "the-header-holds-one-line.test.ts removed - it passed twice on a header that cropped"
else
  note "the old guard is already gone"
fi

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/layout\.css|styles/tokens\.css|the-header-holds-one-line\.test\.ts|the-header-is-two-layers\.test\.ts|land-the-signature-takes-its-own-layer\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-header-is-two-layers.test.ts || die "the two-layer guard"
# relief.spec owns the shell's material and asserts it only styles classes the
# shell actually renders; layout-claims-its-room and the-chat-stage-on-a-phone
# both read this header's geometry, and --header-h moved.
npx vitest run src/app/relief.spec.ts src/app/layout-claims-its-room.test.ts \
               src/app/the-chat-stage-on-a-phone.test.ts src/app/one-layout-system.test.ts \
               src/app/citizen-facing-copy.test.ts \
  || die "the shell / layout guards"
ok "the two-layer guard and its five neighbours pass"
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
git add "$L" "$T" "$NEW" land-the-signature-takes-its-own-layer.sh
git commit -q -m "The signature takes its own layer, and the breakpoints are measured on a real page

Owner: 'move the together city logo on layer on top and at the center of the
page and the make the top hub layer.' The signature now sits alone and centred
on a layer of its own; the districts and the citizen's own doors share the layer
beneath it, doors pinned right.

THIS IS ALSO A CORRECTION. Two commits earlier tonight put this header on one
line at 1400 and its words back at 1620, with a written promise that nothing
would crop. Both numbers came from a headless browser that could not load
'General Sans' and computed the district row's gap as 6px against the real 26px.
It reported 1420px. Measured on the live page in the owner's own browser the
same row needs 1580, and 1737 with the words - so the header he was looking at
when he asked for this had his own name clipped off the right edge.

  logo 102 · districts 1123 · pills 267 icons / 424 with words
  one line,   icons 1580     one line,   words 1737
  two layers, icons 1458     two layers, words 1615

And a media query matches innerWidth while the row is laid out in clientWidth -
15px less, because of the scrollbar. Every breakpoint here is the measured need
plus that 15px plus a margin: two layers from 1500, the words from 1700, and
below 1500 the three-row masthead exactly as it has been since 15 August.

Taking the logo out of the line gives back 122px, which is most of the
difference between a row that crops and one that does not - the shape that was
asked for is the shape that fits. Centring the districts on the second layer was
tried and rejected by measurement: at 1720 they overlap the pills by 62px.

--header-h is re-pointed to 90px, the measured height of two layers, because
that token is what the main column, the sticky sidebar and four full-height
surfaces clear.

the-header-holds-one-line.test.ts is deleted rather than edited. It passed,
twice, on a header that cropped. A guard is only as honest as the rig that set
its constants, so its replacement defends the direction - a header breakpoint
may move up, never down - and carries the real numbers in its own comments." \
  || die "commit"
ok "committed"
git log --oneline -1
git show --stat --oneline HEAD | tail -6

say "done - now: git push"
