import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Footer slot — usually an ActionBar with Cancel / confirm buttons. */
  footer?: ReactNode;
  width?: number;
}

/**
 * Branded modal (audit 9.1) — one consistent overlay + card + Esc/backdrop
 * close used for dialogs across the product (also the base for branded
 * confirmations, replacing native window.confirm).
 */
export function Modal({ open, onClose, title, children, footer, width = 460 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(10,10,12,.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 94vw)`, maxHeight: '86vh', overflowY: 'auto', background: 'var(--card)',
          border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,.32)' }}>
        {title != null && (
          <div style={{ padding: '18px 20px 0' }}>
            <h2 style={{ fontSize: 19, margin: 0 }}>{title}</h2>
          </div>
        )}
        <div style={{ padding: '14px 20px 18px' }}>{children}</div>
        {footer != null && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)' }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
