/**
 * ── FIVE PHOTOGRAPHS OF ONE ANIMAL ──────────────────────────────────────────
 *
 * The upload surface on the profile page. All the deciding happens in
 * `engine/photos.ts`; what is left here is the part a person touches.
 *
 * THE FIRST PHOTO IS THE FACE, AND THAT IS THE WHOLE ORDERING MODEL. No drag
 * handles, no "set as primary" checkbox that can disagree with a sort order —
 * "Make main" moves one to the front, and the front is what every card in the
 * district draws. One rule, visible in the layout: the first tile is twice the
 * size of the others, so the thing that is different looks different.
 *
 * WHY EACH REJECTED FILE GETS ITS OWN SENTENCE. Four photos chosen at once, one
 * of them a HEIC: three should land and the fourth should say why it did not.
 * A single "some photos could not be added" would leave somebody re-picking all
 * four to find out which. The list clears when the next selection succeeds.
 *
 * DRAG AND DROP IS AN ADDITION, NOT THE MECHANISM. The `<input type="file">` is
 * real and focusable and is what a keyboard or a screen reader uses; the drop
 * zone is a second way in for a mouse. A drop-only uploader is unusable without
 * one, which is the commonest accessibility failure in this pattern.
 */

import { useRef, useState } from 'react';
import type { PetPhoto } from '../types';
import { MAX_PET_PHOTOS, acceptPetPhotos, promotePhoto, scrubbedCount, type PhotoRejection } from '../engine/photos';
import { PetPortrait } from './PetPortrait';

interface Props {
  petName: string;
  species: 'dog' | 'cat';
  photos: PetPhoto[];
  /**
   * The array the gallery wants to exist. It may return a promise — the store's
   * `setPhotos` uploads to the vault and files the key — and this component
   * AWAITS IT, which is what keeps the spinner up until the bytes have landed.
   *
   * That matters for more than tidiness: "Make main" is a server call that
   * needs a photograph's saved id, so nothing may offer it while an upload is
   * still in flight. Holding `busy` across the write is what makes that true
   * rather than merely likely.
   */
  onChange: (photos: PetPhoto[]) => void | Promise<void>;
}

export function PetPhotos({ petName, species, photos, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<PhotoRejection[]>([]);

  const full = photos.length >= MAX_PET_PHOTOS;
  const left = MAX_PET_PHOTOS - photos.length;

  const take = async (files: FileList | File[] | null) => {
    if (!files || busy) return;
    setBusy(true);
    setRejected([]);
    try {
      const result = await acceptPetPhotos(Array.from(files), photos);
      if (result.photos.length) await onChange([...photos, ...result.photos]);
      setRejected(result.rejected);
    } finally {
      setBusy(false);
      // Clearing the input is what makes re-picking the SAME file work; without
      // it the change event never fires a second time.
      if (input.current) input.current.value = '';
    }
  };

  /** Both of these are server calls now, so both hold `busy` — a gallery that
   *  accepts a second click while the first is in flight is a gallery that can
   *  ask for two reorderings of an order that no longer exists. */
  const write = async (next: PetPhoto[]) => {
    if (busy) return;
    setBusy(true);
    try { await onChange(next); } finally { setBusy(false); }
  };

  const remove = (id: string) => {
    setRejected([]);
    void write(photos.filter((p) => p.id !== id));
  };

  const makeMain = (id: string) => void write(promotePhoto(photos, id));

  const scrubbed = scrubbedCount(photos);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Photos
        </span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {photos.length} of {MAX_PET_PHOTOS}
          {photos.length > 0 ? ' · first one is the main photo' : ''}
        </span>
      </div>

      {photos.length > 0 && (
        <ul
          style={{
            listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          }}
        >
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              style={{
                // The main tile spans two columns AND two rows, so the small
                // tiles decide the row height and the big one is simply four of
                // them. The image is absolutely positioned inside rather than
                // given its own aspect-ratio, because a square image in a cell
                // that is two rows plus a gap tall leaves a strip of background
                // under it — which is exactly what the first version did.
                // THE MAIN TILE CARRIES ITS OWN ASPECT RATIO TOO.
                // It spans two rows, and with a single photo uploaded there is
                // no second row to give it height — so the row collapsed and
                // the photograph rendered as a two-pixel strip. Spanning is for
                // WIDTH; the height has to come from the tile itself.
                gridColumn: i === 0 ? 'span 2' : undefined,
                gridRow: i === 0 ? 'span 2' : undefined,
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 'var(--r-2)', overflow: 'hidden',
                border: `1px solid ${i === 0 ? 'var(--accent-line)' : 'var(--line)'}`,
                background: 'var(--wash)',
              }}
            >
              <img
                src={photo.url}
                alt={i === 0 ? `${petName || 'Your pet'}, main photo` : `${petName || 'Your pet'}, photo ${i + 1}`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />

              {i === 0 && (
                <span
                  style={{
                    position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: 800,
                    letterSpacing: '.09em', textTransform: 'uppercase', padding: '3px 8px',
                    borderRadius: 'var(--r-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)',
                    border: '1px solid var(--accent-line)',
                  }}
                >
                  Main
                </span>
              )}

              {/* Remove is a mark in the corner rather than a word in a row:
                  at 96px a tile cannot hold two labelled buttons side by side,
                  and the first version wrapped them over the photograph. The
                  44px hit area around the small glyph is the tap target. */}
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label={`Remove photo ${i + 1} of ${petName || 'your pet'}`}
                title="Remove"
                style={{
                  // The background is transparent, so the extra four pixels
                  // are hit area and nothing else moves.
                  position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 'none',
                  background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    background: 'var(--card)', color: 'var(--danger-ink)', boxShadow: 'var(--e1)',
                  }}
                >
                  ✕
                </span>
              </button>

              {i > 0 && (
                <button
                  type="button"
                  onClick={() => makeMain(photo.id)}
                  style={{
                    position: 'absolute', insetInline: 0, bottom: 0, width: '100%',
                    font: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
                    textTransform: 'uppercase', padding: '6px 4px', border: 'none',
                    background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer',
                  }}
                >
                  Make main
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void take(e.dataTransfer.files); }}
          style={{
            display: 'grid', placeItems: 'center', gap: 8, padding: '22px 16px', textAlign: 'center',
            borderRadius: 'var(--r-2)', border: `1px dashed ${dragging ? 'var(--accent-line)' : 'var(--line)'}`,
            background: dragging ? 'var(--accent-soft)' : 'var(--wash)',
            transition: 'background var(--dur-fast) var(--ease)',
          }}
        >
          {photos.length === 0 && <PetPortrait pet={{ species, name: petName, weightKg: null, photos: [] }} size={54} tone="plain" />}
          <label style={{ display: 'grid', gap: 6, justifyItems: 'center', cursor: busy ? 'progress' : 'pointer' }}>
            <span
              className="btn btn-sm"
              style={{
                background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
                opacity: busy ? 0.6 : 1, pointerEvents: 'none',
              }}
            >
              {busy ? 'Adding…' : photos.length ? `Add ${left} more` : 'Add photos'}
            </span>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              onChange={(e) => void take(e.target.files)}
              style={{
                // Visually hidden, not display:none — a hidden input cannot be
                // focused, and the label is the only way in for a keyboard.
                position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
                overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
              }}
            />
            <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              or drop them here · up to {MAX_PET_PHOTOS} photos
            </span>
          </label>
        </div>
      )}

      {full && (
        <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
          That’s all {MAX_PET_PHOTOS}. Remove one to make room for another.
        </p>
      )}

      {rejected.length > 0 && (
        <ul
          role="alert"
          style={{
            listStyle: 'none', margin: 0, padding: '10px 12px', display: 'grid', gap: 6,
            borderRadius: 'var(--r-2)', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)',
          }}
        >
          {rejected.map((r) => (
            <li key={r.name} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--danger-ink)' }}>
              <strong>{r.name}</strong> — {r.reason}
            </li>
          ))}
        </ul>
      )}

      {scrubbed > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55 }}>
          Location data was removed from {scrubbed === 1 ? 'one photo' : `${scrubbed} photos`} before it was saved.
        </p>
      )}
    </div>
  );
}

