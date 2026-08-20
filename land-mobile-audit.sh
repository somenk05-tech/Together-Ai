#!/bin/bash
# land-mobile-audit.sh — Mobile audit, P0 + P1 in one landing (9 Aug 2026).
# Supersedes land-mobile-audit-p0.sh (never run; now a stub).
#
#  P0: sign-in inputs 16px (iPhones stop auto-zooming) · /login opens the door
#      instead of 404ing · 44px targets on sign-in controls + footer links.
#  P1: burger + header CTAs 44px · sign-in video never downloads on phones
#      (poster instead) · tagline wraps balanced · 404 buttons stack on phones ·
#      Bookings table scrolls sideways · Press columns wear phone sizes.
#
# Placement notes that keep the guards honest:
#  - footer rules live WITH the footer's base rules under max-width:900px —
#    899px would be claimed by layout-claims-its-room's first-block regex, and
#    anything after .letter-sky touching .tc-footer is forbidden by
#    letter-surface.test.ts (it caught the first draft of this script).
set -euo pipefail
cd "$(dirname "$0")"

FILES="together-city-react/src/features/auth/pages/SignIn.tsx together-city-react/src/app/router.tsx together-city-react/src/styles/layout.css together-city-react/src/styles/relief.css together-city-react/src/index.css together-city-react/src/pages/NotFound.tsx together-city-react/src/features/travel/pages/Bookings.tsx"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="Mobile audit: every doorway fits a thumb"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

# ---- P0 ----
patch(R+'features/auth/pages/SignIn.tsx',
  "const inp: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', padding: '14px 0', fontSize: 15,",
  "const inp: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', padding: '14px 0', fontSize: 16,")

patch(R+'features/auth/pages/SignIn.tsx',
  ".signin-glass .lnkbtn { background: none; border: none; color: var(--gold-bright); font-weight: 700; cursor: pointer; font-family: inherit; font-size: inherit; }",
  ".signin-glass .lnkbtn { background: none; border: none; color: var(--gold-bright); font-weight: 700; cursor: pointer; font-family: inherit; font-size: inherit; min-height: 44px; }\n        .signin-glass button[aria-label='Show password'], .signin-glass button[aria-label='Hide password'] { min-width: 44px; min-height: 44px; }")

patch(R+'app/router.tsx',
  "{ path: '/signin', element: <Navigate to=\"/sign-in\" replace /> },",
  "{ path: '/signin', element: <Navigate to=\"/sign-in\" replace /> },\n  { path: '/login', element: <Navigate to=\"/sign-in\" replace /> },")

patch(R+'styles/layout.css',
  ".tc-footer nav a:hover { color: var(--ink); }",
  ".tc-footer nav a:hover { color: var(--ink); }\n/* Phones: the same links, every one an honest 44px thumb target (audit 9 Aug).\n   900px (not 899px) so the header guard's first-899px-block regex is untouched;\n   placed here with the footer's own rules -- the letter-surface guard forbids\n   anything after .letter-sky from touching site chrome, and it is right to. */\n@media (max-width: 900px) {\n  .tc-footer nav { gap: 4px 18px; }\n  .tc-footer nav a { display: inline-flex; align-items: center; min-height: 44px; }\n  .tc-footer { font-size: 14px; }\n}")

# ---- P1 ----
patch(R+'styles/layout.css',
  ".tc-burger { display: none; width: 34px; height: 34px;",
  ".tc-burger { display: none; width: 44px; height: 44px;")

patch(R+'features/auth/pages/SignIn.tsx',
  "      {/* Moving Together City backdrop behind the glass sign-in card. */}\n      <video autoPlay muted loop playsInline preload=\"auto\" poster=\"/assets/img/final-homepage.webp\"\n        aria-hidden=\"true\"\n        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>\n        <source src=\"/assets/video/together-city-loop.webm\" type=\"video/webm\" />\n        <source src=\"/assets/video/together-city-loop.mp4\" type=\"video/mp4\" />\n      </video>",
  "      {/* Moving Together City backdrop behind the glass sign-in card. A phone\n          gets the still poster instead: mounting the <video> would download the\n          loop over mobile data and burn battery for a backdrop nobody asked for.\n          Decided at mount -- rotating a phone never crosses 900px. */}\n      {window.matchMedia('(min-width: 900px)').matches ? (\n        <video autoPlay muted loop playsInline preload=\"auto\" poster=\"/assets/img/final-homepage.webp\"\n          aria-hidden=\"true\"\n          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>\n          <source src=\"/assets/video/together-city-loop.webm\" type=\"video/webm\" />\n          <source src=\"/assets/video/together-city-loop.mp4\" type=\"video/mp4\" />\n        </video>\n      ) : (\n        <div aria-hidden=\"true\" style={{ position: 'absolute', inset: 0, background: \"url('/assets/img/final-homepage.webp') center / cover no-repeat\", zIndex: 0 }} />\n      )}")

patch(R+'features/auth/pages/SignIn.tsx',
  ".signin-glass ::placeholder { color: rgba(255,255,255,.5); }",
  ".signin-glass ::placeholder { color: rgba(255,255,255,.5); }\n        .signin-glass p { text-wrap: balance; }")

patch(R+'pages/NotFound.tsx',
  "<div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>",
  "<div className=\"nf-actions\" style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>")

patch(R+'features/travel/pages/Bookings.tsx',
  "<table className=\"tc\">",
  "<div className=\"tablewrap\"><table className=\"tc\">")
patch(R+'features/travel/pages/Bookings.tsx',
  "</table>",
  "</table></div>")

patch(R+'styles/relief.css',
  "@media (max-width: 560px) { .social-grid { gap: 6px; } .social-tile { border-radius: var(--r-2); } }",
  "@media (max-width: 560px) { .social-grid { gap: 6px; } .social-tile { border-radius: var(--r-2); } }\n@media (max-width: 560px) {\n  /* The label keeps all five columns; they just wear phone sizes. */\n  .press-grid { grid-template-columns: minmax(0,1fr) 48px 36px 36px 36px; column-gap: 8px; }\n}")

s = open(R+'index.css', encoding='utf-8').read()
assert '.nf-actions' not in s, 'index.css block already present'
s += """
/* ---- Mobile audit P1 (9 Aug): thumb targets and phone stacking ---- */
.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tablewrap > table.tc { min-width: 560px; }
@media (max-width: 899px) {
  .tc-actionbar a, .tc-actions a { min-height: 44px; display: inline-flex; align-items: center; }
  .blk-head .more { display: inline-flex; align-items: center; min-height: 44px; }
}
@media (max-width: 560px) {
  .nf-actions { flex-direction: column; align-items: stretch; }
  .nf-actions .btn { width: 100%; }
}
"""
open(R+'index.css', 'w', encoding='utf-8').write(s)
print("patched index.css (EOF block)")
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

git add $FILES
git commit -m "$MARK

Rendered every public route at a real iPhone viewport and fixed what broke.

- Sign-in inputs 15 -> 16px: mobile Safari auto-zooms any focused input under
  16px, shoving the glass card around. Same look, no zoom.
- /login -> /sign-in. The URL people type was a 404 wearing a welcome mat.
- 44px thumb targets: burger, header CTAs, sign-in lnkbtns, the password eye,
  footer links, home's YOUR CITY TODAY. Visuals unchanged.
- The sign-in backdrop video no longer mounts under 900px -- phones render the
  poster still and never download the loop.
- 404's three buttons stack full-width under 560px instead of a lopsided
  pyramid; the tagline wraps as two balanced lines.
- Travel bookings table scrolls sideways in .tablewrap instead of crushing
  five columns into 390px; The Press keeps all five label columns at phone
  sizes (48/36px).

Guards: footer rules live beside the footer's base rules under 900px -- the
first draft appended them after .letter-sky and letter-surface.test.ts
rejected it, which is exactly what that guard is for."
git push
echo "LANDED."
