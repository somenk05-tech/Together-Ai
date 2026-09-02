import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mediaApi } from '@/api/media.api';
import { uploadErrorMessage } from '@/api/media.api';
import type { OutgoingAttachment } from '@/api';
import { SnapComposer, type SnapMode } from './SnapComposer';
import type { ShareCard } from '@/types';

/**
 * The composer is a capsule pressed into the stage, with one raised key — and
 * now two quiet ones: a paperclip and a microphone.
 *
 * NOTHING HERE IS NEW PLUMBING. The socket contract has always accepted
 * attachments (SocketSendSchema IS SendMessageSchema, which permits a message
 * with no text so long as it carries one), the Attachment table has always had
 * duration and size, and every upload in the city already goes through
 * mediaApi — the one place a photo's coordinates are stripped before the bytes
 * leave the browser. What was missing was a way to reach any of it.
 *
 * THE BYTES GO FIRST, THE MESSAGE SECOND. A message row that points at a file
 * still uploading is a message that renders as a broken link for as long as the
 * upload takes and forever if it fails. So the send waits, the composer says
 * what it is doing, and a failed upload leaves the text where it was typed.
 */

const MAX_BYTES = 50 * 1024 * 1024;   // matches policy.maxUploadBytes on the API

const fmtSize = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtClock = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** The first container the browser will actually record. Safari does not do
 *  audio/webm and Chrome did not do audio/mp4 until recently, so this asks
 *  rather than assuming — an empty string lets MediaRecorder pick its own. */
function pickMime(): string {
  const R = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!R?.isTypeSupported) return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (R.isTypeSupported(t)) return t;
  }
  return '';
}

/** The card a "send me a Live Snap" is. A share card rather than a new message
 *  shape: `shareJson` has carried rich cards since it was written, the kind is
 *  an open string by design, and this needed neither a column nor a migration
 *  to say one sentence with a button under it.
 *
 *  NOT EXPORTED, and that is not shyness: this file exports one component, and
 *  a second export from it costs a react-refresh warning in a repo whose lint
 *  ceiling is zero. MessageBody matches on the `kind` string, which is the
 *  contract either way. */
const LIVE_SNAP_REQUEST: ShareCard = {
  kind: 'live-snap-request',
  hub: 'chat',
  title: 'Send me a Live Snap',
  subtitle: 'Taken now, in the app — not from your gallery.',
};

export function Composer({ onSend, onTyping, replyTo, onCancelReply, seed, onShare, liveSnapAsked }: {
  onSend: (body: string, attachments?: OutgoingAttachment[]) => void;
  onTyping: (t: boolean) => void;
  /** The message being answered, if any — shown above the capsule so nobody
   *  sends a reply into the wrong thread of a conversation. */
  replyTo?: { name: string; body: string } | null;
  onCancelReply?: () => void;
  /** A suggestion PLACED, never sent (dating's conversation starters, 26 Aug):
   *  the text lands in the field, focused, theirs to edit or delete. `n` makes
   *  the same words placeable twice — a counter, not an id. */
  seed?: { text: string; n: number } | null;
  /** Sends a share card. Used for one thing here: asking for a Live Snap. */
  onShare?: (card: ShareCard) => void;
  /** Somebody asked YOU for a Live Snap, and this is the counter that says a
   *  new one arrived — the same shape as `seed` above, and for the same
   *  reason: the camera should open on the second ask as well as the first. */
  liveSnapAsked?: number;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recSec, setRecSec] = useState<number | null>(null);
  /* null = closed; otherwise the sheet is open, and `live` says whether the
     gallery route is drawn in it. */
  const [snapSheet, setSnapSheet] = useState<{ live: boolean } | null>(null);
  const [snapMenu, setSnapMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The seed arrives from outside the capsule; a change of `n` is a tap.
  useEffect(() => {
    if (seed?.text) { setBody(seed.text); inputRef.current?.focus(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- n IS the event
  }, [seed?.n]);
  // A request arriving from the other side opens the camera, in live mode.
  useEffect(() => {
    if (liveSnapAsked) setSnapSheet({ live: true });
  }, [liveSnapAsked]);
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; started: number } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // A recorder left running because the room was closed mid-take holds the
  // microphone light on. Stop the tracks on unmount, always.
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    onSend(text); setBody(''); onTyping(false);
  };

  /** Upload, then send. Text typed alongside a file rides with it. */
  const sendFiles = async (files: File[], label: string, durationSec?: number) => {
    setError(null);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`${tooBig.name || 'That file'} is ${fmtSize(tooBig.size)} — the limit is ${fmtSize(MAX_BYTES)}.`);
      return;
    }
    setBusy(label);
    try {
      const out: OutgoingAttachment[] = [];
      for (const f of files) {
        // mediaApi.uploadDoc is the chokepoint: it scrubs an image's location
        // before the presign and returns what the message row needs.
        const up = await mediaApi.uploadDoc(f);
        out.push({
          url: up.fileUrl,
          mimeType: up.mimeType || f.type || 'application/octet-stream',
          size: up.sizeBytes ?? f.size,
          ...(f.name ? { name: f.name.slice(0, 255) } : null),
          ...(durationSec ? { duration: Math.max(1, Math.round(durationSec)) } : null),
        });
      }
      onSend(body.trim(), out);
      setBody(''); onTyping(false);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Upload a snap and send it.
   *
   * ITS OWN PATH, not `sendFiles` with a flag. Three things differ and every
   * one of them matters: the bytes go to the PRIVATE vault through
   * `uploadSnap` rather than the public bucket, what travels is a KEY rather
   * than a URL, and the attachment carries the clock. A boolean threaded
   * through the other function would have made the public-bucket branch the
   * default for a photograph whose whole point is not being in it.
   */
  const sendSnap = async (file: File, mode: SnapMode, live: boolean, caption: string) => {
    setSnapSheet(null);
    setError(null);
    setBusy('Sending snap…');
    try {
      const up = await mediaApi.uploadSnap(file);
      onSend(caption, [{
        url: up.key, mimeType: up.mimeType, size: up.sizeBytes,
        snap: { mode, ...(live ? { live: true } : null) },
      }]);
      setBody(''); onTyping(false);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';                       // same file twice must still fire
    if (files.length) void sendFiles(files, files.length > 1 ? `Sending ${files.length} files…` : 'Sending file…');
  };

  const startRec = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      mr.start();
      rec.current = { mr, chunks, stream, started: Date.now() };
      setRecSec(0);
      tick.current = setInterval(() => setRecSec((s) => (s === null ? 0 : s + 1)), 1000);
    } catch {
      // A refused microphone is a decision, not a failure — say what to do.
      setError('Microphone blocked — allow it in your browser settings.');
    }
  };

  const stopRec = async (send: boolean) => {
    const r = rec.current;
    if (!r) return;
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    const seconds = (Date.now() - r.started) / 1000;
    const done = new Promise<Blob>((resolve) => {
      r.mr.onstop = () => resolve(new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' }));
    });
    r.mr.stop();
    const blob = await done;
    r.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecSec(null);
    // Under a second is a slip of the finger, not a message.
    if (!send || seconds < 1 || blob.size === 0) return;
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    const file = new File([blob], `voice-note.${ext}`, { type: blob.type });
    await sendFiles([file], 'Sending voice note…', seconds);
  };

  const recording = recSec !== null;

  return (
    /* `.csdock` — the composer's gutter, and the safe area under it. It was an
       inline `margin: '0 20px 0'` here, which is why the send key sat on the
       very bottom edge of a phone with the home indicator drawn through it:
       an inline margin outranks every rule in the cascade, including the four
       `.cscomposer` margins written for exactly this. The numbers live in
       relief.css now, where somebody looking for them will find them. */
    <div className="csdock">
      {(error || busy) && (
        <p style={{
          margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5,
          color: error ? 'var(--on-stage)' : 'var(--on-stage-soft)',
        }} role={error ? 'alert' : 'status'}>
          {error ?? busy}
        </p>
      )}
      {/* No class name: this bar is styled inline because a `cs`-prefixed name
          with no rule in index.css is a promise to a stylesheet that never
          answers — the failure no-borrowed-class-names.test.ts exists to catch,
          pointed the other way. */}
      {replyTo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px',
          padding: '8px 12px', borderRadius: 12,
          background: 'var(--stage-tile)', borderLeft: '3px solid var(--on-stage-faint)',
        }}>
          <span className="flex-min">
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--on-stage-soft)' }}>
              Replying to {replyTo.name}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--on-stage-faint)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.body || 'Attachment'}
            </span>
          </span>
          <button type="button" className="cstool" aria-label="Cancel reply"
            onClick={() => onCancelReply?.()} style={{ flex: 'none' }}>✕</button>
        </div>
      )}
      {snapMenu && (
        <div className="cssnap-menu" role="menu" aria-label="Temporary photo">
          <button type="button" role="menuitem"
            onClick={() => { setSnapMenu(false); setSnapSheet({ live: false }); }}>
            <span>Send a snap</span>
            <span>A photo with a clock on it.</span>
          </button>
          <button type="button" role="menuitem"
            onClick={() => { setSnapMenu(false); setSnapSheet({ live: true }); }}>
            <span>Send a Live Snap</span>
            <span>Straight from the camera — no gallery.</span>
          </button>
          {onShare && (
            <button type="button" role="menuitem"
              onClick={() => { setSnapMenu(false); onShare(LIVE_SNAP_REQUEST); }}>
              <span>Ask for a Live Snap</span>
              <span>Their camera opens when they answer.</span>
            </button>
          )}
        </div>
      )}
      {snapSheet && (
        <SnapComposer live={snapSheet.live}
          onSend={(f, m, live, caption) => void sendSnap(f, m, live, caption)}
          onClose={() => setSnapSheet(null)} />
      )}
      <form className="cscomposer" onSubmit={submit} style={{ margin: 0 }}>
        <input ref={fileRef} type="file" multiple onChange={onPick}
          style={{ display: 'none' }} aria-hidden tabIndex={-1} />


        {recording ? (
          <>
            <span className="csrec-dot" aria-hidden />
            <span style={{ flex: 1, fontSize: 15, color: 'var(--on-stage)' }} aria-live="polite">
              Recording {fmtClock(recSec ?? 0)}
            </span>
            <button type="button" className="cstool" aria-label="Discard this recording"
              onClick={() => void stopRec(false)}>✕</button>
            <button type="button" className="cssend" aria-label="Send voice note"
              onClick={() => void stopRec(true)}>➤</button>
          </>
        ) : (
          <>
            {/* BOTH WAYS OF ATTACHING SIT TOGETHER, ON THE LEFT (owner's call,
                13 Aug). They are the same kind of act — put something into the
                message that is not typing — so they belong in one place, and
                the right-hand corner belongs to Send alone. The microphone used
                to live there and swap with Send, which meant the key under your
                thumb changed identity as you typed. */}
            <span className="cstools">
              <button type="button" className="cstool" aria-label="Attach a file"
                disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>📎</button>
              <button type="button" className="cstool" aria-label="Record a voice note"
                disabled={Boolean(busy)} onClick={() => void startRec()}>🎙</button>
              {/* ONE KEY, THREE THINGS TO DO WITH A TEMPORARY PHOTO. A snap, a
                  Live Snap and asking for one are the same subject, and three
                  keys in a row this narrow is how a composer becomes a toolbar.
                  The menu is drawn above the capsule and closes on any
                  choice. */}
              <button type="button" className="cstool" aria-label="Send a temporary photo"
                aria-expanded={snapMenu} disabled={Boolean(busy)}
                onClick={() => setSnapMenu((v) => !v)}>📸</button>
            </span>
            <input ref={inputRef} value={body} placeholder="Write a message…" aria-label="Write a message"
              disabled={Boolean(busy)}
              onChange={(e) => { setBody(e.target.value); onTyping(e.target.value.length > 0); }} />
            {/* Disabled rather than absent: the capsule keeps its shape as you
                type, and `.cssend[disabled]` is already drawn as a hollow key
                for exactly this state. */}
            <button type="submit" className="cssend" aria-label="Send" disabled={Boolean(busy) || !body.trim()}>➤</button>
          </>
        )}
      </form>
    </div>
  );
}
