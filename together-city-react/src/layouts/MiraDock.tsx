import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { MiraThread } from '@/features/chat/mira/MiraThread';
import { useVisualViewport } from '@/hooks/useVisualViewport';

/**
 * MIRA'S DOOR ON EVERY PAGE — her own mark, floating, and the chat pops up
 * over whatever the citizen is doing.
 *
 * She lived behind /chats, which is the right home for a conversation and the
 * wrong distance for "how does this page work?". The dock is the owner's ask
 * verbatim: the Mira logo, on every page, and a press opens her — with the
 * page she was opened over sent along, so "what is this?" means THIS.
 *
 * THE PANEL IS THE SAME THREAD, not a second Mira. It renders MiraThread —
 * same day store, same seed, same meter — so a conversation started from the
 * dock continues in /chats and back. Mounted only while open, so a closed
 * dock costs the page nothing and a signed-out visitor fetches nothing.
 *
 * NOT IN A ROOM THAT IS ALREADY A CONVERSATION. That rule was written for
 * /chats and applied only to /chats, so the floating mark went on appearing
 * over Dating chats and over the Local Services threads — and Dating chats
 * already carries her mark in its own header, which made two doors to the same
 * assistant on one screen. The list below is the rule, said once.
 *
 * Signed-in only: her thread is authenticated, and a door that opens onto a
 * sign-in error is worse than no door.
 */

/**
 * Rooms that are already a conversation. Two reasons, and both of them mean
 * the floating mark is noise rather than a shortcut: /chats and /dating/chats
 * carry her own door in the header, and the Local Services threads are
 * anonymous by design — a floating assistant over a room whose whole promise
 * is that nobody is watching is the wrong furniture.
 */
/**
 * And one room that is not a conversation at all: /investor is the platform
 * deck, read full-screen and screenshotted a slide at a time. A floating mark
 * over somebody's pitch is furniture in the photograph.
 */
const HER_OWN_ROOMS = ['/chats', '/dating/chats', '/services/messages', '/investor'];

export function MiraDock() {
  const { pathname } = useLocation();
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const [open, setOpen] = useState(false);
  // A navigation closes it: the citizen pressed a link — hers, or the page's
  // — and a panel that follows them to the next page is a panel they now have
  // to fight. The page context would be stale anyway.
  useEffect(() => { setOpen(false); }, [pathname]);
  /**
   * THE PANEL IS BOUND TO WHAT IS STILL ON SCREEN.
   *
   * Owner, 22 Aug, in Safari: tap the box to type and the conversation slides
   * up out of the panel, leaving the composer halfway down a card of empty
   * ground. Two iOS behaviours, one cause. The window does not get shorter
   * when the keyboard opens, so `78vh` still measures a viewport whose bottom
   * half is now behind a keyboard; and to put the caret where you can see it
   * iOS scrolls — the layout viewport, which a `position: fixed` panel is
   * pinned to, and the panel's own box, which it will scroll even though this
   * one is `overflow: hidden`.
   *
   * `--tc-vvh` and `--tc-vvt` are the answer the chat rooms already use. With
   * the panel sized and placed against the VISIBLE viewport, the composer is
   * above the keyboard before iOS looks, and there is nothing to scroll into
   * view.
   */
  useVisualViewport(open);

  /* AND THE BOX IS PUT BACK IF IT IS SCROLLED ANYWAY. Belt and braces, three
     lines: Safari sets scrollTop on an overflow:hidden element to reveal a
     caret, and once it has, nothing in the UI can scroll it back — there is no
     scrollbar on a hidden box. This is the displacement in the owner's
     screenshot, undone at the moment it happens. */
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const home = () => { if (el.scrollTop !== 0) el.scrollTop = 0; };
    el.addEventListener('scroll', home);
    return () => el.removeEventListener('scroll', home);
  }, [open]);

  // Escape closes it, like every popup in the city.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!authed || HER_OWN_ROOMS.some((room) => pathname.startsWith(room))) return null;

  return (
    <>
      {open && (
        <>
          {/* Transparent, like the drawer's scrim: a dismissal surface, not a
              redesign. A tap anywhere outside the panel puts her away. */}
          <button type="button" className="mira-dock-scrim" aria-label="Close Mira" onClick={() => setOpen(false)} />
          <div ref={panel} className="mira-dock-panel" role="dialog" aria-label="Mira">
            <div className="mira-dock-head">
              <MiraMark size={26} showWord={false} state="listening" />
              <span className="mira-dock-name">Mira</span>
              <button type="button" className="mira-dock-close" aria-label="Close Mira" onClick={() => setOpen(false)}>×</button>
            </div>
            <MiraThread about={pathname} />
          </div>
        </>
      )}
      {!open && (
        <button type="button" className="mira-fab" aria-label="Talk to Mira" title="Talk to Mira"
          onClick={() => setOpen(true)}>
          <MiraMark size={34} showWord={false} state="waiting" />
        </button>
      )}
    </>
  );
}
