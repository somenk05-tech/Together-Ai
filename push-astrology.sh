#!/usr/bin/env bash
# Together City — Astrology night surface.
# Detects and REPLACES an earlier, wrong version of this branch if one is there.
set -euo pipefail
BRANCH="feat/astrology-night-surface"
PR="https://github.com/somenk05-tech/Together-Ai/compare/${BRANCH}?expand=1"
PATCH="${1:-astrology-night-surface.patch}"
[ -f "$PATCH" ] || { echo "✗ Patch not found: $PATCH"; exit 1; }
PATCH="$(cd "$(dirname "$PATCH")" && pwd)/$(basename "$PATCH")"

git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "✗ Run inside the Together-Ai clone."; exit 1; }
cd "$(git rev-parse --show-toplevel)"
echo "→ Fetching"; git fetch origin --quiet

# The corrected build is identified by the one-word .btn-secondary fix. The
# earlier push had a gold lamp and a re-pointed --on-accent; it must be replaced,
# not left alongside.
CORRECT=0
if git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null; then
  if git show "origin/$BRANCH:together-city-react/src/styles/relief.css" 2>/dev/null \
     | grep -q "background: var(--card); color: var(--ink)"; then CORRECT=1; fi
fi
if [ "$CORRECT" = "1" ]; then
  echo; echo "✓ Already pushed, and it is the corrected build."; echo "  PR: $PR"; exit 0
fi
echo "→ An earlier build of this branch is on the remote; replacing it."

git checkout main --quiet && git pull --ff-only --quiet
git checkout -B "$BRANCH" --quiet
echo "→ Applying corrected patch"; git apply --check "$PATCH"; git apply "$PATCH"

echo "→ Verifying (tests + typecheck + build)"
cd together-city-react
npm install --no-audit --no-fund >/dev/null 2>&1
npx vitest run && npx tsc --noEmit && npx vite build >/dev/null 2>&1
cd ..

echo "→ Committing"
git add together-city-react/src/styles/tokens.css together-city-react/src/styles/relief.css together-city-react/src/app/relief.spec.ts
git commit -q -m "Astrology: a night ground, scoped to the hub and guarded

Answers the question the Relief rollout left open - whether the tarot page and
the letter should keep a night surface as a deliberate one-room exception. The
artwork it was drawn for is still in the tree and the hub config still declares
dark: true.

Not a dark mode: nothing toggles, there is no [data-theme], and a citizen who
never opens Astrology never sees a dark pixel. The relief is unchanged - five
depths, same geometry, with the light inverted so the highlight does the work
the shadow did on white.

THE CITY'S FURNITURE STAYS THE CITY'S. The orange lamp, --on-accent and the
black primary button are NOT re-pointed. --on-accent is read by seven surfaces
and every one is dark; inverting it for a gold fill turns the black button's own
label black. The metal lives in --accent-ink where it is text.

The rail WELL does follow the room, because every label on it reads --ink.

One latent bug fixed in one word: .btn-secondary was background:#fff under
color:var(--ink). It is var(--card) now, which IS #ffffff at the root, so the
other twenty-four hubs are unchanged."

echo "→ Pushing (replacing the earlier build)"
git push --force-with-lease -u origin "$BRANCH"
echo; echo "✓ Pushed the corrected $BRANCH"; echo "  PR: $PR"
echo "  Preview: https://together-ai-git-feat-astrology-night-surface-togethercity.vercel.app"
echo "  PRODUCTION NEEDS THE PR MERGED TO main — a branch push only builds a preview."
