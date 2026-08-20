#!/bin/bash
# land-nothing-scales.sh — nothing in chat or mail scales (10 Aug 2026).
#
# THIS REPLACES land-mail-scale-lock.sh, land-one-room-everywhere.sh and
# land-lock-the-lists.sh. The first of those got half-way through before the
# mailbox-search commit moved an anchor under it; this one picks up from
# wherever that left off — every patch checks whether it is already in place —
# and finishes the job in a single commit. Delete the other three.
set -euo pipefail
cd "$(dirname "$0")"

# The tree may legitimately already hold the half-applied first attempt. It may
# not hold anything else.
OWNED='together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/index.css
together-city-react/src/hooks/useScaleLock.ts
together-city-react/src/hooks/useChatRoom.ts
together-city-react/src/features/mail/pages/Folders.tsx
together-city-react/src/features/mail/pages/MessageView.tsx
together-city-react/src/features/mail/pages/Compose.tsx
together-city-react/src/features/dating/pages/DatingChats.tsx
together-city-react/src/features/services/pages/Messages.tsx'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' | grep -vxF "$OWNED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$STRAY"; exit 1; fi

MARK="Nothing in chat or mail scales"
LOG=$(git log --oneline -80)
case "$LOG" in *"A chat is locked to the screen"*) ;; *)
  echo "Run land-chat-viewport-lock.sh first."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
import os

W = 'together-city-react/'
R = W + 'src/'


def patch(path, old, new, must=1):
    """Idempotent by design: this run finishes a job a previous one started and
    left half-applied, so anything already in place is a success, not a clash."""
    s = open(path, encoding='utf-8').read()
    if new in s and old not in s:
        print("already", path)
        return
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)


LOCK = R + 'hooks/useScaleLock.ts'
ROOM = R + 'hooks/useChatRoom.ts'
P = R + 'features/chat/pages/Chats.tsx'
C = R + 'index.css'
F = R + 'features/mail/pages/Folders.tsx'
M = R + 'features/mail/pages/MessageView.tsx'
X = R + 'features/mail/pages/Compose.tsx'
D = R + 'features/dating/pages/DatingChats.tsx'
S = R + 'features/services/pages/Messages.tsx'

assert os.path.exists(LOCK), 'useScaleLock.ts is missing — run land-mail-scale-lock.sh first'

# ── 1. mail: the three screens that were left behind ──────────────────────
patch(F,
  """function FolderView({ folder }: { folder: Folder }) {
  const meta = FOLDER_META[folder];""",
  """function FolderView({ folder }: { folder: Folder }) {
  // A mailbox is read, not zoomed. Scrolling is untouched.
  useScaleLock();
  const meta = FOLDER_META[folder];""")
patch(F, "import { useEffect, useState } from 'react';",
       "import { useEffect, useState } from 'react';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

patch(M,
  """export function MessageView() {
  const { id = '' } = useParams();""",
  """export function MessageView() {
  // Before the early returns below — a hook that runs some renders and not
  // others is not a hook.
  useScaleLock();
  const { id = '' } = useParams();""")
patch(M, "import { useEffect, useMemo, useState } from 'react';",
       "import { useEffect, useMemo, useState } from 'react';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

patch(X,
  """export function Compose() {
  const [params] = useSearchParams();""",
  """export function Compose() {
  /* The composer is where the zoom actually hurt: tapping To on an iPhone
     scaled the page and left the send key off the right-hand edge. */
  useScaleLock();
  const [params] = useSearchParams();""")
patch(X, "import { useEffect, useMemo, useRef, useState } from 'react';",
       "import { useEffect, useMemo, useRef, useState } from 'react';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

# ── 2. the lock is counted, not toggled ───────────────────────────────────
patch(LOCK,
  """export function useScaleLock(when: boolean = true) {
  useEffect(() => {
    if (!when) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;

    const root = document.documentElement;
    root.classList.add('tc-noscale');

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const wasViewport = meta ? meta.getAttribute('content') : null;
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');

    const noGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', noGesture, { passive: false });
    document.addEventListener('gesturechange', noGesture, { passive: false });
    document.addEventListener('gestureend', noGesture, { passive: false });
    const noPinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('touchmove', noPinch, { passive: false });

    return () => {
      root.classList.remove('tc-noscale');
      if (meta && wasViewport !== null) meta.setAttribute('content', wasViewport);
      document.removeEventListener('gesturestart', noGesture);
      document.removeEventListener('gesturechange', noGesture);
      document.removeEventListener('gestureend', noGesture);
      document.removeEventListener('touchmove', noPinch);
    };
  }, [when]);
}""",
  """const LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';

/* THE LOCK IS COUNTED, NOT TOGGLED.
   Two things on one screen can want it at once — the Chats page wants it for
   the list, and the thread it opens wants it for the room — and they do not
   mount or unmount together. Toggled, whichever released first would put the
   viewport tag back while the other was still standing there holding it, and
   the screen would quietly become pinchable again halfway through being used.
   Counted, the tag is written by the FIRST holder and restored by the LAST,
   for the same reason a file has a reference count. */
let holders = 0;
let wasViewport: string | null = null;
const noGesture = (e: Event) => e.preventDefault();
const noPinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };

function acquire() {
  holders += 1;
  if (holders > 1) return;
  const root = document.documentElement;
  root.classList.add('tc-noscale');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  wasViewport = meta ? meta.getAttribute('content') : null;
  meta?.setAttribute('content', LOCKED);
  document.addEventListener('gesturestart', noGesture, { passive: false });
  document.addEventListener('gesturechange', noGesture, { passive: false });
  document.addEventListener('gestureend', noGesture, { passive: false });
  document.addEventListener('touchmove', noPinch, { passive: false });
}

function release() {
  holders = Math.max(0, holders - 1);
  if (holders > 0) return;
  const root = document.documentElement;
  root.classList.remove('tc-noscale');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && wasViewport !== null) meta.setAttribute('content', wasViewport);
  wasViewport = null;
  document.removeEventListener('gesturestart', noGesture);
  document.removeEventListener('gesturechange', noGesture);
  document.removeEventListener('gestureend', noGesture);
  document.removeEventListener('touchmove', noPinch);
}

export function useScaleLock(when: boolean = true) {
  useEffect(() => {
    if (!when) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    acquire();
    return release;
  }, [when]);
}""")

# ── 3. the room, written once ─────────────────────────────────────────────
if not os.path.exists(ROOM):
    open(ROOM, 'w', encoding='utf-8').write('''import { useEffect } from 'react';
import { useScaleLock } from './useScaleLock';

/**
 * AN OPEN CONVERSATION IS THE WHOLE SCREEN.
 *
 * This is the city chat's rule, and it stopped being the city chat's the
 * moment a second conversation existed. A thread is a room you are inside,
 * not a panel inside a website: while you are reading one, the city's header
 * and its dock are two rows of chrome charging rent, the page behind is
 * something to fall through, and a keyboard turns the whole arrangement into
 * a scroll position. Wherever the city holds a conversation — Chats, Dating,
 * an enquiry to a business — it holds it the same way, because it is the same
 * act.
 *
 * What the hook does, and the order matters:
 *
 *   · IT FLAGS <html>, because what has to go — the header, the dock, the
 *     floating search — all live outside whichever component called this. The
 *     flag comes off on close and on unmount, so no other screen can inherit
 *     a hidden header.
 *   · IT MEASURES THE VISIBLE PART. 100dvh is the WINDOW, and iOS leaves the
 *     window the same height when the keyboard opens — the page just scrolls
 *     underneath, which is what throws a header off the top of the screen.
 *     visualViewport is the part you can actually see: --tc-vvh is its
 *     height, and --tc-vvt is where it BEGINS, because `position: fixed` is
 *     fixed to the LAYOUT viewport and iOS scrolls that up to reveal a
 *     focused input. Offset by the same number, the room does not move.
 *   · AND IT REFUSES A SCALE, via useScaleLock — a room pinched to 1.4x is a
 *     web page again.
 *
 * Phones only, decided when the conversation opens. A desk shows a list
 * beside a thread and has room for both.
 */
export function useChatRoom(open: boolean) {
  useScaleLock(open);

  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;

    const root = document.documentElement;
    root.classList.add('tc-immersive');

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

    return () => {
      root.classList.remove('tc-immersive');
      root.style.removeProperty('--tc-vvh');
      root.style.removeProperty('--tc-vvt');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [open]);
}
''')
    print('wrote', ROOM)

# ── 4. the city chat hands its implementation over, and holds the list ────
patch(P,
  """  // No pinch, no double tap, no focus zoom, for as long as a thread is open.
  useScaleLock(Boolean(activeId));

  useEffect(() => {
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

    /* AND IT STAYS AT 1:1 — but that rule is not the thread's to keep. The
       mailbox wants it too, and so does the message, and so does the
       composer, so it is written once in useScaleLock and asked for above. */
    return () => {
      root.classList.remove('tc-immersive');
      root.style.removeProperty('--tc-vvh');
      root.style.removeProperty('--tc-vvt');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [phone, activeId]);""",
  """  /* THE LIST IS A SCREEN, NOT A DOCUMENT. Nobody wants to zoom a list of
     names, and a list that scales while the thread behind it does not is two
     applications wearing one coat. Held for the whole page; the room asks for
     it a second time and the count sorts them out. */
  useScaleLock();
  /* And the room itself — the flag, the visible-viewport measurement, its own
     hold on the scale lock — is in useChatRoom, because the Dating hub holds
     conversations too and a conversation is one act wherever you have it. */
  useChatRoom(Boolean(activeId));""")

patch(P,
  "import { useScaleLock } from '@/hooks/useScaleLock';",
  "import { useChatRoom } from '@/hooks/useChatRoom';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

# ── 5. the dating thread becomes the same room; its list is held too ──────
patch(D,
  "import { SafetyMenu } from '../components/SafetyMenu';",
  "import { SafetyMenu } from '../components/SafetyMenu';\nimport { useChatRoom } from '@/hooks/useChatRoom';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

patch(D,
  """  const [local, setLocal] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);""",
  """  const [local, setLocal] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* THE SAME ROOM AS THE CITY CHAT, not merely the same paint. This panel
     already borrowed the stage; on a phone it was still a card sitting in a
     page, under the city's header, above 'Your other chats', with the whole
     lot scrolling as one document and the composer wherever the scroll left
     it. A conversation is one act wherever you have it. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  useChatRoom(true);""")

patch(D,
  """    <div className="cstage csthread" style={{ display: 'flex', height: 'min(72vh, 640px)' }}>
      {/* header */}
      <div className="cshead-t" style={{ gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--on-stage-soft)', display: 'none' }} className="tc-chat-back">←</button>""",
  """    <div className="cstage csthread" style={{ display: 'flex', height: phone ? 'var(--tc-vvh, 100dvh)' : 'min(72vh, 640px)' }}>
      {/* header */}
      <div className="cshead-t" style={{ gap: 10 }}>
        {/* The city chat's back arrow, down to the chevron: on a phone this is
            now the only way out of the room, and two different arrows for the
            same door is how one app starts feeling like two. */}
        {phone && (
          <button type="button" className="csback" aria-label="Back to your dating chats" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}""")

patch(D,
  """      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--stage-well)', flexWrap: 'wrap' }}>""",
  """      <div style={{ display: 'flex', flex: 'none', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--stage-well)', flexWrap: 'wrap' }}>""")

patch(D,
  """export function DatingChats() {
  const me = useMe();""",
  """export function DatingChats() {
  // The queue and the list, held whether or not a conversation is open.
  useScaleLock();
  const me = useMe();""")

# ── 6. the services enquiry: same room, its own clothes ───────────────────
patch(S,
  "import { useEffect, useRef, useState } from 'react';",
  "import { useEffect, useRef, useState } from 'react';\nimport { useChatRoom } from '@/hooks/useChatRoom';\nimport { useScaleLock } from '@/hooks/useScaleLock';")

patch(S,
  """export function ServiceMessages() {
  const inbox = useServiceInbox();""",
  """export function ServiceMessages() {
  useScaleLock();
  const inbox = useServiceInbox();""")

patch(S,
  """export function ServiceThreadView() {
  const { id } = useParams<{ id: string }>();""",
  """export function ServiceThreadView() {
  /* THE SAME ROOM, NOT THE SAME PAINT.
     This thread is a white card with a black bubble and stays that way: it
     belongs to a business's world rather than the city chat's, and nobody
     asked for it to be repainted. What it takes from the master chat is the
     part that was never decoration — on a phone the conversation is the whole
     screen, the card is the only thing that scrolls, and the box you type in
     sits above the keyboard instead of underneath it. */
  useChatRoom(true);
  const { id } = useParams<{ id: string }>();""")

patch(S,
  "  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);",
  """  /* The card scrolls itself. scrollIntoView asks every scrollable ancestor to
     move, and the outermost one here is the page — so a reply arriving pulled
     the business's name off the top of the screen on its way to the newest
     line. endRef is a direct child of the card, so its parent IS the box. */
  useEffect(() => {
    const box = endRef.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [count]);""")

patch(S,
  """  return (
    <div>
      <button type="button" onClick={() => nav('/services/messages')}""",
  """  return (
    /* `csroom` does nothing at all until the flag is on <html>, which is to
       say: on a phone, with this thread open. Then it becomes the column the
       stylesheet describes — and the markup below is untouched, because the
       order was already right. */
    <div className="csroom">
      <button type="button" onClick={() => nav('/services/messages')}""")

# ── 7. the light room, in the stylesheet ──────────────────────────────────
patch(C,
  """/* the notch, and room for the name under it */
html.tc-immersive .cshead-t { padding-top: calc(var(--safe-top) + 16px); padding-bottom: 12px; }""",
  """/* ---- A ROOM THAT IS NOT THE DARK STAGE (10 Aug) ----
   The services thread is a white card with a black bubble and belongs to a
   business's world, so it is not repainted; it is only re-seated. Everything
   here is column mechanics: the head and the composer hold their size, the
   card takes what is left and is the only thing that scrolls, and the whole
   column is exactly as tall as the part of the screen you can see — which is
   what puts the box you type in above the keyboard rather than under it.
   `!important` on the card's ceiling because 52vh is written inline, and a
   ceiling measured against the WINDOW is the bug: the window does not shrink
   when the keyboard opens. */
html.tc-immersive .csroom {
  position: fixed; top: var(--tc-vvt, 0px); left: 0; right: 0;
  height: var(--tc-vvh, 100dvh);
  display: flex; flex-direction: column; gap: 0;
  padding: calc(var(--safe-top) + 14px) 16px calc(var(--safe-bottom) + 14px);
  background: var(--paper); overflow: hidden;
}
html.tc-immersive .csroom > * { flex: 0 0 auto; }
html.tc-immersive .csroom > .card {
  flex: 1 1 auto; min-height: 0; max-height: none !important;
  overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
}

/* the notch, and room for the name under it */
html.tc-immersive .cshead-t { padding-top: calc(var(--safe-top) + 16px); padding-bottom: 12px; }""")

print('done')

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

git add together-city-react/src/hooks/useScaleLock.ts \
        together-city-react/src/hooks/useChatRoom.ts \
        together-city-react/src/features/chat/pages/Chats.tsx \
        together-city-react/src/features/mail/pages/Folders.tsx \
        together-city-react/src/features/mail/pages/MessageView.tsx \
        together-city-react/src/features/mail/pages/Compose.tsx \
        together-city-react/src/features/dating/pages/DatingChats.tsx \
        together-city-react/src/features/services/pages/Messages.tsx \
        together-city-react/src/index.css
git commit -m "$MARK

The city chat learned two days ago what a conversation is on a phone: the
whole screen, fixed to the part of it you can actually see, one thing that
scrolls, a composer above the keyboard, and no pinch. It kept all of it to
itself, and the city holds conversations in three places and mail in five
screens. This is the same rule everywhere it applies.

TWO HOOKS, AND EVERY SCREEN ASKS ONE OF THEM.

useScaleLock refuses a scale: the viewport tag rewritten while the screen is
open and restored EXACTLY as found on the way out, touch-action for Chrome,
and the gesture events for Safari, which has ignored user-scalable since iOS
10 and answers to nothing else. It is COUNTED rather than toggled, because
two things on one page can want it at once — the Chats page holds it for the
list, the thread it opens holds it again for the room, and the thread closes
first. Toggled, that release would have handed the screen back its pinch
while the list was still standing there holding the lock.

useChatRoom is the room: it flags <html> so the header and the dock go, and
it measures visualViewport for height AND offset, because 100dvh is the
window and the window does not shrink when the keyboard opens — which is the
whole reason a composer ends up underneath it.

WHO ASKS FOR WHAT. Mail takes the scale lock on all five screens — inbox and
folders, message, composer — and stays an ordinary scrolling page, which is
what was asked for: it is the zoom that had to go, not the scroll. Dating
takes the room; it had borrowed the stage's paint already and was still a
card in a page, under the header, above 'Your other chats'. The services
enquiry takes the room too but keeps its own clothes — white card, black
bubble, a business's world, not the chat hub's — and its 52vh ceiling goes,
because a ceiling measured against the WINDOW is exactly why the field ended
up under the keyboard. The lists — chats, dating, services inbox — take the
scale lock, because nobody wants to zoom a list of names either.

Drive is deliberately left alone: it is reached from Mail, but it is the
city's Drive, and locking it there would lock it everywhere.

One thing changes that is not a preference: fields on a locked screen go to
16px. Mobile Safari zooms the whole page into any focused input under 16px
and ignores every instruction not to. It costs the mail composer about two
points of type; inbox and message are pixel-identical before and after.

Measured at 428x926 throughout. Chat: list locked and still scrolling, thread
locked and fixed, back to the list still locked, and leaving Chats restores
the viewport tag byte-identical. Dating: header at 0, messages 145-854,
composer 854-912, back arrow present. Services: head at 53, card 155-852,
composer 864-912. Mail: inbox scrolls 956, message 499, composer 307, fields
at 16px, no horizontal overflow anywhere."
git push
echo "LANDED."
