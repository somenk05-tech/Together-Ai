#!/bin/bash
# land-city-grid-foot.sh — the city grid moves to the foot (10 Aug 2026).
#   · "Enter your city" goes on phones — a key into a room you are standing in.
#   · the twelve-tile city grid moves from the TOP of the page to the END, and
#     becomes six across, two down.
#   · "Continue where you left off" follows it, instead of greeting a citizen
#     before they have seen the city.
# Desktop is untouched: it keeps the key, keeps the shelf at the top, and never
# rendered this grid at all (it has the panorama).
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The city grid moves to the foot"
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
P = R + 'pages/Home.tsx'

# 1. the page learns it is on a phone
patch(P,
  "export function Home() {\n  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));",
  "export function Home() {\n  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));\n  /* The page reads differently on a phone: no key into a city you are already\n     standing in, the city grid at the foot, and the resume shelf after it. */\n  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;")

# 2. no key into a room you are standing in
patch(P,
  """            {authed ? (
              <Link className="btn btn-gold" to="/dashboard">Enter your city</Link>
            ) : (""",
  """            {authed ? (
              /* A citizen who is signed in is already inside; the key is for a
                 desk, where the hero is a poster you look at rather than a
                 page you have walked into. */
              phone ? null : <Link className="btn btn-gold" to="/dashboard">Enter your city</Link>
            ) : (""")

# 3. the grid leaves the top of the page
patch(P,
  """      {/* mobile fallback grid */}
      <div className="cityfallback">
        {FALLBACK.map((p) => (
          <Link key={p.to} to={p.to}><img loading="lazy" src={img(p.img)} alt="" /><span>{p.title}</span></Link>
        ))}
      </div>

""", "")

# 4. the resume shelf leaves the top too
patch(P, "        <RecentPanel />", "        {!phone && <RecentPanel />}")

# 5. and both arrive at the foot, in that order
patch(P,
  """      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>""",
  '      {/* THE CITY GRID, AT THE FOOT. It used to sit at the top of a phone,\n          above the welcome — twelve doors before a word of introduction. It is\n          the same twelve tiles and the same markup; only the place and the\n          shape changed (six across, two down; see index.css). */}\n      <div className="cityfallback">\n        {FALLBACK.map((p) => (\n          <Link key={p.to} to={p.to}><img loading="lazy" src={img(p.img)} alt="" /><span>{p.title}</span></Link>\n        ))}\n      </div>\n\n      {/* On a phone the resume shelf sits here, at the end: \'continue where you\n          left off\' is the last thing you want offered, not the first thing in\n          front of a city you have not looked at yet. */}\n      {phone && <div className="wrap" style={{ maxWidth: 1240, margin: \'0 auto\', padding: \'8px 20px 0\' }}><RecentPanel /></div>}\n\n' + """      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>""")

# 6. six across, two down
patch(R + 'index.css', '  .cityfallback { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 24px 20px 8px; }\n  .cityfallback a { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; display: flex; align-items: flex-end; color: var(--on-accent); font-size: 12px; letter-spacing: .1em; font-weight: 600; text-transform: uppercase; }', '  /* SIX ACROSS, TWO DOWN, at the foot of the page. Twelve doors at a glance\n     for the reader who reached the end — the two-column version of this grid\n     used to OPEN the page instead, which put the whole city in front of\n     somebody before the city had introduced itself.\n     A tile is 56px here, so the name is a small label on a heavier scrim: at\n     this size the picture is the recognition and the word is the confirmation. */\n  .cityfallback { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; padding: 8px 12px 4px; }\n  .cityfallback a { position: relative; border-radius: 10px; overflow: hidden; aspect-ratio: 1/1; display: block; color: var(--on-accent); font-size: 12px; letter-spacing: .1em; font-weight: 600; text-transform: uppercase; }')
patch(R + 'index.css', '  .cityfallback a span { position: relative; z-index: 2; padding: 10px 12px; background: linear-gradient(to top, rgba(0,0,0,.7), transparent); width: 100%; }', '  .cityfallback a span {\n    position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;\n    padding: 14px 3px 3px; background: linear-gradient(to top, rgba(0,0,0,.82), transparent);\n    font-size: 6.5px; letter-spacing: .02em; line-height: 1.15; text-align: center;\n    overflow-wrap: anywhere;\n  }')

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

git add together-city-react/src/pages/Home.tsx together-city-react/src/index.css
git commit -m "$MARK

A phone opened on twelve doors. Above the welcome, above the sentence that
says what this place is, was the whole city as a two-column grid — the
answer before the question. It is the same twelve tiles and the same markup;
only where they sit and how many fit a row changed.

They are at the FOOT now, six across and two down: an index for the reader
who walked the districts and wants the list at a glance. A tile is 56px, so
its name is a small label on a heavier scrim — at that size the picture is
the recognition and the word only confirms it.

'Continue where you left off' follows the grid rather than opening the page:
a resume shelf is the last thing worth offering, not the first thing in front
of a city nobody has looked at yet.

And 'Enter your city' goes, on phones only. It is a key into a room the
citizen is standing in. A desk keeps it, because there the hero is a poster
you look at rather than a page you have walked into — and a desk never saw
this grid at all; it has the panorama."
git push
echo "LANDED."
