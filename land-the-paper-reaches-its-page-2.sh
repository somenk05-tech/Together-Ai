#!/usr/bin/env bash
# land-the-paper-reaches-its-page-2.sh  ·  run from the REPO ROOT
#
# ── WHY -2 ───────────────────────────────────────────────────────────────────
# The original's precondition used `git log | grep -q X || die` under pipefail.
# grep -q exits on the first match, git log takes SIGPIPE, the pipeline reports
# 141, and the || fired on SUCCESS — it refused to run precisely because the
# Tuesday commit WAS there. The repo's own scripts only pipe into grep -q in
# the `&& die` direction, where a spurious failure is harmless; the money
# script buffers the log into a variable first, which is the shape used below.
# The patch is unchanged.
#
# One line. `ef9bb93` shipped the profile's paper as
#   [data-paper="tue"] .food-paper        (a DESCENDANT of the attribute)
# but Preferences.tsx carries the class and the attribute on the SAME element,
# so the selector matched nothing: every --press-recto-* stayed unset, the
# background-image resolved to none, and the page shipped white. Verified on
# togethercity.app in a browser — setting the attribute on the parent made the
# sheet paint instantly, veil and inks included.
#
# The guards could not have caught this: they read source as TEXT and the block
# is present and well-formed. A selector that matches nothing is only visible
# where there is a DOM. The fix is the compound selector, same element:
#   .food-paper[data-paper="tue"]
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
LOG="$(git log --oneline -20)"
printf '%s\n' "$LOG" | grep 'prints on Tuesday' >/dev/null; [ $? -eq 0 ] || die "the Tuesday commit is not here - this fixes it, land it first"
printf '%s\n' "$LOG" | grep 'paper reaches its page' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "Tuesday is here, the fix is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/styles/tokens\.css$'
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

say "3 - apply, with an exactly-once assertion"
python3 - "$W" <<'PYEOF' || die "the anchor did not match exactly once - see above"
import sys, pathlib
W = pathlib.Path(sys.argv[1])
p = W / 'src/styles/tokens.css'
s = p.read_text()
old = '[data-paper="tue"] .food-paper {'
new = '.food-paper[data-paper="tue"] {'
n = s.count(old)
if n != 1:
    print(f"   x anchor found {n} times, expected 1"); sys.exit(1)
if '.food-paper[data-paper="tue"]' in s:
    print("   x compound selector already present"); sys.exit(1)
p.write_text(s.replace(old, new))
print("   * tokens.css   the paper's selector matches the page's one element")
PYEOF

say "4 - sha256"
ok "$(shasum -a 256 "$W/src/styles/tokens.css" | cut -c1-16)  src/styles/tokens.css"

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
git add $W/src/styles/tokens.css
git commit -F - <<'MSG'
The paper reaches its page

ef9bb93 wrote the profile's paper into Tuesday's block as a descendant -
[data-paper="tue"] .food-paper - while Preferences.tsx carries the class and
the attribute on the SAME div. The selector matched nothing, every
--press-recto-* custom property stayed unset, the background-image computed to
none, and the page shipped white with the city's own inks. Harmless to read,
invisible to every gate, and not the feature.

The fix is the compound selector, .food-paper[data-paper="tue"], on the same
element the page actually renders. The press's own pages are untouched:
[data-paper="tue"] .press-recto keeps its descendant shape because PressDay
really does put the attribute on a wrapper and the sheet on a child.

WHY NO GUARD CAUGHT IT. The suites read source as TEXT - the block exists, the
tokens are well-formed, the veil and inks are all present, and relief.spec's
assertions about the paper blocks all pass against a selector that matches
nothing in any DOM. This failure is only visible in a browser, which is where
it was found: on the deployed page, --press-recto-sheet computed to none;
setting the attribute one element up painted the sheet instantly, veil and
inks included. A selector is a claim about a DOM, and no gate in this repo
holds a DOM.
MSG

ok committed
say "review, then:  git push"
