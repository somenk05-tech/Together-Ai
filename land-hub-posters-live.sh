#!/bin/bash
# land-hub-posters-live.sh — the posters arrive (10 Aug 2026).
# The thirteen 9:19.5 hub posters are on disk at
# together-city-react/public/assets/img/hub-poster/<hub>.webp (853x1844, webp
# from the owner's PNGs). This lists them, and every hub landing on a phone
# stops falling back to its landscape building and wears its own poster,
# full screen. Desktop untouched.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="Every hub wears its own poster"
LOG=$(git log --oneline -60)
case "$LOG" in *"The hub landing is the screen"*) ;; *)
  echo "Run land-hub-poster-landing.sh first."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

MISSING=""
for k in travel astrology nutrition entertainment social dating realestate jobs medical financial beauty fitness services; do
  [ -f "together-city-react/public/assets/img/hub-poster/$k.webp" ] || MISSING="$MISSING $k"
done
if [ -n "$MISSING" ]; then echo "Poster files missing for:$MISSING"; exit 1; fi

python3 - <<'PATCHEOF'
import re
P = 'together-city-react/src/pages/HubLanding.tsx'
s = open(P, encoding='utf-8').read()
start = s.index("export const HUB_PORTRAIT")
end = s.index("};", start) + 2
assert 'hub-poster/travel.webp' not in s, 'posters already listed'
open(P, 'w', encoding='utf-8').write(s[:start] + "export const HUB_PORTRAIT: Partial<Record<HubKey, string>> = {\n  travel: 'hub-poster/travel.webp',\n  astrology: 'hub-poster/astrology.webp',\n  nutrition: 'hub-poster/nutrition.webp',\n  entertainment: 'hub-poster/entertainment.webp',\n  social: 'hub-poster/social.webp',\n  dating: 'hub-poster/dating.webp',\n  realestate: 'hub-poster/realestate.webp',\n  jobs: 'hub-poster/jobs.webp',\n  medical: 'hub-poster/medical.webp',\n  financial: 'hub-poster/financial.webp',\n  beauty: 'hub-poster/beauty.webp',\n  fitness: 'hub-poster/fitness.webp',\n  services: 'hub-poster/services.webp',\n};" + s[end:])
print("HUB_PORTRAIT now lists 13 posters")

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

git add together-city-react/src/pages/HubLanding.tsx together-city-react/public/assets/img/hub-poster
git commit -m "$MARK

Thirteen posters, 853x1844 — the shape of a phone — commissioned for exactly
this screen and until now living only on the owner's desktop. They are webp
now (86 quality, 219-465 KB each, 4.5 MB for the set) and listed in
HUB_PORTRAIT, so a hub landing on a phone is its own poster, full bleed from
under the header to the bottom edge, with the hub's line set at its foot.

Nothing else changes. The fallback that showed a landscape building whole
stays for any hub that has no poster; the relief guard still checks every
listed file against public/assets/img, which is why this map was empty until
today. Verified at 390x844: the poster fills 390x790 and the buildings'
own signs read in full — TRAVEL HUB, FITNESS HUB — where the cropped
landscape art had been reading 'ESS HUB'."
git push
echo "LANDED."
