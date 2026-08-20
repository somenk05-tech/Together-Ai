#!/bin/bash
# land-chat-immersive.sh — an open chat is the whole screen (9 Aug 2026).
# Opening a thread on a phone hides the city's header, dock and floating
# search: the conversation takes the entire screen with its own back arrow.
# The composer no longer zooms the page when tapped, and the keyboard shortens
# the room instead of shoving it up. Share cards stop overhanging the edge.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="An open chat is the whole screen"
LOG=$(git log --oneline -60)
case "$LOG" in *"A chat opens as its own screen"*) ;; *)
  echo "Run land-chat-one-room.sh first (this layers on it)."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

W = 'together-city-react/'
R = W + 'src/'
P = R + 'features/chat/pages/Chats.tsx'

# the viewport learns about keyboards
patch(W + 'index.html',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />')

# immersive + visual-viewport sync
patch(P, "  const history = useMessages(activeId);", "  /* AN OPEN CHAT IS THE WHOLE SCREEN (owner, 9 Aug).\n     A thread is a room you are inside, not a panel inside a website: the\n     city's header and its dock belong to the city, and while you are reading\n     one conversation they are two rows of chrome charging rent. The flag goes\n     on <html> rather than on this subtree because what it hides — header,\n     dock, the floating search — are all outside it. It is removed the moment\n     the thread closes or the page unmounts, so no other screen can inherit a\n     hidden header. */\n  useEffect(() => {\n    if (!(phone && activeId)) return;\n    const root = document.documentElement;\n    root.classList.add('tc-immersive');\n    /* THE KEYBOARD SHORTENS THE ROOM; IT DOES NOT PUSH IT.\n       100dvh is the window, and iOS leaves the window the same height when\n       the keyboard opens — the page simply scrolls under it, which is what\n       threw the header off the top of the owner's screen. visualViewport IS\n       the part you can actually see, so the stage is sized from that and the\n       composer stays put above the keys. The listener is removed with the\n       flag; nothing outside a thread pays for it. */\n    const vv = window.visualViewport;\n    const sync = () => {\n      root.style.setProperty('--tc-vvh', `${vv ? vv.height : window.innerHeight}px`);\n    };\n    sync();\n    vv?.addEventListener('resize', sync);\n    vv?.addEventListener('scroll', sync);\n    return () => {\n      root.classList.remove('tc-immersive');\n      root.style.removeProperty('--tc-vvh');\n      vv?.removeEventListener('resize', sync);\n      vv?.removeEventListener('scroll', sync);\n    };\n  }, [phone, activeId]);\n\n  const history = useMessages(activeId);")

patch(P,
  """        style={{ height: phone
          ? 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px)'
          : 'calc(100dvh - var(--header-h) - var(--safe-top) - 42px)' }}>""",
  """        style={{ height: phone
          ? (activeId ? 'var(--tc-vvh, 100dvh)' : 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px)')
          : 'calc(100dvh - var(--header-h) - var(--safe-top) - 42px)' }}>""")

patch(P,
  "      <div className={`cstage${phone ? (activeId ? ' is-thread' : ' is-list') : ''}`}",
  "      {/* `bleed` is the page grid's own hatch — .page > .bleed spans all\n          three columns, which is how a room touches both edges of a phone\n          without a negative margin fighting the gutter. */}\n      <div className={`cstage${phone ? (activeId ? ' is-thread bleed' : ' is-list') : ''}`}")

css_path = R + 'index.css'
css_now = open(css_path, encoding='utf-8').read()
assert 'tc-immersive' not in css_now, 'block already present'
open(css_path, 'w', encoding='utf-8').write(css_now + "\n" + '/* ---- An open chat is the whole screen (9 Aug) ----\n   The city\'s header, its dock and its floating search all live OUTSIDE the\n   chat page, so the flag that hides them lives on <html>. Chats.tsx sets it\n   only while a thread is open on a phone, and removes it on close and on\n   unmount — nothing else can inherit a hidden header. */\nhtml.tc-immersive .tc-header,\nhtml.tc-immersive .tc-bottomnav,\nhtml.tc-immersive .tc-footer,\nhtml.tc-immersive [aria-label^="Search — jump to anything"] { display: none; }\nhtml.tc-immersive .tc-main { padding-top: 0; }\nhtml.tc-immersive body { padding-bottom: 0; }\n/* Edge to edge. `.page` is a three-column grid — gutter, content, gutter —\n   so zeroing its padding changes nothing, because the gutters are COLUMNS.\n   The stage takes the grid\'s own `bleed` hatch (see Chats.tsx); all this has\n   to do is drop the block padding above and below it. */\nhtml.tc-immersive .tc-main > .page { padding-block: 0; }\n/* Fixed, not flowing: a room does not scroll away when the keyboard opens. */\nhtml.tc-immersive, html.tc-immersive body { overflow: hidden; height: 100%; overscroll-behavior: none; }\nhtml.tc-immersive .cstage {\n  position: fixed; inset: 0; border-radius: 0; box-shadow: none;\n}\n/* 16px, and not a tenth less: mobile Safari zooms the page into any focused\n   input under 16px, which is the jump the owner saw when tapping the\n   composer. The capsule keeps its size; only the type grows a hair. */\nhtml.tc-immersive .cscomposer input:not([type="checkbox"]):not([type="radio"]):not([type="range"]) {\n  font-size: 16px;\n}\n/* the notch, and room for the name under it */\nhtml.tc-immersive .cshead-t { padding-top: calc(var(--safe-top) + 16px); padding-bottom: 12px; }\nhtml.tc-immersive .cscomposer { margin-bottom: calc(var(--safe-bottom) + 14px); }\n\n@media (max-width: 899px) {\n  /* A share card is 280px wide; a row capped at 66% of a 390px screen is\n     257px, so every recipe and property card hung over the right edge. The\n     measure is a phone\'s, not a desk\'s. */\n  .csmsgs { padding: 14px 14px 6px; }\n  .csmsgs > div > .tc-msg-row { max-width: 86%; }\n  .cscomposer { margin: 0 12px 14px; }\n}\n\n/* ---- The thread reads like a messaging app (9 Aug) ----\n   Tighter than a page and quieter than one: a run of messages from the same\n   person is one attribution line and a stack of bubbles, the way WhatsApp\n   sets it, rather than a document with generous air between paragraphs. */\n@media (max-width: 899px) {\n  .csatt { margin: 10px 0 4px; font-size: 11px; }\n  .csb { padding: 9px 13px; font-size: 15px; line-height: 1.4; border-radius: var(--r-2); }\n  .csb + .csb { margin-top: 3px; }\n  .csday { margin: 2px 0 10px; }\n  .cshead-t b { font-size: 16px; }\n}\n')
print("patched index.css (immersive chat)")

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

git add together-city-react/src/features/chat/pages/Chats.tsx together-city-react/src/index.css together-city-react/index.html
git commit -m "$MARK

A thread already had the screen to itself; it was still wearing the city's
clothes, and it still behaved like a page. Three fixes, one room.

CHROME. Opening a thread on a phone hides the header, the bottom dock and the
floating search, and the stage runs edge to edge with its own back arrow. The
flag lives on <html>, because everything it hides is outside the chat
subtree, and it is removed on close and on unmount so no other screen can
inherit a hidden header. Edge to edge uses the page grid's own \`bleed\`
hatch — .page is gutter/content/gutter, so zeroing padding does nothing and a
negative margin would only fight it.

THE ZOOM. Mobile Safari zooms the whole page into any focused input under
16px, and the composer was 14.5 — tap it and the conversation jumped, taking
the header off the top of the screen. It is 16px inside a thread; the capsule
is unchanged.

THE KEYBOARD. 100dvh is the WINDOW, and iOS keeps the window the same height
when the keyboard opens: the page just scrolls underneath it. The stage is
sized from visualViewport instead and pinned \`position: fixed\`, so the
keyboard shortens the room rather than pushing it, and the header stays put.
Verified at 390x844: focusing the composer moves nothing — scrollY 0, header
top 0. The listener is torn down with the flag.

And the overflow in the owner's screenshot: a share card is 280px while a row
was capped at min(66%, 560px) — 257px on a 390px phone — so recipe and
property cards hung over the right edge. Rows take 86% on a phone, and the
thread's rhythm tightens to a messaging app's: closer runs, smaller radius,
16px type."
git push
echo "LANDED."
