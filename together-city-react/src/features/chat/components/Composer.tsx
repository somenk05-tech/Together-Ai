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
/** The longest edge of the small copy sent alongside a photo. The bubble that
 *  renders it is 260px wide; 480 covers that at two-times density and nothing
 *  more. */
const THUMB_EDGE = 480;

/** One thing waiting in the tray: what will be sent, and the local preview the
 *  chip draws. `preview` is an object URL over the file the citizen picked —
 *  never the uploaded one — so the chip is drawn before any byte leaves. */
interface Staged {
  id: string;
  att: OutgoingAttachment;
  preview?: string;
}

/**
 * MEASURE A PICTURE, AND MAKE A SMALL COPY OF IT.
 *
 * `serialize()` on the API has always handed a `thumbnail` back to the reader
 * as `thumbUrl`, and this composer has never sent one — so every chat photo
 * downloaded the full original into a 260px box. The bytes are already here and
 * already decoded, so the copy costs one canvas.
 *
 * The shape travels with it for the RECIPIENT's benefit: an <img> with no
 * intrinsic size is 0px tall until it decodes, and a thread that scrolls to its
 * bottom while the bubble is 0px tall pushes the newest message below the fold.
 *
 * NULL IS AN ORDINARY ANSWER. A file that is not an image, a decoder that
 * refuses, a canvas the browser will not give — none of them is a reason a
 * message should fail to send. The attachment simply travels as it always did.
 */
async function measureAndThumb(file: File): Promise<{ thumb: File | null; width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('undecodable'));
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, THUMB_EDGE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return { thumb: null, width: w, height: h };
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', .72));
    return {
      thumb: blob ? new File([blob], 'thumb.jpg', { type: 'image/jpeg' }) : null,
      width: w, height: h,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  /** Returns a promise once the socket knows whether the message landed.
   *  This component AWAITS it: a refusal is shown in the error slot and the
   *  typed text and the staged chips stay exactly where they are. */
  onSend: (body: string, attachments?: OutgoingAttachment[]) => void | Promise<void>;
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
  /* WHAT IS ATTACHED BUT NOT YET SENT. Picking a file used to BE sending it —
     no preview, no caption, no cancel, and a Send key that stayed dead because
     it only ever looked at the text. Attach, look at it, then send. */
  const [staged, setStaged] = useState<Staged[]>([]);
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
  /* Every object URL this composer has minted for a chip. Revoked when the chip
     goes and again on unmount — an object URL that outlives its <img> holds the
     whole file in memory until the tab closes. */
  const previews = useRef<string[]>([]);

  // A recorder left running because the room was closed mid-take holds the
  // microphone light on. Stop the tracks on unmount, always.
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    previews.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /**
   * Send what is in the capsule: the words and the tray, together.
   *
   * NOTHING IS CLEARED UNTIL `onSend` RESOLVES. It used to clear on the line
   * after the emit, which is why a refusal — moderation, the rate limit, a
   * blocked pair — took the caption and the photograph with it and left no
   * bubble and no message behind. A failure now says what the server said and
   * leaves everything where it was, ready to press again.
   */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if ((!text && !staged.length) || busy) return;
    setError(null);
    setBusy('Sending…');
    try {
      await onSend(text, staged.length ? staged.map((x) => x.att) : undefined);
      staged.forEach((x) => { if (x.preview) URL.revokeObjectURL(x.preview); });
      setStaged([]); setBody(''); onTyping(false);
    } catch (err) {
      setError((err as Error)?.message || 'Message not sent. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  /** Take one thing back out of the tray. */
  const unstage = (id: string) => {
    setStaged((list) => {
      const gone = list.find((x) => x.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((x) => x.id !== id);
    });
  };

  /**
   * Upload what was picked and PUT IT IN THE TRAY. The bytes still go first —
   * a message row pointing at a file that is still uploading renders as a
   * broken link for as long as the upload takes — but what lands is a chip,
   * not a message.
   */
  const stageFiles = async (files: File[]) => {
    setError(null);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`${tooBig.name || 'That file'} is ${fmtSize(tooBig.size)} — the limit is ${fmtSize(MAX_BYTES)}.`);
      return;
    }
    setBusy(files.length > 1 ? `Attaching ${files.length} files…` : 'Attaching…');
    try {
      const out: Staged[] = [];
      for (const f of files) {
        const shot = await measureAndThumb(f);
        // mediaApi.uploadDoc is the chokepoint: it scrubs an image's location
        // before the presign and returns what the message row needs.
        const up = await mediaApi.uploadDoc(f);
        let thumbnail: string | undefined;
        if (shot?.thumb) {
          // A missing thumbnail costs a bigger download, not a lost message —
          // so a failure here is swallowed rather than failing the attach.
          try { thumbnail = (await mediaApi.uploadDoc(shot.thumb)).fileUrl; } catch { thumbnail = undefined; }
        }
        const preview = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
        if (preview) previews.current.push(preview);
        out.push({
          id: crypto.randomUUID(),
          preview,
          att: {
            url: up.fileUrl,
            mimeType: up.mimeType || f.type || 'application/octet-stream',
            size: up.sizeBytes ?? f.size,
            ...(f.name ? { name: f.name.slice(0, 255) } : null),
            ...(thumbnail ? { thumbnail } : null),
            ...(shot ? { width: shot.width, height: shot.height } : null),
          },
        });
      }
      setStaged((list) => [...list, ...out]);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Upload one finished recording and send it, in one gesture.
   *
   * A VOICE NOTE DOES NOT GO IN THE TRAY, and neither does a snap below. Both
   * are already a completed act — you pressed stop, you took the photograph in
   * a sheet — so staging them would be asking a second time for something
   * already decided. The paperclip is the one that stages, because picking a
   * file is choosing WHAT, not choosing to send it.
   */
  const sendVoice = async (file: File, label: string, durationSec?: number) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`That recording is ${fmtSize(file.size)} — the limit is ${fmtSize(MAX_BYTES)}.`);
      return;
    }
    setBusy(label);
    try {
      /* THE TWO HALVES FAIL DIFFERENTLY, so they are reported differently: the
         upload is a bucket or a connection and `uploadErrorMessage` names which,
         while a rejected `onSend` is the server refusing the message in its own
         words and must be repeated verbatim. */
      // mediaApi.uploadDoc is the chokepoint: it scrubs an image's location
      // before the presign and returns what the message row needs.
      const up = await mediaApi.uploadDoc(file).catch((err: unknown) => {
        setError(uploadErrorMessage(err));
        return null;
      });
      if (!up) return;
      await onSend(body.trim(), [{
        url: up.fileUrl,
        mimeType: up.mimeType || file.type || 'application/octet-stream',
        size: up.sizeBytes ?? file.size,
        ...(file.name ? { name: file.name.slice(0, 255) } : null),
        ...(durationSec ? { duration: Math.max(1, Math.round(durationSec)) } : null),
      }]);
      setBody(''); onTyping(false);
    } catch (err) {
      setError((err as Error)?.message || 'Message not sent. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Upload a snap and send it.
   *
   * ITS OWN PATH, not `sendVoice` with a flag. Three things differ and every
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
      const up = await mediaApi.uploadSnap(file).catch((err: unknown) => {
        setError(uploadErrorMessage(err));
        return null;
      });
      if (!up) return;
      await onSend(caption, [{
        url: up.key, mimeType: up.mimeType, size: up.sizeBytes,
        snap: { mode, ...(live ? { live: true } : null) },
      }]);
      setBody(''); onTyping(false);
    } catch (err) {
      /* A snap is the most refusable thing this composer sends — moderation, a
         blocked pair, a replayed key — and until the send returned a promise
         every one of those refusals was silent. */
      setError((err as Error)?.message || 'Snap not sent. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';                       // same file twice must still fire
    if (files.length) void stageFiles(files);
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
    await sendVoice(file, 'Sending voice note…', seconds);
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
        /* `.csnote` — it was an inline object here, and the tray below needed
           rules in the stylesheet anyway. One less style block, and the
           numbers sit where somebody looking for them will find them. */
        <p className={error ? 'csnote csnote-bad' : 'csnote'} role={error ? 'alert' : 'status'}>
          {error ?? busy}
        </p>
      )}
      {staged.length > 0 && (
        /* THE TRAY. Above the capsule, because it is what the capsule is about
           to send — and each chip carries its own way out, which is the whole
           thing that was missing: attaching used to be irreversible. */
        <ul className="cstray" aria-label="Ready to send">
          {staged.map((x) => (
            <li key={x.id} className={x.preview ? 'cschip cschip-img' : 'cschip'}>
              {x.preview
                ? <img src={x.preview} alt="" />
                : (
                  <span className="cschip-what">
                    <b>{x.att.name ?? 'Attachment'}</b>
                    <i>{fmtSize(x.att.size)}</i>
                  </span>
                )}
              <button type="button" className="cschip-x"
                aria-label={`Remove ${x.att.name ?? 'this attachment'}`}
                onClick={() => unstage(x.id)}>✕</button>
            </li>
          ))}
        </ul>
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
      <form className="cscomposer" onSubmit={(e) => void submit(e)} style={{ margin: 0 }}>
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
                for exactly this state.
                TEXT **OR** AN ATTACHMENT. It read `!body.trim()` alone, so
                somebody who attached a photograph and reached for Send found a
                dead key and concluded the photo was stuck in the bar. */}
            <button type="submit" className="cssend" aria-label="Send"
              disabled={Boolean(busy) || (!body.trim() && staged.length === 0)}>➤</button>
          </>
        )}
      </form>
    </div>
  );
}
