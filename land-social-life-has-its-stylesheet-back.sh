#!/usr/bin/env bash
# land-social-life-has-its-stylesheet-back.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug, looking at the City Feed: "fix the design issue."
#
# ─── IT WAS NOT A DESIGN ISSUE. IT WAS A DELETED FILE. ──────────────────────
#
# `d3e1d51 · Social Life takes the city's paper` (15 Aug) added 216 lines of
# `.sl-*` rules to relief.css. THE VERY NEXT COMMIT TO TOUCH THAT FILE,
# `c6c32b2 · The daybook`, WROTE A STALE COPY OVER IT: -216 +55, and all 216
# were that block. Nothing else in the diff. It has been gone for two days.
#
# What the owner was looking at is the consequence with nothing else in it: the
# tab row reads "For YouPhotosVideosThoughtsFriends" because every class is
# still in the markup and NOT ONE OF THEM MATCHES A RULE. Measured on the live
# page before restoring anything:
#
#     .sl-tabs  ->  display: block     (browser default)
#     .sl-tab   ->  display: inline-block, padding 0, margin 0
#
# FORTY-FOUR `sl-` CLASS NAMES ACROSS TEN FILES, NONE OF THEM STYLED.
#
# ─── SO IT COMES BACK, BYTE FOR BYTE, AS A FILE OF ITS OWN ──────────────────
#
# Every rule in src/styles/social.css is exactly what d3e1d51 shipped - checked
# out of that commit, not retyped and not redesigned. All 30 custom properties
# it reads are still defined; all 44 classes the components use are covered.
#
# IT IS A FILE RATHER THAN A SECTION because living inside a 235KB stylesheet
# is HOW IT WAS LOST. A block deep in a file nobody diffs line-by-line vanishes
# under a stale copy in silence. A whole missing file does not.
#
# It is imported AFTER relief.css, which is where it sat in the cascade before
# (line 1414 of 3891, written to override the `.g-*` glass above it).
#
# ─── AND THE RATCHET NOW READS IT ───────────────────────────────────────────
#
# relief.spec.ts gains social.css in all four places it lists stylesheets. That
# file already says, above Mira's sheet: "a stylesheet no ratchet reads is a
# second design system with a head start." This one spent two days deleted and
# no rule in that file would have said a word.
#
# The new guard's last assertion is the one that matters: it WALKS the
# components and asserts every `sl-` class it finds has a rule. It would have
# failed on 15 August, and it fails again the next time a file is written over.
#
# Frontend only. No API file is touched and the server is not built here.
# This change does not touch relief.css or layout.css, so it is independent of
# land-the-plate-is-shown-whole.sh and the two can land in either order.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
git log --oneline -40 | grep 'Social Life has its stylesheet back' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
C="$W/src/styles/social.css"
M="$W/src/main.tsx"
RS="$W/src/app/relief.spec.ts"
G="$W/src/app/social-life-has-its-stylesheet-back.test.ts"
for f in "$C" "$M" "$RS" "$G"; do [ -f "$f" ] || die "missing $f"; done
grep -q '.sl-tabs {' "$C"                                  || die "the restored block has no tab row in it"
grep -q "import './styles/social.css';" "$M"               || die "nothing imports the sheet"
grep -q "const social = read('src/styles/social.css');" "$RS" || die "the ratchet still cannot see it"

say "2b - the restored block is what d3e1d51 shipped, not something retyped"
# The check that matters most, and the cheapest one there is: every rule in the
# new file must appear in that commit's relief.css. If a line drifted on the way
# back in, this is where it shows up.
TMP="$(mktemp)"
git show d3e1d51:"$W/src/styles/relief.css" > "$TMP" 2>/dev/null || die "cannot read d3e1d51 - is this the right repo?"
DRIFT=0
while IFS= read -r line; do
  case "$line" in
    ''|'/*'*|' '*'*/'|*'*/') continue ;;
  esac
  case "$line" in *'{'*|*'}'*|*':'*)
    grep -qxF "$line" "$TMP" || { printf '   drifted: %s\n' "$line"; DRIFT=$((DRIFT+1)); } ;;
  esac
done < <(grep -A100000 '^\.sl-head {' "$C" || true)
rm -f "$TMP"
[ "$DRIFT" -eq 0 ] || die "$DRIFT restored line(s) do not match d3e1d51 - this should be a checkout, not a rewrite"
ok "every restored rule is byte-identical to d3e1d51"

say "2c - every sl- class the markup uses has a rule"
MISS=""
for c in $(grep -rho "\bsl-[a-z0-9-]*" --include=*.tsx "$W/src/features" | grep -v -- '-$' | sort -u); do
  grep -qF ".$c" "$C" || MISS="$MISS $c"
done
[ -z "$MISS" ] || die "still unstyled:$MISS"
ok "all 44 of them"

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/social\.css|src/main\.tsx|app/relief\.spec\.ts|social-life-has-its-stylesheet-back\.test\.ts|land-social-life-has-its-stylesheet-back\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  note "(relief.css / layout.css / Sidebar.tsx belong to land-the-plate-is-shown-whole.sh)"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/social-life-has-its-stylesheet-back.test.ts || die "the stylesheet guard"
# relief.spec is the point of this change as much as the CSS is: it now reads a
# fifth stylesheet, and every material rule in it applies to 216 restored lines
# for the first time.
npx vitest run src/app/relief.spec.ts || die "relief.spec over the fifth stylesheet"
ok "the guard passes, and the ratchet accepts the restored sheet"
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
git add "$C" "$M" "$RS" "$G" land-social-life-has-its-stylesheet-back.sh
git commit -q -m "Social Life has its stylesheet back

Owner, looking at the City Feed: 'fix the design issue.' It was not a design
issue. It was a deleted file.

d3e1d51 'Social Life takes the city's paper' added 216 lines of .sl-* rules to
relief.css on 15 August. The very next commit to touch that file, c6c32b2 'The
daybook', wrote a stale copy over it: -216 +55, and all 216 were that block.
Nothing else in the diff. It has been gone for two days.

What the owner saw is that with nothing else in it. The tab row reads
'For YouPhotosVideosThoughtsFriends' because every class is still in the markup
and not one of them matches a rule. Measured on the live page before restoring:
.sl-tabs computed to display:block and .sl-tab to inline-block with padding 0
and margin 0 - the browser's defaults, because there was nothing else to have.
Forty-four sl- class names across ten files, none of them styled.

Every rule comes back byte for byte out of d3e1d51 - checked out, not retyped,
and the land script diffs each restored line against that commit rather than
trusting me. All 30 custom properties it reads are still defined; all 44 classes
the components use are covered.

IT IS A FILE RATHER THAN A SECTION BECAUSE LIVING INSIDE A 235KB STYLESHEET IS
HOW IT WAS LOST. A block deep in a file nobody diffs line-by-line vanishes under
a stale copy in silence; a whole missing file does not. It imports after
relief.css, which is where it sat in the cascade before - line 1414 of 3891,
written to override the .g-* glass above it.

And relief.spec.ts now reads it, in all four places that file lists
stylesheets. That file already says, above Mira's sheet, that a stylesheet no
ratchet reads is a second design system with a head start. This one spent two
days deleted and no rule in it would have said a word. The new guard walks the
components and asserts every sl- class it finds has a rule: it would have failed
on 15 August, and it fails again the next time a file is written over." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
