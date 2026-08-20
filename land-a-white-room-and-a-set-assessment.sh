#!/bin/bash
# land-a-white-room-and-a-set-assessment.sh
#
# Two changes to the same room, in one commit because they are in the same two
# stylesheets and the first was never landed:
#
#   1. THE WALL GOES WHITE. The beauty hub's near-black ground — grained,
#      vignetted, the owner's own backdrop photograph — becomes #ffffff at the
#      owner's word. Two declarations and the three inks measured against them.
#      The plates stay cream: white behind cream keeps the seam that makes a
#      plate read as a plate.
#
#   2. THE ASSESSMENT IS SET RATHER THAN PRINTED. The one sentence the whole
#      profile page exists to produce was 13.5px prose on the ground, smaller
#      than the section headings under it. It becomes a plate in the owner's
#      reference composition: an oval stamp of tracked capitals, the findings in
#      display serif with the emphasis alternating roman and italic, and the
#      qualifier beneath in small italic.
#
# land-the-wall-goes-white.sh was written for (1) alone and is in
# _to_delete/superseded-scripts/. It was never run; its relief.css hash went
# stale the moment the italic @font-face was added for (2).
#
# BOTH PACKAGES. Railway rebuilds the API, Vercel the web app. No schema, no
# migration — and deliberately no backfill: see below.
# PRECONDITION: "The routine knows when".
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="A white room, and the assessment set in it"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The routine knows when"*) ;;
  *) echo "!! Run land-the-routine-knows-when.sh first — this is written against the tree it produces."; exit 1 ;;
esac

# ── the tree carries these eleven files, and nothing else that matters ──────
# Scope, not filenames — see land-the-shelf-and-the-cap-2.sh for the argument.
ALLOWED='^(M |MM| M|\?\?) (together-city-chat/src/beauty/(beauty-analysis\.ts|beauty\.service\.ts|assessment-needs-evidence\.spec\.ts|an-assessment-has-parts\.spec\.ts)|together-city-react/(src/(styles/(tokens|relief|layout)\.css|features/beauty/(api\.ts|pages/Profile\.tsx|components/AssessmentPlate\.tsx))|public/assets/fonts/instrument-serif-400-italic\.woff2))$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"
  echo "   Commit or stash them first — this script will not commit on top of them."
  exit 1
fi

SCRATCH="$(printf '%s\n' "$STATUS" | grep -E '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$SCRATCH" ]; then
  N="$(printf '%s\n' "$SCRATCH" | grep -c . || true)"
  echo "== $N untracked path(s) outside the packages, ignored — none of it is committed"
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify ffa263dee1fb988eb9ba727fe5a344dba0aa3198ddc9a3e73b6e2a3452973f19 together-city-chat/src/beauty/beauty-analysis.ts
verify e32e3990956b5f8805999b4343ee60e3542546b4498455d9717c90b87e2508ae together-city-chat/src/beauty/beauty.service.ts
verify 2268a167c86a19222d29ab15c2d70afcaad863339f405348b1b3a85c4b157a5c together-city-chat/src/beauty/an-assessment-has-parts.spec.ts
verify 657724efebfe585959cb179b31b4cf9b9cd4928fcbf528634b5de365e92cc515 together-city-chat/src/beauty/assessment-needs-evidence.spec.ts
verify 5a3946546ccd75a24051887f3ccdde759406ec7f76680b9119adb825b3649cd6 together-city-react/src/styles/tokens.css
verify 29ffb77d589aa5bd5708201c41ad2afcab677a3db26be524b00fb472f07ceb12 together-city-react/src/styles/relief.css
verify 98e94867814a4531d123e88212d80a75a0296fb5aca37122c8bcc5bee562f712 together-city-react/src/styles/layout.css
verify 14728d353a03aedad7693fbd560f5de2c7a1b31cbd6385a187cc10f2f8b61526 together-city-react/src/features/beauty/api.ts
verify 2460ac5e49d32e76dee974e7def0dadaf40bd0f9f829985a42b84f51e042e250 together-city-react/src/features/beauty/components/AssessmentPlate.tsx
verify a02b88d8f063b3b9577cb406cae5696f54300760968b8f915a3d39ae7cb74b19 together-city-react/src/features/beauty/pages/Profile.tsx
# THE FONT IS HASHED LIKE EVERYTHING ELSE, and it matters more here than for a
# text file: a woff2 that arrives truncated does not fail to parse loudly, it
# fails to load quietly and the browser slants the roman instead — which is
# precisely the thing this file was added to prevent.
verify 5a51946dfffa82972bc98745359c46761515641fda557c25116459a9f83da4a7 together-city-react/public/assets/fonts/instrument-serif-400-italic.woff2
echo "== all eleven files verified"

# ── the API ────────────────────────────────────────────────────────────────
echo
echo "== API gate: tsc"
(cd together-city-chat && npx tsc --noEmit)

echo "== API gate: the suites this can reach"
(cd together-city-chat && npx jest src/beauty src/shared --silent)

echo "== API gate: lint, held to the number on main"
# See land-the-shelf-and-the-cap-2.sh: lint-ceiling.json says 124, main measures
# 127 from a change that landed without ratcheting. Not raised, not lowered;
# what is enforced is that THIS commit adds nothing.
API_BASELINE=127
API_LINT="$( { (cd together-city-chat && npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null) || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || { echo "!! ESLint produced no readable report. Not committing on an unmeasured tree."; exit 1; }
if [ "$API_LINT" -gt "$API_BASELINE" ]; then
  echo "!! API lint went UP: $API_LINT, main is at $API_BASELINE. This commit added some:"
  (cd together-city-chat && npx eslint 'src/beauty/**/*.ts') || true
  exit 1
fi
echo "   API lint errors: $API_LINT (main: $API_BASELINE). Nothing added."

# ── the web app ────────────────────────────────────────────────────────────
echo
echo "== web gate: tsc"
(cd together-city-react && npx tsc --noEmit)

echo "== web gate: vitest"
# relief.spec carries most of the weight for both halves of this commit. For the
# wall: it recomputes the contrast of every ink against the ground it is
# declared for, following one hop through a var(), so a near-white left behind
# on a white ground fails arithmetically rather than by eye. For the plate: its
# assertion 4 is an exact list of the selectors allowed to borrow the display
# serif — this commit adds a WEARER, not a borrower, and if that were wrong the
# list would not match.
(cd together-city-react && npx vitest run)

echo "== web gate: the ceilings that are clean"
(cd together-city-react && node scripts/a11y-audit.mjs)
(cd together-city-react && node scripts/motion-ceiling.mjs)
(cd together-city-react && node scripts/lint-ceiling.mjs)

echo "== web gate: the two audits main is already failing"
DEAD_BASELINE=3
DEAD_OUT="$( { (cd together-city-react && node scripts/dead-export-audit.mjs 2>&1) || true; } )"
DEAD="$(printf '%s\n' "$DEAD_OUT" | sed -n 's/.*Exports nothing imports[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n 1p)"
[ -n "$DEAD" ] || { echo "!! Could not read the dead-export audit:"; echo "$DEAD_OUT"; exit 1; }
if [ "$DEAD" -gt "$DEAD_BASELINE" ]; then
  echo "!! Exports nothing imports went UP: $DEAD, main is at $DEAD_BASELINE:"
  (cd together-city-react && node scripts/dead-export-audit.mjs --list) || true
  exit 1
fi
echo "   dead exports: $DEAD (main: $DEAD_BASELINE). Nothing orphaned."

NAV_BASELINE=1
NAV_OUT="$( { (cd together-city-react && node scripts/nav-audit.mjs 2>&1) || true; } )"
case "$NAV_OUT" in
  *clean*) NAV=0 ;;
  *) NAV="$(printf '%s\n' "$NAV_OUT" | sed -n 's/.*nav-audit: \([0-9][0-9]*\) problem.*/\1/p' | sed -n 1p)" ;;
esac
[ -n "$NAV" ] || { echo "!! Could not read nav-audit:"; echo "$NAV_OUT"; exit 1; }
if [ "$NAV" -gt "$NAV_BASELINE" ]; then
  echo "!! nav-audit went UP: $NAV, main is at $NAV_BASELINE:"; echo "$NAV_OUT"; exit 1
fi
echo "   nav-audit problems: $NAV (main: $NAV_BASELINE). Nothing stranded."

echo "== web gate: the build"
(cd together-city-react && npx vite build)

cd "$(dirname "$0")"

echo
echo "   ── THREE PIECES OF DRIFT ON MAIN, STILL NONE OF THEM THIS COMMIT'S ──"
echo "   web  dead-export-ceiling.json says 2, the tree measures $DEAD."
echo "   web  nav-audit: \"/beauty/makeup\" is declared and nothing links to it."
echo "   api  scripts/lint-ceiling.json says 124, the tree measures $API_LINT."
echo "   Third landing script in a row to explain itself around these."
echo "   ─────────────────────────────────────────────────────────────────────"
echo

git add -A together-city-chat/src/beauty together-city-react/src together-city-react/public/assets/fonts
git commit -F - <<'MSG'
A white room, and the assessment set in it

Two changes to the same room, in one commit because they are in the same two
stylesheets and the first was written before the second and never landed.

═══ THE WALL GOES WHITE ═══════════════════════════════════════════════════════

The beauty hub's ground was near-black — grained, vignetted, lit from up and to
the left, the owner's own backdrop photograph generated in four lines of CSS
rather than shipped. It is white, at the owner's word.

WHAT IT COST IS THE INTERESTING PART: two declarations and the three inks
measured against them. --ground to #ffffff; --sky-image no longer declared, so
it falls back to the `none` at :root; and --on-ground / -soft / -muted, which
were near-whites chosen for a black wall, now point at the paper's inks through
var() so the two lists cannot drift. Nothing else moved — not the plates, the
cards, the hairline, the paper inks, the five depths, a radius or a gap. The
grant claimed to be the cheapest of the three and the cleanest to hand back;
this is that claim tested by an owner changing their mind, and it held.

THE TEXTURE IS REMOVED RATHER THAN RE-TUNED. All three of its layers were drawn
FOR near-black and every one is wrong on white rather than merely mistuned:
fractal grain on white is dirt, a white key on white is nothing, and a vignette
falling to true black is a grey smudge in the corners of a clean room.
Re-tuning a texture for a ground it was not drawn for is how a hub ends up with
an effect nobody can defend and nobody dares delete.

WHITE, AND NOT THE PAPER'S CREAM — the same refusal as "do not put the cream on
.page", from the other side. Cream behind cream is one undifferentiated slab and
the plates stop reading as plates. White is a step LIGHTER than the print, so
the seam survives the inversion.

AND THE INK MACHINERY STAYS, though both scales now resolve to the same greys
and the whole apparatus reads as dead code. It is not: it is the reason this was
two declarations. The comment above the lit-surface list in relief.css now says
so in those words, because that list has been forgotten twice while it was
visibly load bearing and it is easier to forget now that it is not.

═══ AND THE ASSESSMENT IS SET RATHER THAN PRINTED ═════════════════════════════

"Your assessment flags Pigmentation & spots, Fine lines & firmness, Oil balance
as the priorities." — the one sentence the photographs and the questionnaire
were FOR, at 13.5px, on the ground, smaller than the section headings under it.
It had no card by an earlier decision, and that decision was right about the
thing it refused and wrong about the conclusion: the card it removed was the
city's NOTICE idiom, which made the answer look like an alert about itself. A
thing can be given a surface without being given an alarm.

It is now the owner's reference composition, in the hub's own material: an oval
stamp of tracked capitals, the findings in display serif set large and centred
with the emphasis alternating roman and italic, and the qualifier beneath in
small italic.

NOTHING WAS GRANTED FOR IT, which is the test of whether the last grant was
drawn at the right size. It is a `.beauty-plate` — same cream, same hairline,
same lift, same centred axis, already on the ink-restore list because it paints
nothing of its own — and the face is `.beauty-display`, the hub's ONE display
class, which has borrowed the press serif by name since the poster reference
arrived. A sixth grant would have been asking permission to do what the fifth
already permits.

THE ITALIC IS A REAL CUT. Without one the browser slants the roman, and a
synthetic oblique of a display serif at 38px is the thing on a page that looks
broken to everybody and wrong to nobody who can say why. It is the same family,
same foundry, same latin subset — the roman already on disk is byte-for-byte the
file this one ships beside — so it is a second cut of the granted face rather
than a second typeface. 22 KB, `swap`.

IN THE HUB'S INK, NOT THE REFERENCE'S GREEN. The reference is set in a deep
green. Beauty's hue is magenta and the ground grant is explicit that the hue is
not the ground and not the ink. A green display line would be a fourth hue
arriving with no grant, no measured contrast and no answer to "why green". The
composition is what was asked for; the colour belongs to the poster.

── AND THE SENTENCE IS COMPOSED FROM PARTS, NOT SPLIT BACK INTO THEM ──────────

A page cannot typeset a sentence it has to take apart first, and taking it apart
in the browser would put the rule that composed it in two places. So
beauty-analysis.ts builds `summary` FROM `focus` and `note` and returns all
three, and a spec asserts the join rather than trusting it: whichever half is
edited, the paragraph still agrees with it.

There is NO MIGRATION and there should not be one — nothing about the stored
answer changed, only what the page does with it. An assessment saved in March
has its findings in `issues` and its qualifier in the second half of the summary
this same module composed, so both parts are derived on read through `focusOf`
and `noteOf`. One rule, two callers, and an old row and a new one produce the
same plate.

The well-balanced assessment has no findings, and a plate reading "." over an
empty italic line is a rendering failure with a border round it. That case keeps
the paragraph it always had.

assessment-needs-evidence.spec.ts is updated rather than loosened. The read is
now wrapped, and the wrapper is NAMED in the pattern: relaxing it to `.*` would
have made a guard about fabricated readings blind to the one thing a wrapper
introduces, which is a default. The gate — the event AND the photos, then
safeJson — is asserted whole, inside the call, and the wrapper is separately
asserted to return null for null.

Gates: API tsc, 449 tests across beauty and shared including 9 new ones in
an-assessment-has-parts.spec.ts, lint unchanged at 127. Web tsc, vitest, a11y,
motion, lint, the build. The dead-export audit and nav-audit were failing on
main before this commit and are measured against main; neither ceiling is
touched here.

No schema, no migration, no new route.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: A white room, and the assessment set in it
 Push — Railway rebuilds the API, Vercel the web app.
 /beauty/profile: a white room, and the answer on a plate.
===============================================================

DONE
