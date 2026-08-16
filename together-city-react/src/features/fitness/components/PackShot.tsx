import { useState } from 'react';

/**
 * THE PACK, DRAWN RATHER THAN PHOTOGRAPHED — and the photograph, with the
 * drawn pack standing behind it.
 *
 * Shared by the store shelf and the orders page, because two copies of a
 * fallback are two behaviours the day one of them is fixed. `Pack` draws the
 * dosage format out of the review's own shape and colour fields; `Shot`
 * prefers the retailer's photograph (hotlinked, so it may be slow or gone)
 * and falls through to the drawing the moment it fails. A card must never
 * show a broken frame.
 *
 * THE PACK IS DRAWN OUT OF TOKENS. `colour` is DATA — the evidence review
 * carries one per row and it is the only literal allowed here, because it
 * belongs to the product rather than to the city. The body is the recessed
 * surface, the outline is the hairline, the printing is the subdued ink at
 * low opacity — so the whole thing re-inks itself on any ground, which is
 * what every other surface in the city already does.
 */
export function Pack({ shape, colour }: { shape?: string; colour?: string }) {
  const ink = colour || 'var(--muted)';
  const body = { fill: 'var(--wash)', stroke: 'var(--line)', strokeWidth: 1 };
  /** Printed on the pack rather than part of it: the same ink, much quieter. */
  const print = { fill: 'var(--muted)', opacity: 0.22 };
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" role="presentation" aria-hidden="true">
      {shape === 'strip' && (
        <g><rect x="26" y="20" width="68" height="80" rx="6" {...body} />
          <rect x="26" y="20" width="68" height="18" rx="6" fill={ink} />
          <rect x="36" y="50" width="48" height="3" rx="1.5" {...print} />
          <rect x="36" y="60" width="48" height="3" rx="1.5" {...print} />
          <rect x="36" y="70" width="30" height="3" rx="1.5" {...print} /></g>
      )}
      {shape === 'blister' && (
        <g><rect x="22" y="26" width="76" height="68" rx="5" {...body} />
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
            <circle key={`${r}-${c}`} cx={38 + c * 22} cy={42 + r * 20} r="7" fill={ink} opacity={0.85} />
          )))}</g>
      )}
      {shape === 'sachet' && (
        <g><path d="M30 28h60v64H30z" {...body} />
          <path d="M30 28h60v14H30z" fill={ink} />
          <path d="M30 88h60v6H30z" {...print} opacity={0.18} /></g>
      )}
      {shape === 'syrup' && (
        <g><rect x="46" y="16" width="28" height="14" rx="3" fill={ink} />
          <path d="M44 30h32l8 18v46a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V48z" {...body} />
          <rect x="46" y="58" width="28" height="26" rx="3" fill={ink} opacity={0.3} /></g>
      )}
      {shape === 'jar' && (
        <g><rect x="30" y="24" width="60" height="12" rx="4" fill={ink} />
          <rect x="34" y="36" width="52" height="60" rx="7" {...body} />
          <rect x="42" y="56" width="36" height="22" rx="3" fill={ink} opacity={0.28} /></g>
      )}
      {shape === 'pouch' && (
        <g><path d="M34 24h52v72a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4z" {...body} />
          <path d="M34 24h52v10H34z" fill={ink} />
          <rect x="44" y="52" width="32" height="26" rx="3" fill={ink} opacity={0.25} /></g>
      )}
      {shape === 'tub' && (
        <g><rect x="26" y="22" width="68" height="14" rx="5" fill={ink} />
          <rect x="30" y="36" width="60" height="62" rx="6" {...body} />
          <rect x="38" y="54" width="44" height="28" rx="3" fill={ink} opacity={0.3} /></g>
      )}
      {(shape === 'bottle-tab' || shape === 'bottle-cap' || shape === 'bottle-soft' || !shape) && (
        <g><rect x="50" y="16" width="20" height="12" rx="3" fill={ink} />
          <rect x="36" y="28" width="48" height="70" rx="8" {...body} />
          <rect x="42" y="48" width="36" height="30" rx="3" fill={ink} opacity={0.3} /></g>
      )}
    </svg>
  );
}

export function Shot({ image, pack, colour }: { image?: string; pack?: string; colour?: string }) {
  const [broken, setBroken] = useState(false);
  if (!image || broken) return <Pack shape={pack} colour={colour} />;
  return (
    <img src={image} alt="" loading="lazy" onError={() => setBroken(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'var(--card)' }} />
  );
}
