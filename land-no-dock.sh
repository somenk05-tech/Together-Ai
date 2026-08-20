#!/bin/bash
# land-no-dock.sh — the bottom bar leaves the phone (10 Aug 2026).
# Home · Hubs · Chats · Alerts · Profile came off the foot of every mobile
# screen. Navigation keeps every door it had: the burger opens the city (Home
# and all fourteen hubs) and the header carries mail, chats, alerts and the
# profile. Every screen that had been holding room for the bar takes it back.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The bottom bar leaves the phone"
LOG=$(git log --oneline -60)
case "$LOG" in *"The burger opens the city"*) ;; *)
  echo "Run land-city-drawer.sh first — the drawer is what replaces the bar."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

# 1. the dock stops being rendered
patch(R + 'layouts/Header.tsx', "      <BottomNav />\n", "")
patch(R + 'layouts/Header.tsx', "import { BottomNav } from '@/components/BottomNav';\n", "")

# 2. the poster walk stops reserving room for it
patch(R + 'index.css',
  "  div.hubs-feed { height: calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px); }",
  "  div.hubs-feed { height: calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 16px); }")

# 3. and so does the chat list (its height is an inline style)
patch(R + 'features/chat/pages/Chats.tsx',
  "'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px)'",
  "'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 24px)'")

# 4. the poster reclaims the foot
css_path = R + 'index.css'
css_now = open(css_path, encoding='utf-8').read()
assert 'The dock is gone' not in css_now, 'block already present'
open(css_path, 'w', encoding='utf-8').write(css_now + "\n" + '/* ---- The dock is gone; the screens take the room back (10 Aug) ----\n   Three places reserved space for the bottom bar. With no bar to clear, the\n   reservation is just a strip of nothing at the foot of a phone. */\n@media (max-width: 899px) {\n  .hposter { height: calc(100dvh - var(--header-h) - var(--safe-top)); }\n  .hposter-foot { padding-bottom: calc(var(--safe-bottom) + 34px); }\n}\n')
print("patched index.css (rooms take the space back)")

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

git add together-city-react/src/layouts/Header.tsx \
        together-city-react/src/index.css \
        together-city-react/src/features/chat/pages/Chats.tsx
git commit -m "$MARK

The dock is off every mobile screen. It was five labels laid across the foot
of a city built out of photographs — and on a hub landing that foot is
exactly where the hub's own line and its door are.

NOTHING LOSES ITS DOOR. The burger opens the whole city (Home and all
fourteen hubs, with their lines) and the header keeps mail, chats, alerts and
the profile — which is why this waits on 'The burger opens the city': before
that commit the burger was a handle wired to nothing, and removing the bar
would have taken the only way to the hubs with it.

Three places had been holding room for a bar that is no longer there: the
poster walk's height, the chat list's height, and the body padding that
`body:has(.tc-bottomnav)` applied — the last resolves itself the moment the
element stops rendering, which is the nicest thing about having written it
as :has. The hub poster now runs the full height under the header.

BottomNav.tsx stays on disk unrendered. nav-audit reads route references out
of it, and deleting the file in the same commit that removes its call site
would be two changes wearing one hat; it can go on its own, once, when
somebody checks what else those references were holding up. Gates green:
nav-audit clean at 176 routes, a11y and dead-export at their ceilings."
git push
echo "LANDED."
