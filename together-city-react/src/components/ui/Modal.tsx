import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useDialogFocus } from '@/hooks/useDialogFocus';

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
 *
 * A11y: real dialog semantics — focus is moved into the dialog on open, trapped
 * within it while open (Tab / Shift-Tab cycle), and restored to the previously
 * focused element on close; the title (when present) labels the dialog.
 */
export function Modal({ open, onClose, title, children, footer, width = 460 }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /* THE KEYBOARD, HANDLED WHERE EVERY DIALOG GETS IT AT ONCE. On iOS,
     focusing a field in a centred fixed overlay does not shrink the window —
     Safari scrolls the LAYOUT viewport up and takes every fixed element with
     it, so the dialog slides off the top while its own input hides behind the
     keyboard. --tc-vvh/--tc-vvt are the visible viewport, kept live by the
     same hook Mira's panel uses; the overlay below is anchored to them, with
     the old values as fallbacks so a desk sees nothing change. */
  useVisualViewport(open);

  /* Esc, focus in, focus back, and the Tab cycle — the same four things every
     dialog needs, now in one hook because DrivePicker is also a dialog and had
     none of them. Behaviour here is unchanged; it has only moved. */
  const { onKeyDown } = useDialogFocus(open, onClose, dialogRef);

  if (!open) return null;

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
      style={{ position: 'fixed', top: 'var(--tc-vvt, 0px)', left: 0, right: 0, height: 'var(--tc-vvh, 100dvh)',
        zIndex: 'var(--z-dialog)', background: 'rgba(10,10,12,.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={title != null ? titleId : undefined}
        onKeyDown={onKeyDown} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 94vw)`, maxHeight: 'min(86vh, calc(var(--tc-vvh, 100dvh) - 36px))', overflowY: 'auto', background: 'var(--card)',
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
