#!/usr/bin/env bash
# Together City — apply + push the Nutrition warm-paper recolour.
# Safe to re-run: if the branch is already pushed with this change, it says so
# and stops rather than creating a duplicate commit.
set -euo pipefail

REPO_SSH="git@github.com:somenk05-tech/Together-Ai.git"
REPO_HTTPS="https://github.com/somenk05-tech/Together-Ai.git"
BRANCH="feat/nutrition-warm-paper"
PR="https://github.com/somenk05-tech/Together-Ai/compare/${BRANCH}?expand=1"
PATCH="${1:-nutrition-warm-paper.patch}"

[ -f "$PATCH" ] || { echo "✗ Patch not found: $PATCH"; exit 1; }
PATCH="$(cd "$(dirname "$PATCH")" && pwd)/$(basename "$PATCH")"

if git rev-parse --show-toplevel >/dev/null 2>&1 && \
   git remote get-url origin 2>/dev/null | grep -q "Together-Ai"; then
  cd "$(git rev-parse --show-toplevel)"
  echo "→ Using existing clone: $(pwd)"
else
  WORK="${TMPDIR:-/tmp}/together-ai-push"; rm -rf "$WORK"
  echo "→ Cloning…"
  git clone "$REPO_SSH" "$WORK" 2>/dev/null || git clone "$REPO_HTTPS" "$WORK"
  cd "$WORK"
fi

echo "→ Fetching"
git fetch origin --quiet

# ── Already done? Then stop. This is the guard the first version lacked. ──
if git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null; then
  if git show "origin/$BRANCH:together-city-react/src/styles/tokens.css" 2>/dev/null \
     | grep -q "NUTRITION'S PAPER"; then
    echo
    echo "✓ Already pushed — origin/$BRANCH has this change ($(git rev-parse --short origin/$BRANCH))."
    echo "  Nothing to do. Open a PR:  $PR"
    if git rev-parse --verify --quiet "$BRANCH" >/dev/null &&
       [ -n "$(git rev-list --left-right --count "origin/$BRANCH...$BRANCH" 2>/dev/null | awk '$2>0')" ]; then
      echo
      echo "  NOTE: your local $BRANCH has diverged from the remote (a duplicate"
      echo "  commit of the same change). To line them up, discarding the local one:"
      echo "      git checkout $BRANCH && git reset --hard origin/$BRANCH"
    fi
    exit 0
  fi
fi

echo "→ Branching $BRANCH from main"
git checkout main --quiet && git pull --ff-only --quiet
git checkout -B "$BRANCH" --quiet

echo "→ Applying patch"
git apply --check "$PATCH"
git apply "$PATCH"

echo "→ Verifying (tests + build) before pushing"
cd together-city-react
npm install --no-audit --no-fund >/dev/null 2>&1
npx vitest run
npx tsc --noEmit
npx vite build >/dev/null
cd ..

echo "→ Committing"
git add together-city-react/src/styles/tokens.css together-city-react/src/app/relief.spec.ts
git commit -q -m "Nutrition: warm paper ground, scoped to the hub and guarded

Re-points grounds, faces, rims and all five depths inside
[data-hub=\"nutrition\"] only. No component, layout or spacing file is
touched; deleting the block removes the whole treatment.

The relief is unchanged - five depths, no sixth. Only the colour of the
light changes: a warm taupe shadow ink and a warm white rim highlight,
because a black shadow on cream greys it and reads as dirt, not depth.

Tightens 'keeps the ground white' to check the root only and adds a guard
proving the exception cannot spread to a second hub or invent a sixth depth."

echo "→ Pushing"
git push -u origin "$BRANCH"
echo; echo "✓ Pushed $BRANCH"; echo "  Open a PR:  $PR"
echo "  NOTE: merging to main deploys BOTH Vercel (web) and Railway (api)."
