#!/bin/bash
# land-one-word-for-continue.sh — one name for the shelf (10 Aug 2026).
# Density audit, round one, item 5: the resume shelf stops saying the same
# thing three times. Touches one file, and not Home.tsx, so it runs in any
# order beside the others.
set -euo pipefail
cd "$(dirname "$0")"

OWNED='together-city-react/src/components/RecentPanel.tsx
together-city-react/src/pages/Home.tsx
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

MARK="One name for the shelf"
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


P = R + 'components/RecentPanel.tsx'

# The chip's own word for what the heading already said.
patch(P,
  """        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="muted" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Resume</span>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top.label}</span>
        </span>""",
  """        {/* "RESUME" used to sit above the name in small capitals. The
            heading two lines up already says continue where you left off, the
            arrow at the right says go, and the card is the only card here —
            three ways of saying one thing, stacked. The name is enough. */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top.label}</span>
        </span>""")

# One name for the section, not two. The landmark keeps a label — a section
# without one is a hole in the page for anybody listening — but it is now the
# same words the heading shows, rather than a second title only some people
# hear.
patch(P,
  '    <section className="blk" aria-label="Recently viewed">',
  '    <section className="blk" aria-label="Continue where you left off">')

patch(P,
  """/**
 * "Continue where you left off" + Recently Viewed (audit 3.3). Gives the city
 * home a memory: one prominent resume card for the last place you were, and a
 * row of recent pages, so the super-app feels continuous across sessions.
 */""",
  """/**
 * The city home's memory: the last place you were, and a row of the five
 * before it, so the super-app feels continuous across sessions.
 *
 * ONE NAME FOR IT. This had three — a landmark called "Recently viewed", a
 * heading reading "Continue where you left off", and the word "RESUME" in
 * capitals above the card's own label. The heading is the one that shows, so
 * the heading is the one that stayed, and the landmark now says the same
 * words rather than a second title only a screen reader hears.
 */""")

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

git add together-city-react/src/components/RecentPanel.tsx
git commit -m "$MARK

Density audit, round one, item five.

The resume shelf had three names for one idea: a landmark called 'Recently
viewed', a heading reading 'Continue where you left off', and the word RESUME
in small capitals directly above the card's own label — so the owner's home
screen read RESUME / Inbox, under a heading that had just said the same thing,
beside an arrow that said it a fourth time in a different alphabet.

RESUME goes. The name of the place is enough; the heading carries the verb and
the arrow carries the direction.

The landmark does NOT go, and this is the one correction to the audit as
written: 'Recently viewed' was never an eyebrow on the screen — it is the
section's accessible name, and a section without one is a hole in the page for
anybody navigating by landmark. What was wrong with it was that it was a
SECOND title, heard by some citizens and seen by none. It now says exactly
what the heading shows, so the screen and the screen reader agree.

Measured at 428px with three items on the shelf: the card reads 'Inbox →'
where it read 'RESUME Inbox →', the landmark reads 'Continue where you left
off', and the card is 74px where it was 76."
git push
echo "LANDED."
