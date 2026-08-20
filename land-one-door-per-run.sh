#!/bin/bash
# land-one-door-per-run.sh — one door per run (10 Aug 2026).
# Density audit, round one, item 3: "Your city today →" leaves the head of the
# district run. The heading stays. Nothing else on the home page is touched.
#
# NOTE: this commits src/pages/Home.tsx, so anything else you have uncommitted
# in that one file goes in with it. The diff is printed before the commit so
# you can see exactly what is going.
set -euo pipefail
cd "$(dirname "$0")"

OWNED='together-city-react/src/pages/Home.tsx
together-city-react/src/features/mail/pages/Folders.tsx
together-city-react/src/index.css
together-city-react/src/app/mail-reads-on-a-phone.test.ts
together-city-react/public/assets/img/tc-icon-1024.png
together-city-react/public/assets/img/tc-icon-512.png
together-city-react/public/assets/img/tc-icon-192.png
together-city-react/public/assets/img/tc-icon-maskable-512.png
together-city-react/public/assets/img/apple-touch-icon-180.png
together-city-react/public/downloads/TogetherCity.apk
together-city-react/public/manifest.webmanifest'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' | grep -vxF "$OWNED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="One door per run"
case "$(git log --oneline -40)" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
W = 'together-city-react/'
R = W + 'src/'


def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    if new in s and old not in s:
        print("already", path)
        return
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)


patch(R + 'pages/Home.tsx',
  """        <div className="district-head">
          <div className="blk-head"><h2>Walk the districts</h2><Link className="more" to="/social/feed">Your city today →</Link></div>
        </div>""",
  """        <div className="district-head">
          {/* ONE DOOR PER RUN. "Your city today →" sat at the right-hand end of
              this line and went to the social feed, which is not a district —
              a second call to action, in the accent colour, competing with the
              thirteen photographs underneath it for the same thumb. The
              heading stays because it is the one label the run has. The feed
              keeps every other way in it already had. */}
          <div className="blk-head"><h2>Walk the districts</h2></div>
        </div>""")

print('done')

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

echo
echo "== what is about to be committed from Home.tsx =="
git --no-pager diff --stat together-city-react/src/pages/Home.tsx
echo

git add together-city-react/src/pages/Home.tsx
git commit -m "$MARK

Density audit, round one, item three.

At the head of the district run there were two calls to action on one line:
the heading, and 'Your city today →' at the right-hand end, set in the accent
colour and in capitals. It went to the social feed, which is not a district —
so the line invited a thumb somewhere else at the exact moment thirteen
photographs were inviting it in. The strongest link on a screen should not
point away from what the screen is for.

The heading stays; it is the one label this run has. The feed keeps every
other way in it already had — the dock, the drawer, the search, and its own
hub. `.more` is still used elsewhere, so no rule goes with it.

One line of copy. It is the cheapest of the twenty-eight the audit found, and
the only one that was also a navigational mistake."
git push
echo "LANDED."
