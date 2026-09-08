import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

/**
 * WHAT MAKES A DIV A DIALOG, IN ONE PLACE.
 *
 * `Modal` has had this since audit 9.1 — Escape closes, focus moves in on
 * open, Tab and Shift-Tab cycle inside, and the opener gets focus back on
 * close. DrivePicker, which is also a modal, had none of it: a fixed overlay
 * with a backdrop click and nothing else, so a keyboard opened an attachment
 * picker it could not leave, tabbed straight out the back of into the page
 * behind, and had no Escape. To a screen reader it was not a dialog at all —
 * no role, no aria-modal, no name — just a div that had appeared.
 *
 * The behaviour is identical in both, so it lives here rather than twice.
 * Everything about how a dialog LOOKS stays with whoever draws it: DrivePicker
 * is a full-bleed panel with its own sticky header and an inner scroll, which
 * is not the shape Modal's padded body is for, and that is a real difference
 * rather than a reason to have two copies of a focus trap.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>,
): { onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void } {
  const prevFocus = useRef<HTMLElement | null>(null);

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
    const node = ref.current;
    if (node) {
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusables[0] ?? node).focus();
    }
    return () => { prevFocus.current?.focus?.(); };
  }, [open, ref]);

  // Trap Tab / Shift-Tab so focus cycles within the dialog.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return;
    const node = ref.current;
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

  return { onKeyDown };
}
