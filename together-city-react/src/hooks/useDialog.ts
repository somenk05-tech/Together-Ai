import { useEffect, useRef } from 'react';

/**
 * ── A MODAL THAT IS ACTUALLY A DIALOG ───────────────────────────────────────
 *
 * The 30 Aug audit counted seven overlays in Social Life and zero occurrences
 * of `role="dialog"` or `aria-modal` between them. None trapped focus, none
 * moved focus into itself, none gave it back, and exactly one handled Escape.
 * So a screen-reader user opening the photo editor kept reading the composer
 * behind it, and a keyboard user pressing Tab walked straight out of the sheet
 * into the page it was covering — with no way to tell they had.
 *
 * WHAT THIS DOES, AND WHY EACH PART.
 *  · Escape closes. On a phone there is no Escape key, which is why the Back
 *    button matters too (useBackToClose) — these are the same fix for two
 *    different hands.
 *  · Focus moves in on open, to the first thing worth focusing, so the next
 *    Tab is inside the dialog rather than at the top of the document.
 *  · Focus is TRAPPED: Tab past the last control wraps to the first and
 *    Shift+Tab wraps backwards. This is the part that makes `aria-modal` true
 *    rather than merely claimed.
 *  · Focus is RESTORED to whatever opened it. Without this, closing a sheet
 *    drops a keyboard user back at the top of the page and they have to find
 *    their place again.
 *
 * Returns the ref to put on the dialog element. Give that element
 * `role="dialog"`, `aria-modal="true"` and a label — the hook cannot do that
 * for you, and a dialog with no accessible name is announced as "dialog".
 */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;

    const focusables = (): HTMLElement[] => {
      if (!box) return [];
      return [...box.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null || el === document.activeElement);
    };

    // Focus the first control rather than the container: a container with
    // tabindex="-1" reads its whole contents at once on some screen readers,
    // which is a paragraph of speech before the citizen can act.
    const first = focusables()[0];
    if (first) first.focus();
    else box?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = focusables();
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and also catch focus that has escaped the dialog
      // entirely (a click on the page behind, before the overlay took it).
      if (e.shiftKey && (active === firstEl || !box.contains(active))) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (active === lastEl || !box.contains(active))) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Back to whatever opened it — but only if that element is still on the
      // page, or this throws focus at a detached node and the browser resets to
      // the body anyway.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return ref;
}
