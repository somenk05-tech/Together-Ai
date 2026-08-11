import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

/**
 * The three photos, and the three ways to give them.
 *
 * WHY THIS IS A FILE AND NOT MORE OF Profile.tsx. What was here before was six
 * fixed tiles wired to a hidden `<input type="file">` — face, left, right,
 * hairline, top of head, scalp close-up, every one of them mandatory. On a
 * laptop that is a six-photo photoshoot of the back of your own head before the
 * product will say anything at all, and the top-of-head and scalp shots are the
 * two nobody can take of themselves. The whole set is one thing now: three
 * photos, two of them required, taken however suits the person.
 *
 * SIX BECAME THREE, AND THE THIRD IS OPTIONAL. A full face with hair, a skin
 * close-up, and — if there is one — the thing that is actually bothering them.
 * Somebody with nothing bothering them has nothing to photograph, and making
 * them find a third picture is exactly the rigidity being removed. The required
 * pair comes first so the grid fills left to right and stops where the gate is
 * satisfied.
 *
 * THE BACKEND NEVER CARED. `slot` is `z.string().min(1).max(32)` with a cap of
 * eight photos, recorded verbatim beside the findings. Nothing on the server
 * names an angle, so this whole change is a frontend one — which is worth
 * saying out loud, because "reduce the required photos" sounds like a contract
 * change and is not.
 *
 * THREE WAYS IN, ONE PATH THROUGH. Pick a file, drop a file, or take one with
 * the camera; all three end at `readShot()` / `shotFromCanvas()` and produce
 * the same downscaled JPEG. The resize is not decoration — a phone photo is
 * 3–8 MB and the request cap is 4 MB per image.
 */

export interface Shot { preview: string; base64: string; mediaType: string }

export interface PhotoSlot { key: string; label: string; hint: string; required: boolean }

/** Required first, so filling the grid in order satisfies the gate. */
export const PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'face', label: 'Face & hair', hint: 'Head and shoulders, hair in frame', required: true },
  { key: 'skin', label: 'Skin close-up', hint: 'One area, filling the frame', required: true },
  { key: 'concern', label: 'A concern', hint: 'Optional — what is bothering you', required: false },
];

export const REQUIRED_SLOTS: string[] = PHOTO_SLOTS.filter((s) => s.required).map((s) => s.key);

/** The gate, in one place: the analysis needs the required slots and no more. */
export const photosReady = (pics: Record<string, unknown>): boolean =>
  REQUIRED_SLOTS.every((k) => Boolean(pics[k]));

/** What is still missing, by label, for the sentence under the button. */
export const missingPhotos = (pics: Record<string, unknown>): string[] =>
  PHOTO_SLOTS.filter((s) => s.required && !pics[s.key]).map((s) => s.label);

/** How many of the required ones have landed. The optional one is not scored:
 *  a meter that reads 2/3 when somebody is finished is a meter that lies. */
export const requiredCount = (pics: Record<string, unknown>): number =>
  REQUIRED_SLOTS.filter((k) => Boolean(pics[k])).length;

const MAX_EDGE = 1280;

/** Canvas → Shot. The one place a picture becomes an upload. */
function shotFromCanvas(c: HTMLCanvasElement): Shot {
  const jpeg = c.toDataURL('image/jpeg', 0.85);
  return { preview: jpeg, base64: jpeg.split(',')[1] ?? '', mediaType: 'image/jpeg' };
}

function fit(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * One file → one downscaled Shot.
 *
 * It resolves rather than rejects on a canvas that will not paint or an image
 * the browser cannot decode: the original data URL still uploads, and a person
 * who has just chosen a photo should not be told "no" by an implementation
 * detail. It rejects only for a file that is not an image at all, which is the
 * one case where saying so is the useful answer.
 */
export function readShot(file: File): Promise<Shot> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('not an image')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('unreadable'));
    reader.onload = () => {
      const url = String(reader.result || '');
      const raw: Shot = { preview: url, base64: url.split(',')[1] ?? '', mediaType: file.type || 'image/jpeg' };
      const img = new Image();
      img.onerror = () => resolve(raw);
      img.onload = () => {
        const { w, h } = fit(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(raw); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(shotFromCanvas(c));
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

/* ────────────────────────────── the camera ────────────────────────────── */

/**
 * A real camera, with a live preview and a shutter.
 *
 * `<input type="file" capture>` was the cheap version of this and it is not the
 * same thing: on a desktop the attribute does nothing at all, and on a phone it
 * hands the person to the system camera app and back. This is the camera inside
 * the page, which is what was asked for.
 *
 * THE PREVIEW IS MIRRORED AND THE PHOTO IS NOT. Every front camera anybody has
 * used behaves this way — you move right and the preview moves right, because
 * it is standing in for a mirror — but a saved selfie with the parting on the
 * wrong side is a picture of somebody else. The flip lives in the CSS on the
 * video and nowhere near the canvas.
 *
 * THE TRACKS ARE STOPPED ON EVERY EXIT, and that is the bug this component is
 * most likely to have. A MediaStream that outlives its sheet leaves the camera
 * light on after the overlay is gone, which is the single most alarming thing a
 * web page can do. Cleanup runs from the effect, so it happens on close, on
 * unmount, and on a facing-mode switch alike.
 *
 * THERE IS A REVIEW STEP. A shutter that files the photo straight into the grid
 * gives you no way to see you blinked. Capture freezes, and the picture is only
 * kept when it is accepted.
 */
export function CameraSheet(
  { slot, onCapture, onClose }: { slot: PhotoSlot; onCapture: (shot: Shot) => void; onClose: () => void },
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<Shot | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setError('This browser will not open a camera here. Choose a photo instead.');
      return;
    }
    void media.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play(); }
      })
      .catch(() => {
        if (!cancelled) setError('We could not open your camera. Check the permission in your browser, or choose a photo instead.');
      });
    // Runs on close, on unmount and on a facing switch. See the note above.
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  // Escape closes it, because an overlay that only has one small × is a trap
  // for anybody who is not using a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shoot = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const { w, h } = fit(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setTaken(shotFromCanvas(c));
  }, []);

  /* THE SHEET WEARS THE STAGE, which is the system's existing dark viewing
     surface — the one the reels and the call screen are drawn on. Nothing here
     picks a colour: `--stage`, `--stage-tile` and the three `--on-stage` inks
     already exist for exactly this, a lit thing on a dark ground, and
     relief.spec refuses a page that invents its own. */
  const act: React.CSSProperties = {
    cursor: 'pointer', borderRadius: 999, padding: '11px 18px', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', border: 'none', background: 'var(--stage-tile)', color: 'var(--on-stage)',
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Take your ${slot.label} photo`}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--stage)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 14 }}>

      <div style={{ color: 'var(--on-stage)', fontSize: 13.5, fontWeight: 700, textAlign: 'center' }}>
        {slot.label}
        <div style={{ color: 'var(--on-stage-soft)', fontWeight: 400, fontSize: 12, marginTop: 2 }}>{taken ? 'Happy with it?' : slot.hint}</div>
      </div>

      <div style={{ position: 'relative', width: 'min(92vw, 460px)', aspectRatio: '3 / 4', borderRadius: 16, overflow: 'hidden', background: 'var(--stage-solid)' }}>
        {taken
          ? <img src={taken.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (
            <video ref={videoRef} playsInline muted autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
          )}
        {error && (
          <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', textAlign: 'center', padding: 24, margin: 0, color: 'var(--on-stage)', fontSize: 13, lineHeight: 1.6 }}>{error}</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {taken ? (
          <>
            <button type="button" style={act} onClick={() => setTaken(null)}>Retake</button>
            <button type="button" onClick={() => { onCapture(taken); onClose(); }}
              style={{ ...act, background: 'var(--on-stage)', color: 'var(--on-stage-ink)' }}>Use this photo</button>
          </>
        ) : (
          <>
            <button type="button" style={act} onClick={() => setFacing((v) => (v === 'user' ? 'environment' : 'user'))}>
              Flip camera
            </button>
            <button type="button" aria-label="Take the photo" disabled={Boolean(error)} onClick={shoot}
              style={{ cursor: error ? 'default' : 'pointer', width: 66, height: 66, borderRadius: '50%', border: '4px solid var(--stage-tile)', background: error ? 'var(--on-stage-faint)' : 'var(--on-stage)' }} />
            <button type="button" style={act} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── the grid ────────────────────────────── */

/**
 * Three tiles. Click to browse, drop onto one, or open the camera.
 *
 * DROPPING SPILLS. Drop four files on the first tile and it takes the first and
 * hands the rest to whichever tiles are still empty, in order — because what
 * somebody actually does is select their photos and drag the lot over, and a
 * grid that keeps one and silently discards three has punished them for it.
 */
export function PhotoGrid(
  { pics, onSet, onClear }: {
    pics: Record<string, Shot>;
    onSet: (slot: string, shot: Shot) => void;
    onClear: (slot: string) => void;
  },
) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [over, setOver] = useState<string | null>(null);
  const [camera, setCamera] = useState<PhotoSlot | null>(null);

  /** `here` first, then any empty tile, in slot order. */
  const take = useCallback((here: string, files: FileList | null) => {
    if (!files?.length) return;
    const order = [here, ...PHOTO_SLOTS.map((s) => s.key).filter((k) => k !== here && !pics[k])];
    [...files].slice(0, order.length).forEach((file, i) => {
      readShot(file).then((shot) => onSet(order[i], shot)).catch(() => { /* not an image; the tile stays as it was */ });
    });
  }, [pics, onSet]);

  const drop = (slot: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(null);
    take(slot, e.dataTransfer?.files ?? null);
  };

  return (
    <>
      {/* minmax(150px) rather than 190: at 390px it is two tiles across
          instead of one, and `auto-fit` with three items never exceeds three
          columns, so the desk is unaffected. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {PHOTO_SLOTS.map((s) => {
          const pic = pics[s.key];
          const lit = over === s.key;
          return (
            <div key={s.key}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
              onDragLeave={() => setOver((v) => (v === s.key ? null : v))}
              onDrop={drop(s.key)}
              style={{
                border: `2px dashed ${lit ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 12, overflow: 'hidden',
                position: 'relative', display: 'flex', flexDirection: 'column',
                // A PHOTO IS PORTRAIT; AN INVITATION IS NOT. The filled tile
                // holds 3:4 so faces are not cropped square. An empty one is
                // only as tall as what it is asking for — three 3:4 boxes
                // stacked on a phone was most of a screen of nothing.
                ...(pic ? { aspectRatio: '3 / 4' } : { minHeight: 196 }),
                background: pic ? `center/cover no-repeat url(${pic.preview})` : lit ? 'var(--wash)' : 'var(--paper)',
              }}>

              {!pic && (
                <div style={{ margin: 'auto', textAlign: 'center', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{s.hint}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button type="button" onClick={() => setCamera(s)}
                      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '9px 13px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)' }}>
                      📷 Camera
                    </button>
                    <button type="button" onClick={() => inputs.current[s.key]?.click()}
                      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '9px 13px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)' }}>
                      Choose
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 10.5 }}>or drop one here</div>
                </div>
              )}

              {pic && (
                <>
                  {/* 44px of button around a 28px chip. The a11y ceiling asks
                      for the target and the picture asks for the small mark;
                      the hit area is the button and the scrim is the span. */}
                  <button type="button" aria-label={`Remove your ${s.label} photo`} onClick={() => onClear(s.key)}
                    style={{ position: 'absolute', top: 2, right: 2, width: 44, height: 44, border: 'none', cursor: 'pointer', background: 'transparent', padding: 0, display: 'grid', placeItems: 'center' }}>
                    <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--scrim-deep)', color: 'var(--on-accent)', fontSize: 13, lineHeight: '28px', textAlign: 'center' }}>✕</span>
                  </button>
                  <span style={{ marginTop: 'auto', background: 'var(--scrim-deep)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 600, padding: '5px 8px', textAlign: 'center' }}>
                    {s.label}
                  </span>
                </>
              )}

              <input ref={(el) => { inputs.current[s.key] = el; }} type="file" accept="image/*" multiple
                aria-label={`Choose your ${s.label} photo`}
                onChange={(e) => { take(s.key, e.target.files); e.target.value = ''; }}
                style={{ display: 'none' }} />
            </div>
          );
        })}
      </div>

      {camera && (
        <CameraSheet slot={camera} onClose={() => setCamera(null)} onCapture={(shot) => onSet(camera.key, shot)} />
      )}
    </>
  );
}
