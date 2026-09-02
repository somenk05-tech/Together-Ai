import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/api';
import type { Snap } from '@/types';

/**
 * ── A PHOTO THAT DOES NOT STAY: THE RECEIVING END ───────────────────────────
 *
 * A sealed tile that says what it is and what opening it will cost, and then a
 * full-screen viewer that spends the view.
 *
 * ── NOTHING IS FETCHED UNTIL SOMEBODY CHOOSES TO ───────────────────────────
 *
 * Every other picture in this app is an `<img src>` and the browser fetches it
 * whenever it likes — on scroll, on prefetch, on a preview card. That is the
 * one behaviour a view-once photograph cannot have, because the fetch IS the
 * view: the server spends it in the same request that serves the bytes. So
 * there is no src on this tile, no thumbnail behind the seal (the server
 * refuses to store one, for the same reason), and the only thing that reaches
 * the network is a tap.
 *
 * ── AND WHAT IS FETCHED IS A BLOB, HELD IN THIS TAB ────────────────────────
 *
 * `createObjectURL` gives the `<img>` an address that exists in this page's
 * memory and dies with `revokeObjectURL` — which is the only kind of address a
 * temporary photograph should have. The response carries `no-store`, so the
 * browser keeps nothing; closing the viewer releases the blob; and for a View
 * Once there is nothing left to ask for, because the server has already spent
 * the budget and, once every recipient has, deleted the object.
 *
 * ── WHAT THIS DOES NOT DO, AND WILL NOT PRETEND TO ─────────────────────────
 *
 * IT CANNOT TELL YOU SOMEBODY SCREENSHOTTED IT. No browser exposes that: there
 * is no screenshot event, `visibilitychange` fires when somebody switches tabs,
 * and a PrintScreen keydown is not raised by the tools people actually use.
 * Every heuristic available here would miss the real cases and fire on the
 * innocent ones, which does not produce a weaker warning — it produces a
 * warning nobody believes, which is worse than silence. So the web app says
 * nothing, and the notice below is drawn only when a NATIVE shell has reported
 * one through `POST /messages/:id/snap/screenshot`.
 *
 * The other honest limit, stated on the tile itself: nothing here can stop a
 * second phone being pointed at the screen. Ephemerality is a promise about
 * what this app keeps, not about what a room contains.
 */

const MODE_WORD: Record<Snap['mode'], string> = {
  once: 'View once',
  twice: 'View twice',
  day: '24 hours',
  keep: 'Yours to keep',
};

/** "in 4 hours", "in 20 minutes", "any moment now". Coarse on purpose: a
 *  second-by-second countdown on a photograph is a stopwatch nobody asked to
 *  race, and the exact moment is not a promise worth making to the minute. */
function until(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  if (h >= 24) return `in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
  if (h >= 1) return `in ${h} hour${h === 1 ? '' : 's'}`;
  const m = Math.max(1, Math.round(ms / 60_000));
  return `in ${m} minute${m === 1 ? '' : 's'}`;
}

export function SnapBubble({ messageId, conversationId, snap, mine, inert }: {
  messageId: string;
  conversationId: string;
  snap: Snap;
  mine: boolean;
  /** The spotlight's copy of a pressed message: a picture of the tile with
   *  nothing to press. Opening a snap from a copy of it would spend a view
   *  from a long-press, which is not a gesture anybody means as "open". */
  inert?: boolean;
}) {
  const qc = useQueryClient();
  /* IT RE-READS ITSELF RATHER THAN TAKING A CALLBACK. What changed is one
     row, what has to happen is one refetch, and the alternative is threading a
     handler through MessageBody, MessageThread and Chats so that three
     components can forward something none of them has an opinion about.
     Re-read after every open, every keep, and every REFUSAL — a refusal
     usually means the row moved under us (it expired, or another member spent
     the last view), so the stale tile is exactly what needs replacing. */
  const onChanged = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] });
  }, [qc, conversationId]);
  const [open, setOpen] = useState<string | null>(null);   // object URL while viewing
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setOpen(null);
  }, []);
  useEffect(() => release, [release]);

  const spent = snap.gone || (snap.viewsLeft != null && snap.viewsLeft <= 0);
  const expiredAt = until(snap.expiresAt);

  const view = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await chatApi.openSnap(messageId);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setOpen(url);
      // The view is spent whether or not this component lives long enough to
      // say so, so the thread is told immediately rather than on close.
      onChanged();
    } catch {
      setError('That photo is no longer there.');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    setBusy(true);
    try { await chatApi.keepSnap(messageId); } catch { setError('That photo could not be kept.'); }
    finally { setBusy(false); onChanged(); }
  };

  /* THE SENDER'S SIDE IS A RECEIPT, NOT A DOOR. They took the photograph; what
     they need from this row is what became of it. Re-opening is not offered —
     WhatsApp's rule, and the strict reading of "one view": a second way in is
     a second way for a view-once to be viewed twice. */
  if (mine) {
    return (
      <div className={`csb me cssnap-card${spent ? ' spent' : ''}`}>
        <span className="cssnap-seal" aria-hidden>📸</span>
        <span className="cssnap-lines">
          <span className="cssnap-title">
            {snap.live ? 'Live Snap' : 'Snap'} · {MODE_WORD[snap.mode]}
          </span>
          <span className="cssnap-sub">
            {snap.keptAt ? 'Kept in the chat'
              : snap.gone ? 'No longer available'
                : snap.openedAt ? 'Opened'
                  : expiredAt ? `Unopened · goes ${expiredAt}`
                    : 'Sent'}
          </span>
          {snap.shotAt && <span className="cssnap-sub">They took a screenshot.</span>}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={`csb cssnap-card${spent && !snap.keptAt ? ' spent' : ''}`}>
        <span className="cssnap-seal" aria-hidden>{spent && !snap.keptAt ? '🚫' : '📸'}</span>
        <span className="cssnap-lines">
          <span className="cssnap-title">
            {snap.live ? 'Live Snap' : 'Snap'} · {MODE_WORD[snap.mode]}
          </span>
          {snap.keptAt ? (
            <span className="cssnap-sub">Kept — it stays here.</span>
          ) : spent ? (
            <span className="cssnap-sub">This one is gone.</span>
          ) : (
            <span className="cssnap-sub">
              {snap.viewsLeft != null
                ? `${snap.viewsLeft} view${snap.viewsLeft === 1 ? '' : 's'} left`
                : expiredAt ? `Open as often as you like · goes ${expiredAt}` : 'Open it'}
            </span>
          )}
          {snap.live && (
            /* "Taken in the app" and NOT "verified". The app captured it from
               a camera rather than a gallery; nothing here can prove where the
               bytes came from, and a badge that overclaims is worse than none. */
            <span className="cssnap-sub">Taken in the app, not chosen from a gallery.</span>
          )}
          {error && <span className="cssnap-sub" role="alert">{error}</span>}
        </span>
        {(!spent || snap.keptAt) && !inert && (
          <button type="button" className="cssnap-open" onClick={() => void view()} disabled={busy}
            aria-label={snap.viewsLeft === 1 ? 'Open this photo — this is your last view' : 'Open this photo'}>
            {busy ? '…' : 'Open'}
          </button>
        )}
      </div>
      {snap.mode === 'keep' && !snap.keptAt && !spent && !inert && (
        <button type="button" className="cssnap-keep" onClick={() => void keep()} disabled={busy}>
          Keep it in the chat
        </button>
      )}

      {open && createPortal(
        <>
          <button type="button" className="cssheet-scrim" aria-label="Close the photo" onClick={release} />
          <div className="cssnap-viewer" role="dialog" aria-modal="true" aria-label="A temporary photo">
            <img src={open} alt="A photo sent to you" />
            <p className="cssnap-viewer-note">
              {snap.viewsLeft === 1 && snap.mode !== 'keep' && snap.mode !== 'day'
                ? 'This was your last view.'
                : 'Nothing here can stop a photograph of a screen.'}
            </p>
            <button type="button" className="btn" onClick={release}>Close</button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
