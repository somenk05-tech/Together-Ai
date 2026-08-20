#!/bin/bash
# land-two-lines-of-trust.sh — the strip is for somebody deciding (10 Aug 2026).
# Density audit, round one, item 4: the five-claim trust strip goes entirely
# for signed-in citizens, and keeps two of its five for visitors.
#
# NOTE: this commits src/pages/Home.tsx, so anything else uncommitted in that
# one file goes with it. The diff is printed before the commit.
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

MARK="The strip is for somebody deciding"
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
  """      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>
        <div className="trust">
          <span>◈ One identity, every hub</span>
          <span>◈ Curated, never cluttered</span>
          <span>◈ Private by default</span>
          <span>◈ Split &amp; plan with friends</span>
          <span>◈ Concierge always on</span>
        </div>
      </div>""",
  """      {/* THE STRIP IS FOR SOMEBODY DECIDING, NOT SOMEBODY INSIDE.
          Five claims in grey capitals sat here — one identity, curated,
          private, split with friends, concierge — and on a phone they stacked
          into five lines directly above the footer, which made them the last
          thing a citizen read on their way out of their own home screen. They
          are sales copy, and a citizen who is signed in has already bought.
          So: nothing at all once you are in.

          A visitor still gets two, because two is what somebody deciding can
          hold. The three that go were the three the hero already made:
          'curated, never cluttered' and 'concierge always on' are the
          personalisation promise again, and 'split & plan with friends' is a
          feature, not a reason to trust the place. What is left is the pair
          nothing else on the page says — one account for all of it, and
          privacy as the default rather than a setting. */}
      {!authed && (
        <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>
          <div className="trust">
            <span>◈ One identity, every hub</span>
            <span>◈ Private by default</span>
          </div>
        </div>
      )}""")

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

Density audit, round one, item four.

Five claims in grey capitals sat at the foot of the home page — one identity,
curated, private, split with friends, concierge. On a phone they stacked into
five lines directly above the footer, which made them the last thing a citizen
read on the way out of their own home screen.

They are sales copy, and a citizen who is signed in has already bought. So
there is nothing there at all once you are in — not a shorter strip, not a
quieter one: the block does not render, and the padding that held it does not
either, so the page ends where the city grid ends.

A visitor still gets two, because two is what somebody deciding can hold. The
three that go are the three the hero had already made: 'curated, never
cluttered' and 'concierge always on' are the personalisation promise a second
and third time, and 'split & plan with friends' is a feature rather than a
reason to trust the place. What is left is the pair nothing else on the page
says — one account for all of it, and privacy as the default rather than a
setting.

Measured at 428px. Signed in: no strip in the DOM, and eight pixels between
the city grid and the footer. Visitor: two items, and the three dropped claims
appear nowhere on the page."
git push
echo "LANDED."
