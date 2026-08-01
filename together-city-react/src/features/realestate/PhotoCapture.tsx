import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui';
import type { Photo } from './api';

/**
 * PhotoCapture — capture property photos with the device camera (getUserMedia) or
 * pick from the gallery. Photos are downscaled to a data URL on-device.
 * Photos are optional for now (product decision 2026-07-27).
 * The camera stream never leaves the browser.
 */
export function PhotoCapture({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);
  useEffect(() => stop, [stop]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 960 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamOn(true);
    } catch {
      setError('Couldn’t open the camera. Allow camera access, or upload photos from your gallery instead.');
    }
  };

  const downscale = (source: CanvasImageSource, w: number, h: number): string => {
    const max = 1000;
    const scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d')?.drawImage(source, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth, h = v.videoHeight;
    if (w && h) { onChange([...photos, { url: downscale(v, w, h) }]); return; }
    // Fallback if the frame has no dimensions yet (some devices/headless) — still record a shot.
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) { try { ctx.drawImage(v, 0, 0, 640, 480); } catch { /* draw nothing */ } }
    onChange([...photos, { url: canvas.toDataURL('image/jpeg', 0.8) }]);
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => onChange([...photos, { url: downscale(img, img.width, img.height) }]);
        img.src = String(reader.result);
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const remove = (i: number) => onChange(photos.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="eyebrow" style={{ margin: 0 }}>Photos</div>
        <span className="muted" style={{ fontSize: 11.5 }}>optional for now — listings with photos get more responses</span>
      </div>

      {camOn ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#111', aspectRatio: '4 / 3', maxWidth: 480 }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="accent" size="sm" onClick={capture}>📸 Capture</Button>
            <Button variant="line" size="sm" onClick={stop}>Done</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Button variant="accent" size="sm" onClick={() => void startCamera()}>📷 Use camera</Button>
          <Button variant="line" size="sm" onClick={() => fileRef.current?.click()}>🖼 Upload from gallery</Button>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={onFiles} style={{ display: 'none' }} />
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#c62828', margin: '8px 0 0' }}>{error}</p>}

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative', width: 108, height: 80, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" onClick={() => remove(i)} aria-label="Remove"
                style={{ minWidth: 44, minHeight: 44, position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 13, lineHeight: '22px' }}>×</button>
              {i === 0 && <span style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '1px 5px' }}>COVER</span>}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>{photos.length} photo{photos.length === 1 ? '' : 's'} · the first is your cover · photos stay on your device until you post.</p>
    </div>
  );
}
