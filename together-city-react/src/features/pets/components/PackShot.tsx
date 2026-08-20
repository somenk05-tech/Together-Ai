/**
 * ── THE PRODUCT PICTURE ─────────────────────────────────────────────────────
 *
 * Real retailer photography where we have it — 182 of the 184 catalogue rows —
 * and a drawn pack silhouette everywhere else.
 *
 * THE FALLBACK IS NOT DECORATION, IT IS THE ERROR STATE. These images are
 * hotlinked from the source retailer's CDN, and a CDN URL is a thing that dies:
 * the SKU is delisted, the store re-uploads at a new hash, the file moves. A
 * shop whose tiles collapse to broken-image glyphs looks abandoned, so every
 * failure — no URL, a 404, an offline reader — lands on the same drawn pack
 * rather than on a hole. `onError` is what makes that true at runtime; a
 * `<img>` with no error branch is a shelf that only works today.
 *
 * ON RIGHTS, PLAINLY: these files are the retailers' and the brands' own
 * photography. Hotlinking them is fine for a prototype and is NOT a licence to
 * publish. Before this ships commercially each row needs merchant authorisation
 * or a replacement shot — sheet 14 of the data workbook is the list, and
 * `imageSource` on the row says where the URL came from.
 */

import { useState } from 'react';
import type { ProductCategory } from '../types';
import { SHAPE_FOR, type PackShape } from './packShape';

/** The drawn pack — four flat silhouettes in the city's own ink. */
export function DrawnPack({ shape, size = 74 }: { shape: PackShape; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden fill="none">
      <g stroke="var(--ink-soft)" strokeWidth="1.6" strokeLinejoin="round" opacity="0.85">
        {shape === 'bag' && (
          <>
            <path d="M18 20h28l3 32a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4l3-32Z" fill="var(--card)" />
            <path d="M22 20c0-5 4-8 10-8s10 3 10 8" />
            <path d="M23 30h18M23 38h12" opacity="0.45" />
          </>
        )}
        {shape === 'tin' && (
          <>
            <ellipse cx="32" cy="20" rx="15" ry="5" fill="var(--card)" />
            <path d="M17 20v22c0 3 7 5 15 5s15-2 15-5V20" fill="var(--card)" />
            <path d="M17 42c0 3 7 5 15 5s15-2 15-5" />
          </>
        )}
        {shape === 'bottle' && (
          <>
            <path d="M28 12h8v7c0 2 6 4 6 10v20a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V29c0-6 6-8 6-10v-7Z" fill="var(--card)" />
            <path d="M26 32h12" opacity="0.45" />
          </>
        )}
        {shape === 'soft' && (
          <>
            <path d="M32 14c11 0 18 8 18 19s-7 19-18 19-18-8-18-19 7-19 18-19Z" fill="var(--card)" />
            <path d="M24 30c3-4 13-4 16 0" opacity="0.45" />
          </>
        )}
      </g>
    </svg>
  );
}

interface Props {
  src: string | null;
  alt: string;
  category: ProductCategory;
  /** Box height. The image is contained, never cropped — a cropped pack shot
   *  loses the brand mark, which is the one thing a shopper scans for. */
  height?: number;
  drawnSize?: number;
}

export function PackShot({ src, alt, category, height = 132, drawnSize = 74 }: Props) {
  const [failed, setFailed] = useState(false);
  const shape = SHAPE_FOR[category] ?? 'soft';

  if (!src || failed) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', width: '100%' }}>
        <DrawnPack shape={shape} size={drawnSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        height, width: '100%', objectFit: 'contain', display: 'block',
        // Retailer shots arrive on their own white; on the city's white that is
        // invisible, which is what we want. mixBlendMode is deliberately NOT
        // used — it eats the dark packaging this catalogue is mostly made of.
        background: 'transparent',
      }}
    />
  );
}
