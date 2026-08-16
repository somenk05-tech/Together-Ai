import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { MiraThread } from '@/features/chat/mira/MiraThread';

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
const HER_OWN_ROOMS = ['/chats', '/dating/chats', '/services/messages'];

export function MiraDock() {
  const { pathname } = useLocation();
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const [open, setOpen] = useState(false);
  // A navigation closes it: the citizen pressed a link — hers, or the page's
  // — and a panel that follows them to the next page is a panel they now have
  // to fight. The page context would be stale anyway.
  useEffect(() => { setOpen(false); }, [pathname]);
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
          <div className="mira-dock-panel" role="dialog" aria-label="Mira">
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
