#!/bin/bash
# land-city-drawer.sh — the burger opens the city (9 Aug 2026).
# On Home (and every page without a hub rail) the burger toggled a drawer
# that did not exist — a door handle wired to no door. Now it opens the
# CityDrawer: Home + all fourteen hubs, phone-only, reusing the .tc-side /
# .side-menu material wholesale. Hub drawers keep their rooms and gain
# Home + All hubs at the foot. Desktop untouched.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The burger opens the city"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
import os
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

# The drawer itself
assert not os.path.exists(R+'layouts/CityDrawer.tsx'), 'CityDrawer already exists'
open(R+'layouts/CityDrawer.tsx', 'w', encoding='utf-8').write('import { NavLink, useLocation } from \'react-router-dom\';\nimport { NAV, HUBS } from \'@/config/hubs\';\nimport { HUB_ICON } from \'@/nav/registry\';\nimport { Icon } from \'@/components/ui/Icon\';\nimport { useUiStore } from \'@/store/ui.store\';\n\n/**\n * The burger\'s drawer for every page that is NOT inside a hub. The button\n * rendered on Home and toggled `sidebarOpen` — and nothing anywhere read it:\n * a door handle wired to no door. This is the door: Home and all fourteen\n * hubs, the whole city from anywhere.\n *\n * Hub pages keep their own rail (Sidebar.tsx owns the drawer there, listing\n * the hub\'s rooms); this renders null inside a hub so one burger opens one\n * drawer. Phone-only by the same mount-time matchMedia the sign-in backdrop\n * and the poster walk use — on desktop `.tc-side` is a static flex column\n * and would wedge itself into pages that never asked for a sidebar.\n */\nexport function CityDrawer() {\n  const open = useUiStore((s) => s.sidebarOpen);\n  const toggle = useUiStore((s) => s.toggleSidebar);\n  const { pathname } = useLocation();\n  const phone = typeof window !== \'undefined\' && window.matchMedia(\'(max-width: 899px)\').matches;\n  const inHub = Object.values(HUBS).some(\n    (h) => pathname === h.backPath || pathname.startsWith(`${h.backPath}/`),\n  );\n  if (!phone || inHub) return null;\n  return (\n    <aside className={`tc-side${open ? \' open\' : \'\'}`}>\n      <div className="hubname">Together City</div>\n      <div className="hubtag">Every hub, one door.</div>\n      <nav className="side-menu" aria-label="The city">\n        <NavLink to="/" end onClick={() => toggle(false)}\n          className={({ isActive }) => (isActive ? \'active\' : undefined)}>\n          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>\n          <span><span className="l">Home</span><span className="s">Your Together City</span></span>\n        </NavLink>\n        {NAV.map((n) => (\n          <NavLink key={n.key} to={n.path} onClick={() => toggle(false)}\n            className={({ isActive }) => (isActive ? \'active\' : undefined)}>\n            <span className="n" aria-hidden><Icon name={HUB_ICON[n.key] ?? \'place\'} size={15} /></span>\n            <span><span className="l">{n.label}</span><span className="s">{HUBS[n.key]?.tag}</span></span>\n          </NavLink>\n        ))}\n      </nav>\n    </aside>\n  );\n}\n')
print("created layouts/CityDrawer.tsx")

patch(R+'layouts/AppShell.tsx',
  "import { NotificationToaster } from './NotificationToaster';",
  "import { NotificationToaster } from './NotificationToaster';\nimport { CityDrawer } from './CityDrawer';")

patch(R+'layouts/AppShell.tsx',
  """      <Header />
      <VerifyEmailBanner />
      <main className="tc-main" style={isChat ? { minHeight: 0, overflow: 'hidden' } : undefined}><Outlet /></main>""",
  """      <Header />
      <VerifyEmailBanner />
      <CityDrawer /> {/* the burger's door on pages without a hub rail */}
      <main className="tc-main" style={isChat ? { minHeight: 0, overflow: 'hidden' } : undefined}><Outlet /></main>""")

patch(R+'layouts/Sidebar.tsx',
  """import { NavLink, useNavigate } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';""",
  """import { NavLink, useNavigate } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';
import { Icon } from '@/components/ui/Icon';
import { useUiStore } from '@/store/ui.store';""")

patch(R+'layouts/Sidebar.tsx',
  """          </NavLink>
        ))}
      </nav>
    </aside>""",
  """          </NavLink>
        ))}
      </nav>
      {/* The way out is on the same door the way in was: Home, and the whole
          city, from any hub's drawer. */}
      <nav className="side-menu" aria-label="The city" style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 10 }}>
        <NavLink to="/" end onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>
          <span><span className="l">Home</span><span className="s">Your Together City</span></span>
        </NavLink>
        <NavLink to="/hubs" onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="place" size={15} /></span>
          <span><span className="l">All hubs</span><span className="s">The whole city, one screen</span></span>
        </NavLink>
      </nav>
    </aside>""")

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

git add together-city-react/src/layouts/CityDrawer.tsx together-city-react/src/layouts/AppShell.tsx together-city-react/src/layouts/Sidebar.tsx
git commit -m "$MARK

On Home the burger toggled sidebarOpen and nothing read it — a door handle
wired to no door (found when the owner asked why the home button shows
nothing). Pages without a hub rail now get the CityDrawer: Home and all
fourteen hubs with their taglines, the whole city from anywhere. It reuses
.tc-side and .side-menu wholesale (one material), renders phone-only via
the same mount-time matchMedia the sign-in backdrop uses, and yields to
the hub's own rail inside a hub — one burger, one drawer, always. Hub
drawers gain Home + All hubs at the foot, so the way out is on the same
door the way in was."
git push
echo "LANDED."
