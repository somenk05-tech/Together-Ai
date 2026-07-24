import { useState, type CSSProperties } from 'react';
import { type ShareCard } from '@/api';
import { UniversalShareSheet, useShareSend, type SharePreview } from './UniversalShareSheet';

/* ------------------------------------------------------------------ *
 * ShareIconButton — the single, reusable "Send" affordance used across
 * every hub. A paper-plane icon that opens the Instagram-style
 * UniversalShareSheet with a rich card (image, title, meta, deep-link)
 * and sends it through the app's existing chat-share path.
 *
 * Any hub builds a `ShareCard` for its item and drops this button on the
 * card — the experience (sheet, recipients, "Sent ✓") is identical
 * everywhere.
 * ------------------------------------------------------------------ */

function PaperPlane({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path d="M22 2 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface ShareIconButtonProps {
  /** The rich card that gets sent into chat (kind, title, image, meta, deepLink). */
  card: ShareCard;
  /** Optional preview override for the sheet; defaults to the card's own fields. */
  preview?: SharePreview;
  heading?: string;
  label?: string;
  /** 'overlay' = round translucent button for a photo corner; 'ghost' = inline pill. */
  variant?: 'overlay' | 'ghost';
  size?: number;
  style?: CSSProperties;
}

export function ShareIconButton({
  card, preview, heading = 'Send to', label, variant = 'overlay', size = 34, style,
}: ShareIconButtonProps) {
  const [open, setOpen] = useState(false);
  const shareSend = useShareSend();

  const pv: SharePreview = preview ?? {
    imageUrl: card.image, title: card.title, subtitle: card.subtitle ?? undefined, meta: card.meta,
  };

  const base: CSSProperties = variant === 'overlay'
    ? {
        width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,.92)',
        border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.22)', color: 'var(--ink)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        fontFamily: 'inherit', padding: 0,
      }
    : {
        display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none',
        border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 999,
        padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      };

  return (
    <>
      <button
        type="button"
        aria-label={label ?? `Send ${card.title}`}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        style={{ ...base, ...style }}
      >
        <PaperPlane size={variant === 'overlay' ? Math.round(size * 0.5) : 15} />
        {variant === 'ghost' && <span>Send</span>}
      </button>
      {open && (
        <UniversalShareSheet
          open
          onClose={() => setOpen(false)}
          shareKind={card.kind}
          shareRef={card.deepLink ?? card.title}
          preview={pv}
          onSend={(recipients, message) => shareSend(recipients, message, card)}
          heading={heading}
        />
      )}
    </>
  );
}
