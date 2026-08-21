import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Footer slot — usually an ActionBar with Cancel / confirm buttons. */
  footer?: ReactNode;
  width?: number;
}

/** Elements that can receive keyboard focus — used for the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Branded modal (audit 9.1) — one consistent overlay + card + Esc/backdrop
 * close used for dialogs across the product (also the base for branded
 * confirmations, replacing native window.confirm).
 *
 * A11y: real dialog semantics — focus is moved into the dialog on open, trapped
 * within it while open (Tab / Shift-Tab cycle), and restored to the previously
 * focused element on close; the title (when present) labels the dialog.
 */
export function Modal({ open, onClose, title, children, footer, width = 460 }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open; restore it to the opener on close.
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    if (node) {
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusables[0] ?? node).focus();
    }
    return () => { prevFocus.current?.focus?.(); };
  }, [open]);

  if (!open) return null;

  // Trap Tab / Shift-Tab so focus cycles within the dialog.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) { e.preventDefault(); node.focus(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === node) { e.preventDefault(); last.focus(); }
    } else if (active === last) {
      e.preventDefault(); first.focus();
    }
  };

  /* THE PORTAL IS LOAD-BEARING, NOT A STYLE CHOICE. A dialog opened from
     inside a feed card used to render inside that card's subtree, and the
     feed's cards now carry `content-visibility: auto` (social.css) — a
     containment that turns a `position: fixed` descendant into a box measured
     against the CARD rather than the screen. Rendered at document.body the
     dialog covers the viewport whatever opened it, and it steps out of every
     ancestor stacking context and transform for free. React portals bubble
     events through the REACT tree, so the focus trap, Esc and backdrop close
     behave exactly as before. */
  return createPortal(
    <div onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(10,10,12,.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={title != null ? titleId : undefined}
        onKeyDown={onKeyDown} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 94vw)`, maxHeight: '86vh', overflowY: 'auto', background: 'var(--card)',
          border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,.32)', outline: 'none' }}>
        {title != null && (
          <div style={{ padding: '18px 20px 0' }}>
            <h2 id={titleId} style={{ fontSize: 20, margin: 0 }}>{title}</h2>
          </div>
        )}
        <div style={{ padding: '14px 20px 18px' }}>{children}</div>
        {footer != null && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)' }}>{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
