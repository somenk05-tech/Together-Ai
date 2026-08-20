#!/bin/bash
# land-chat-viewport-lock.sh — a chat is locked to the screen (10 Aug 2026).
# The open thread stops behaving like a web page: it cannot be pinched, it
# cannot be double-tapped bigger, the page under it cannot scroll, and the
# keyboard shortens the room instead of shoving the header off the top of it.
# Nothing is redesigned — measured at 428x926, the only pixel that moves is
# the composer's own type, and it has to (see the commit).
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="A chat is locked to the screen"
LOG=$(git log --oneline -80)
case "$LOG" in *"An open chat is the whole screen"*) ;; *)
  echo "Run land-chat-immersive.sh first (this layers on it)."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
W = 'together-city-react/'
R = W + 'src/'


def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)


P = R + 'features/chat/pages/Chats.tsx'
T = R + 'features/chat/components/MessageThread.tsx'
C = R + 'index.css'

# ── 1. the viewport tag learns that a keyboard is not a resize ────────────
patch(W + 'index.html',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />')

# ── 2. the room is fixed to the screen, at 1:1, and the keyboard cannot
#      move it ──────────────────────────────────────────────────────────────
patch(P,
  """  useEffect(() => {
    if (!(phone && activeId)) return;
    const root = document.documentElement;
    root.classList.add('tc-immersive');
    return () => root.classList.remove('tc-immersive');
  }, [phone, activeId]);""",
  """  useEffect(() => {
    if (!(phone && activeId)) return;
    const root = document.documentElement;
    root.classList.add('tc-immersive');

    /* THE KEYBOARD SHORTENS THE ROOM; IT DOES NOT PUSH IT.
       100dvh is the WINDOW, and iOS leaves the window the same height when the
       keyboard opens — the page simply scrolls underneath it, which is what
       threw the header off the top of the screen. visualViewport is the part
       you can actually see, so the room is sized from that and the composer
       stays put above the keys.
       It also knows where the visible part BEGINS. `position: fixed` is fixed
       to the LAYOUT viewport, and iOS scrolls the layout viewport upwards to
       reveal a focused input — so "fixed" quietly becomes "fixed somewhere
       above the screen". offsetTop is exactly how far it went; the room moves
       down by the same number and therefore does not appear to move at all. */
    const vv = window.visualViewport;
    const sync = () => {
      root.style.setProperty('--tc-vvh', `${vv ? vv.height : window.innerHeight}px`);
      root.style.setProperty('--tc-vvt', `${vv ? vv.offsetTop : 0}px`);
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    // wherever the page was scrolled to on the way in, the room starts at the top
    window.scrollTo(0, 0);

    /* AND IT STAYS AT 1:1.
       A messaging screen that pinches to 1.4x is a website: the header slides
       off, the composer parks under the keyboard, and the citizen has to pinch
       back before they can type a word. Three locks hold it, because no single
       one holds on both phones —
         · THE VIEWPORT TAG, rewritten while the thread is open and put back
           exactly as it was found on the way out. Android and the installed
           app honour maximum-scale, and because it is restored, the rest of
           the city keeps the zoom somebody may genuinely need;
         · TOUCH-ACTION, in the stylesheet, which is what refuses the pinch and
           the double tap in Chrome;
         · THE GESTURE EVENTS, which are what refuse them in SAFARI — iOS has
           ignored user-scalable since iOS 10 and answers to nothing else.
       None of them touches a one-finger drag, which is the only gesture this
       screen ever wanted. */
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const wasViewport = meta ? meta.getAttribute('content') : null;
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
    const noGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', noGesture, { passive: false });
    document.addEventListener('gesturechange', noGesture, { passive: false });
    document.addEventListener('gestureend', noGesture, { passive: false });
    /* Two fingers on the glass is a pinch, and there is nothing in a thread
       that two fingers do. One finger is a scroll and is never interrupted. */
    const noPinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('touchmove', noPinch, { passive: false });

    return () => {
      root.classList.remove('tc-immersive');
      root.style.removeProperty('--tc-vvh');
      root.style.removeProperty('--tc-vvt');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      if (meta && wasViewport !== null) meta.setAttribute('content', wasViewport);
      document.removeEventListener('gesturestart', noGesture);
      document.removeEventListener('gesturechange', noGesture);
      document.removeEventListener('gestureend', noGesture);
      document.removeEventListener('touchmove', noPinch);
    };
  }, [phone, activeId]);""")

# the room is as tall as the part of the screen you can see, not as tall as
# the window the keyboard is covering half of
patch(P,
  "          ? (activeId ? '100dvh' : 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 24px)')",
  "          ? (activeId ? 'var(--tc-vvh, 100dvh)' : 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 24px)')")

# ── 3. the list scrolls itself, not the page under it ─────────────────────
patch(T,
  "  const end = useRef<HTMLDivElement>(null);",
  "  const box = useRef<HTMLDivElement>(null);")
patch(T,
  "  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, typing]);",
  """  /* THE LIST SCROLLS ITSELF.
     scrollIntoView asks EVERY scrollable ancestor to move, and on a phone the
     outermost one is the page beneath a fixed room — so a message arriving
     could slide the whole screen while it was politely bringing the newest
     bubble into view. This moves one box, and it is this one. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);""")
patch(T, '    <div className="csmsgs">', '    <div className="csmsgs" ref={box}>')
patch(T, "      <div ref={end} />\n", "")

# ── 4. the stylesheet: one scroller, no scaling, nothing that can shift ────
patch(C,
  "html.tc-immersive .cstage { border-radius: 0; box-shadow: none; }",
  """/* Fixed, not flowing: a room does not scroll away when the keyboard opens. */
html.tc-immersive, html.tc-immersive body {
  overflow: hidden; height: 100%; width: 100%; overscroll-behavior: none;
  /* PAN-Y IS THE ENTIRE GESTURE VOCABULARY OF A THREAD: it goes up and it
     goes down. A browser refuses anything not named here, and what is not
     named here is pinch-zoom and double-tap-zoom — the two ways this screen
     was being scaled out from under its own header. `manipulation` would not
     have done it: it drops the double tap and KEEPS the pinch. */
  touch-action: pan-y;
  /* and a phone stops inflating type it has decided is too small, which is
     its own quiet kind of zoom and moves everything below it */
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
html.tc-immersive .cstage {
  position: fixed; top: var(--tc-vvt, 0px); left: 0; right: 0;
  border-radius: 0; box-shadow: none;
  /* one column, one row, and the row is the room: the thread gets the stage's
     exact height rather than sizing itself to its own messages, which is what
     lets the composer sit ON the bottom instead of after the last bubble */
  grid-template-rows: minmax(0, 1fr);
}
/* THE ONLY THING IN THE ROOM THAT SCROLLS. The header and the composer are
   its two fixed rows; the messages are its floor. `contain` keeps the bounce
   at the end of the list inside the list rather than handing it up to the
   page, which is the other way the screen used to shift. */
html.tc-immersive .csmsgs {
  overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
}
/* Neither row gives up a pixel to a long message or a two-line name. */
html.tc-immersive .cshead-t, html.tc-immersive .cscomposer { flex: 0 0 auto; }
/* 16px, and not a tenth less: mobile Safari zooms the page into any focused
   input under 16px, which is the jump felt when tapping the composer. The
   capsule keeps its size; only the type grows a hair. */
html.tc-immersive .cscomposer input:not([type="checkbox"]):not([type="radio"]):not([type="range"]) {
  font-size: 16px;
}""")

print("patched index.css (viewport lock)")

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

git add together-city-react/index.html \
        together-city-react/src/features/chat/pages/Chats.tsx \
        together-city-react/src/features/chat/components/MessageThread.tsx \
        together-city-react/src/index.css
git commit -m "$MARK

The room was already the whole screen. It was not fixed TO it: two fingers
scaled it, a double tap scaled it again, the page underneath still had
somewhere to go, and an arriving message could drag the header off the top —
measured at 428x926, eighteen pixels of it, which is exactly what a thread
looks like when it is a web page wearing a messaging app's clothes.

Three locks hold the scale at 1:1, because no single one holds on both
phones. The viewport tag is rewritten while a thread is open and put back
exactly as it was found on the way out, so Android and the installed app
refuse to scale while the rest of the city keeps the zoom somebody may
genuinely need. touch-action: pan-y gives the room its entire gesture
vocabulary — it goes up and it goes down — and a browser refuses what is not
named, which is the pinch and the double tap. And the gesture events are what
refuse them in Safari, which has ignored user-scalable since iOS 10 and
answers to nothing else.

Then the two ways it still moved. visualViewport is the part of the screen
you can actually see: the room is sized from its height, and offset by its
top, because 'fixed' is fixed to the LAYOUT viewport and iOS scrolls that
upwards to reveal a focused input. And the message list scrolls itself —
scrollIntoView asks every scrollable ancestor to move, which is where those
eighteen pixels came from.

One thing does change, and it is not a preference. The composer's type goes
from 14.5px to 16px, and only inside an open thread: mobile Safari zooms the
page into any focused input under 16px, ignores every instruction not to, and
that zoom is the thing this commit exists to stop. The capsule keeps its
size; only the type grows a hair and a half.

Everything else is measured identical. At 428x926, 414x896, 390x844 and
360x740: header at 0, composer on the safe area, no horizontal overflow,
window.scrollBy moves nothing, the list is the only thing that scrolls, the
composer taking focus shifts neither row, and the viewport tag comes back
byte-identical on Back."
git push
echo "LANDED."
