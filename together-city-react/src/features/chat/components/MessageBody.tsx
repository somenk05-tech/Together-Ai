import { useState } from 'react';
import type { Message, MediaAttachment } from '@/types';
import { ShareCardView } from '../share';
import { SnapBubble } from './SnapBubble';

/**
 * ── WHAT A MESSAGE LOOKS LIKE, IN ONE PLACE ─────────────────────────────────
 *
 * The quotation it answers, the words, the attachments, the shared card, the
 * reactions under it and the small line of facts below that. Extracted from
 * MessageThread when the long-press overlay arrived, because the overlay draws
 * a COPY of the pressed message and a second hand-written version of a bubble
 * is a bubble that drifts: a new attachment kind, a change to how a quotation
 * is drawn, and the thing you press stops looking like the thing you pressed.
 *
 * `inert` is that copy. It renders the same picture with nothing to press —
 * the quotation is a div rather than a button, the reaction chips are spans —
 * because the overlay's copy sits under a scrim and two live sets of chips for
 * one message is two places to tap for one fact.
 */

const fmtSize = (n?: number): string =>
  !n ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtClock = (sec?: number): string =>
  typeof sec === 'number' && sec > 0
    ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
    : '';

/**
 * WHAT ARRIVED, RENDERED AS WHAT IT IS.
 *
 * A voice note is a player with its length on it; a photo is the photo; a file
 * is a row you can read the name and the weight of before deciding to open it.
 *
 * The audio element is the browser's own. A hand-drawn waveform here would be
 * a picture of a sound nobody has decoded — and the native player brings
 * keyboard control, scrubbing and the platform's own accessibility for free.
 */
function Attachment({ a, mine }: { a: MediaAttachment; mine: boolean }) {
  /* AN OBJECT THAT HAS EXPIRED OR MOVED IS STILL A FACT ABOUT THE MESSAGE.
     There was no `onError` anywhere in this feature, so a 404 rendered the
     browser's own broken-image glyph — the one picture in the app nobody
     chose. A sentence is not the photograph, but it is true. */
  /* TWO STEPS, NOT ONE. The <img> asks for the THUMBNAIL first, and a
     thumbnail that 404s says nothing about the original — declaring the
     message's photo gone because a derived file expired is a lie the reader
     cannot check. So the first failure falls back to the full picture and only
     the second gives up. The <img> is keyed on the src so the fallback is a
     fresh element and a fresh request, not a re-used one the browser has
     already decided about. */
  const [tried, setTried] = useState(0);
  const name = a.name ?? 'Attachment';
  const sub = [a.name ? fmtSize(a.sizeBytes) : '', fmtClock(a.durationSec)].filter(Boolean).join(' · ');

  if (a.kind === 'image') {
    const src = tried === 0 && a.thumbUrl ? a.thumbUrl : a.url;
    if (tried > (a.thumbUrl ? 1 : 0)) {
      return <div className={mine ? 'csb me csphoto-gone' : 'csb csphoto-gone'}>This photo is no longer available.</div>;
    }
    /* THE BUBBLE RESERVES ITS HEIGHT BEFORE THE BYTES ARRIVE.
       An <img> with no intrinsic size is 0px tall until it decodes, and the
       thread scrolls itself to the bottom on a new message — so the photo
       decoded a moment later and shoved the newest message below the fold.
       `width`/`height` come off the media row when the server knows them, and
       an exact ratio means the picture is never cropped to fit it. A row
       written before the server sent them gets a reserved box instead
       (`.csphoto-hold`), which is a guess about height rather than a guess
       about shape — the picture still lands at its own proportions.

       `alt` is the DESCRIPTION and the filename is the title: it read
       `alt={a.name}`, so a screen reader announced "IMG_4821.jpg". */
    const shape = a.width && a.height ? `${a.width} / ${a.height}` : undefined;
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className={shape ? 'csphoto' : 'csphoto csphoto-hold'}>
        <img key={src} src={src} alt="Shared photo" title={a.name} loading="lazy"
          onError={() => setTried((n) => n + 1)} style={shape ? { aspectRatio: shape } : undefined} />
      </a>
    );
  }
  if (a.kind === 'video') {
    return <video src={a.url} controls preload="metadata" style={{ maxWidth: 260, width: '100%', borderRadius: 'var(--r-2)', display: 'block' }} />;
  }
  if (a.kind === 'audio') {
    return (
      <div className={mine ? 'csb me' : 'csb'} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 232 }}>
        {/* No caption track: a voice note is speech nobody has transcribed, and
            an empty <track> would be a promise of subtitles that do not exist.
            The duration is stated below instead, and the native player brings
            the platform's own keyboard and screen-reader handling. */}
        <audio src={a.url} controls preload="metadata" style={{ width: '100%', height: 34 }} />
        <span style={{ fontSize: 11, opacity: .75 }}>
          Voice note{fmtClock(a.durationSec) ? ` · ${fmtClock(a.durationSec)}` : ''}
        </span>
      </div>
    );
  }
  /* NO `download` ATTRIBUTE. It was `download={a.name}`, and the href is a
     cross-origin R2 URL — the attribute is ignored outright on those, so the
     PDF opened in place of the thread instead of saving and the promise the
     markup made was never once kept. `target="_blank"` is the honest version
     of what actually happens; saving is the browser's own menu. */
  return (
    <a href={a.url} target="_blank" rel="noreferrer"
      className={mine ? 'csb me' : 'csb'}
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', maxWidth: 280 }}>
      <span aria-hidden style={{ fontSize: 20, flex: 'none' }}>📄</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, opacity: .75 }}>{sub}</span>}
      </span>
    </a>
  );
}

/** WhatsApp-style delivery ticks (shown on your own messages only). */
function Ticks({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  const read = status === 'READ';
  const double = status === 'DELIVERED' || status === 'READ';
  /* On the stage there is no info-blue to read against black. Read is the
     bright ink, delivered is the soft one. */
  const color = read ? 'var(--on-stage)' : 'var(--on-stage-faint)';
  return (
    <span aria-label={status.toLowerCase()} style={{ color, marginLeft: 4, letterSpacing: -2, fontSize: 12, fontWeight: 700 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

export function MessageBody({ m, mine, currentUserId, peerName, onJump, onReact, onAnswerLiveSnap, inert }: {
  m: Message;
  mine: boolean;
  currentUserId?: string;
  peerName?: string;
  onJump?: (messageId: string) => void;
  onReact?: (m: Message, emoji: string | null) => void;
  /** Somebody asked for a Live Snap and this reader said yes — the page opens
   *  the camera. Absent on the sender's side and on the spotlight's copy. */
  onAnswerLiveSnap?: () => void;
  /** A picture of the message rather than the message — see the file header. */
  inert?: boolean;
}) {
  const deleted = Boolean(m.deleted);
  const quote = m.replyTo;

  return (
    <>
      {deleted ? (
        <div className="csb gone">🚫 This message was deleted</div>
      ) : (
        <>
          {/* WHAT THIS ANSWERS, ABOVE WHAT IT SAYS. Tapping it goes to the
              original — which is the entire point of a quote and the thing a
              static blockquote fails to be. */}
          {quote && (inert ? (
            <div style={QUOTE}>
              <span style={QUOTE_WHO}>{quote.senderId === currentUserId ? 'You' : (peerName ?? 'Them')}</span>
              <span style={QUOTE_TEXT}>{quote.deleted ? 'This message was deleted' : (quote.body || 'Attachment')}</span>
            </div>
          ) : (
            <button type="button" onClick={() => onJump?.(quote.id)}
              aria-label="Go to the message this answers"
              style={{ ...QUOTE, border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', width: '100%' }}>
              <span style={QUOTE_WHO}>{quote.senderId === currentUserId ? 'You' : (peerName ?? 'Them')}</span>
              <span style={QUOTE_TEXT}>{quote.deleted ? 'This message was deleted' : (quote.body || 'Attachment')}</span>
            </button>
          ))}
          {m.body && <div className={mine ? 'csb me' : 'csb'}>{m.body}</div>}
          {(m.media ?? []).map((a, i) => (
            <div key={a.id} style={{ marginTop: m.body || i ? 6 : 0 }}>
              {/* A SNAP IS CHECKED FIRST AND NEVER REACHES `Attachment`. Its
                  `url` arrives empty by design — the server hands out no
                  address for a temporary photograph — so every branch below
                  would render a broken frame, and the image branch would render
                  it eagerly, which is the one thing that must not happen to a
                  picture whose fetch costs a view. */}
              {a.kind === 'snap' && a.snap
                ? <SnapBubble messageId={m.id} conversationId={m.conversationId}
                    snap={a.snap} mine={mine} inert={inert} />
                : <Attachment a={a} mine={mine} />}
            </div>
          ))}
          {/* ── "SEND ME A LIVE SNAP" ────────────────────────────────────
              A share card, because `shareJson` has carried rich cards since it
              was written and `kind` is an open string by design — so asking
              for a photograph cost no column, no migration and no new message
              shape. It is drawn here rather than in ShareCardView because it
              is the one card with a VERB on it: the generic renderer draws a
              picture and a deep link, and this needs a button that opens a
              camera. The asker sees what they sent; the person asked sees the
              way to answer. */}
          {m.share && (
            /* ONE WRAPPER, TWO CARDS. The gap above a card is the same fact
               whichever card it is, and writing the style object twice is two
               inline objects against a ceiling that counts them. */
            <div style={{ marginTop: m.body || (m.media ?? []).length ? 6 : 0 }}>
              {m.share.kind === 'live-snap-request' ? (
                <span className="csb cssnap-ask">
                  <span className="cssnap-seal" aria-hidden>📸</span>
                  <span className="cssnap-lines">
                    <span className="cssnap-title">{m.share.title}</span>
                    <span className="cssnap-sub">{m.share.subtitle}</span>
                  </span>
                  {!mine && !inert && onAnswerLiveSnap && (
                    <button type="button" className="cssnap-open" onClick={onAnswerLiveSnap}>Take one</button>
                  )}
                </span>
              ) : (
                <ShareCardView card={m.share} compact clickable={!inert} />
              )}
            </div>
          )}
        </>
      )}

      {/* WHAT THE ROOM ANSWERED. Under the bubble rather than over its corner:
          a chip laid on the bubble covers the last line of a short message, and
          every count in this app that hides a word has been a bug report.
          Tapping your own chip clears it, which is the only gesture people
          try. */}
      {!deleted && (m.reactions ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4,
          justifyContent: mine ? 'flex-end' : 'flex-start', maxWidth: 260 }}>
          {(m.reactions ?? []).map((r) => {
            const isMine = Boolean(currentUserId && r.userIds.includes(currentUserId));
            const cls = isMine ? 'tc-react mine' : 'tc-react';
            if (inert) {
              return (
                <span key={r.emoji} className={cls}>
                  <span aria-hidden>{r.emoji}</span>
                  <span aria-hidden>{r.userIds.length}</span>
                </span>
              );
            }
            return (
              <button key={r.emoji} type="button" className={cls}
                aria-pressed={isMine}
                aria-label={`${r.emoji} · ${r.userIds.length}${isMine ? ', including you — tap to remove yours' : ''}`}
                onClick={() => onReact?.(m, isMine ? null : r.emoji)}
                disabled={!onReact}>
                <span aria-hidden>{r.emoji}</span>
                <span aria-hidden>{r.userIds.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Only the facts the attribution line does not already carry: an edit,
          and how far a message of yours has got. */}
      {(m.edited || m.starred || (mine && !deleted && m.status)) && !deleted && (
        <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--on-stage-faint)' }}>
          {m.starred && <span aria-label="You kept this message" style={{ marginRight: 4 }}>★</span>}
          {m.edited && <span style={{ marginRight: 4 }}>edited</span>}
          {mine && <Ticks status={m.status} />}
        </div>
      )}
    </>
  );
}

const QUOTE: React.CSSProperties = {
  display: 'block', maxWidth: 320,
  background: 'var(--stage-tile)', borderLeft: '3px solid var(--on-stage-faint)',
  borderRadius: 'var(--r-1)', padding: '6px 10px', marginBottom: 4,
};
const QUOTE_WHO: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--on-stage-soft)',
};
const QUOTE_TEXT: React.CSSProperties = {
  display: 'block', fontSize: 12.5, color: 'var(--on-stage-faint)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
