import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * ── A PHOTO THAT DOES NOT STAY: THE SENDING END ─────────────────────────────
 *
 * A sheet with a live camera in it, four clocks under it, and one send key.
 *
 * ── WHY THE CAMERA IS A <video>, AND NOT `capture="environment"` ────────────
 *
 * A Live Snap's whole claim is "this is now". The obvious implementation is
 * `<input type="file" accept="image/*" capture>`, and on a phone it does open
 * the camera — but `capture` is a HINT. Desktop browsers ignore it entirely
 * and show a file picker; several mobile browsers offer "Photo Library" beside
 * "Camera" anyway. A control that opens a gallery on half its platforms cannot
 * be the thing standing behind a badge that says a picture is current.
 *
 * `getUserMedia` into a `<video>`, a canvas grab on the shutter, and a File
 * made from the bytes: there is no gallery in that path on any platform,
 * because there is no picker in it at all.
 *
 * ── AND THE LIMIT, SAID PLAINLY ────────────────────────────────────────────
 *
 * This is OUR capture path, not a proof. A determined person running a patched
 * client, or a virtual camera driver, can put anything into a MediaStream, and
 * no server can tell from JPEG bytes where they came from. So `live` is a
 * claim this app makes about how it took the picture, the badge on the
 * recipient's side says "Taken in the app" rather than "verified", and nothing
 * anywhere calls it proof. Worth having — it is true of every snap this
 * composer sends, and it closes the gallery-forward that makes the ordinary
 * "send a photo" gesture feel like nothing at all.
 *
 * ── THE CAMERA LIGHT GOES OFF ──────────────────────────────────────────────
 *
 * Every path out of this component stops the tracks: the close button, the
 * send, unmount, and the effect's own cleanup when the sheet re-renders. A
 * camera left running behind a closed sheet is the single worst bug this file
 * could ship, so the stop lives in a ref that every exit reads rather than in
 * whichever handler happened to run.
 */

export type SnapMode = 'once' | 'twice' | 'day' | 'keep';

/** The four clocks, in the order somebody reads them: strictest first. The
 *  words are the whole explanation — a snap is not a place for a tooltip. */
const MODES: Array<{ id: SnapMode; label: string; note: string }> = [
  { id: 'once', label: 'View once', note: 'They can open it one time.' },
  { id: 'twice', label: 'View twice', note: 'They can open it twice.' },
  { id: 'day', label: '24 hours', note: 'Open as often as they like, for a day.' },
  { id: 'keep', label: 'They may keep it', note: 'A day — unless they choose to keep it in the chat.' },
];

export function SnapComposer({ live, onSend, onClose }: {
  /** Opened as a Live Snap: the camera is the only way in, and the gallery
   *  button is not drawn. Set when answering a "send me a Live Snap". */
  live?: boolean;
  onSend: (file: File, mode: SnapMode, live: boolean, caption: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shot, setShot] = useState<{ file: File; url: string; live: boolean } | null>(null);
  const [mode, setMode] = useState<SnapMode>('once');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // The camera runs only while there is nothing taken. Once a photograph is on
  // screen the stream has done its job, and holding it open would keep the
  // light on while somebody reads four labels.
  useEffect(() => {
    if (shot) { stopCamera(); return; }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        // A refused camera is a decision, not a failure — say what to do about
        // it, and leave the gallery route standing where there is one.
        setError('Camera blocked — allow it in your browser settings.');
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [shot, stopCamera]);

  // The object URL is this tab's own memory. Released on every replacement and
  // on the way out, so a sheet opened ten times does not hold ten photographs.
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const close = () => { stopCamera(); onClose(); };

  const shutter = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError('That did not come out — try again.'); return; }
      const file = new File([blob], 'snap.jpg', { type: 'image/jpeg' });
      setShot({ file, url: URL.createObjectURL(blob), live: true });
    }, 'image/jpeg', 0.9);
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    /* THE THREE THE MODERATION GUARD CAN READ, refused here rather than after
       an upload: the server accepts JPEG, PNG and WebP for a snap because
       those are what the classifier takes, and a HEIC that uploads and is then
       turned away is a worse "no" than this one. */
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('A snap is a JPEG, PNG or WebP photo.');
      return;
    }
    setError(null);
    setShot({ file, url: URL.createObjectURL(file), live: false });
  };

  const send = () => {
    if (!shot) return;
    stopCamera();
    onSend(shot.file, mode, shot.live, caption.trim());
  };

  return createPortal(
    <>
      <button type="button" className="cssheet-scrim" aria-label="Close" onClick={close} />
      <div className="cssheet cssnap" role="dialog" aria-modal="true" aria-label={live ? 'Take a Live Snap' : 'Send a snap'}>
        <div className="cssheet-grab" aria-hidden />
        <h2>{live ? 'Live Snap' : 'Snap'}</h2>
        <p className="cssnap-note">
          {live
            ? 'Taken here, now — there is no way in from your gallery.'
            : 'A photo with a clock on it. Choose how long it lasts.'}
        </p>

        <div className="cssnap-stage">
          {shot
            ? <img src={shot.url} alt="The photo you are about to send" />
            : <video ref={videoRef} playsInline muted aria-label="Camera preview" />}
        </div>

        {error && <p className="cssnap-note" role="alert">{error}</p>}

        {shot ? (
          <>
            <div className="cssnap-modes" role="radiogroup" aria-label="How long this photo lasts">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
                  className={mode === m.id ? 'cssnap-mode on' : 'cssnap-mode'}
                  onClick={() => setMode(m.id)}>
                  <span className="cssnap-mode-label">{m.label}</span>
                  <span className="cssnap-mode-note">{m.note}</span>
                </button>
              ))}
            </div>
            <label className="cssnap-caption">
              <span>Say something with it (optional)</span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
                placeholder="A word or two…" />
            </label>
            <div className="cssnap-keys">
              <button type="button" className="btn-line" onClick={() => setShot(null)}>Retake</button>
              <button type="button" className="btn" onClick={send}>
                Send{shot.live ? ' Live Snap' : ' snap'}
              </button>
            </div>
          </>
        ) : (
          <div className="cssnap-keys">
            {!live && (
              <>
                {/* `hidden` rather than an inline `display: none` — the same
                    result, and one fewer inline style object against a ceiling
                    that counts them. `.click()` works on a hidden input. */}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={pick} hidden aria-hidden tabIndex={-1} />
                <button type="button" className="btn-line" onClick={() => fileRef.current?.click()}>
                  Choose a photo
                </button>
              </>
            )}
            <button type="button" className="btn" onClick={shutter} disabled={!ready}>
              Take the photo
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
