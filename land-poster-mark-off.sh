#!/bin/bash
# land-poster-mark-off.sh — the wordmark leaves the poster (10 Aug 2026).
# Every hub landing carried a small "TOGETHER CITY" above its line, borrowed
# from the editorial reference. The header already says it on the same screen,
# and the poster's own building says whose city it is — so it read as the same
# words twice. Removed, with its rule.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The wordmark leaves the poster"
LOG=$(git log --oneline -60)
case "$LOG" in *"The hub landing is the screen"*) ;; *)
  echo "Run land-hub-poster-landing.sh first."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

patch('together-city-react/src/pages/HubLanding.tsx',
  '            <span className="hp-mark">Together<br />City</span>\n',
  '')

patch('together-city-react/src/index.css',
  """  .hp-mark {
    font-size: 10px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;
    line-height: 1.35; color: rgba(255,255,255,.66); margin-bottom: 4px;
  }
""",
  "")

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
npx vitest run
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/pages/HubLanding.tsx together-city-react/src/index.css
git commit -m "$MARK

The poster foot carried a small letterspaced TOGETHER CITY above the hub's
line — the corner label from the editorial reference. On that reference it is
the only place the brand appears; here the header says it two inches above,
on the same screen, and the building in the photograph is already the city's.
Three times is not a signature, it is a stutter. The mark and its rule are
gone; the line and the button keep the foot to themselves."
git push
echo "LANDED."
