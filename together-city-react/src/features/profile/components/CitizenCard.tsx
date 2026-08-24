import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { CARD_H, CARD_W, drawCitizenCard, loadImage } from '../citizenCard';

/**
 * The card, its preview, and its download — one canvas doing all three.
 *
 * The canvas on screen IS the file. There is no second rendering path, so the
 * picture that reaches a friend's phone cannot drift from the one that was
 * previewed. It is drawn once at 2000×1260 and displayed at whatever width
 * the page gives it.
 */
export function CitizenCard({ name, handle, email, photo, since }: {
  name: string; handle: string; email: string; photo: string | null; since: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [noPhoto, setNoPhoto] = useState(false);

  const url = `https://togethercity.app/social/u/${handle}`;

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    void (async () => {
      /* The webfont has to be resolved before anything is measured, or the
         name is laid out in the fallback and then repainted in the real face
         at a different width. */
      await document.fonts.ready;
      const [portrait, art] = await Promise.all([loadImage(photo), loadImage('/assets/img/citizen-card.webp')]);
      if (cancelled) return;

      drawCitizenCard(ctx, { name, handle, email, photo: portrait, art, url, since });

      /* A portrait from another origin taints the canvas, and a tainted canvas
         cannot be exported at all — the download would throw at the moment
         somebody pressed it. Probing one pixel here finds it while there is
         still something useful to do about it: redraw without the photograph
         and say so. */
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch {
        drawCitizenCard(ctx, { name, handle, email, photo: null, art, url, since });
        setNoPhoto(true);
      }
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [name, handle, email, photo, since, url]);

  const download = () => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `together-city-${handle}.png`;
      a.click();
      URL.revokeObjectURL(href);
    }, 'image/png');
  };

  return (
    <section className="esec" style={{ marginTop: 34 }}>
      <h2>Your citizen card</h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px', maxWidth: '62ch', lineHeight: 1.6 }}>
        A picture you can send to somebody who is not in Together City. It
        carries your photograph, your name, your citizen number and your city
        mail — and a code that opens your profile, because a handle in a
        picture is not something anybody can tap.
      </p>
      <canvas
        ref={ref}
        width={CARD_W}
        height={CARD_H}
        aria-label={`Citizen card for ${name}`}
        style={{ width: '100%', maxWidth: 720, height: 'auto', borderRadius: 18, display: 'block', boxShadow: 'var(--e2)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
        <Button variant="accent" size="sm" disabled={!ready} onClick={download}>
          {ready ? 'Download the card' : 'Drawing…'}
        </Button>
        <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
          {noPhoto
            ? 'Your photo couldn’t be included, so the card shows your initials.'
            : 'A PNG, 2000 × 1260. What you see here is exactly the file.'}
        </span>
      </div>
    </section>
  );
}
