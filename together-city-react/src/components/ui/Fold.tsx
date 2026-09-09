import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';

/**
 * THE ONE DISCLOSURE IN THE CITY.
 *
 * A section that folds is four things done together: the open/closed state, an
 * id linking the face to the panel, `aria-expanded` and `aria-controls` on the
 * face, and a word that says which way it will go. Miss any one and it still
 * looks correct — the panel opens, the arrow turns — while a screen reader is
 * told nothing at all.
 *
 * WHICH IS WHY THERE IS EXACTLY ONE OF THESE. The beauty hub had the only fold
 * in the app, and the test beside it counts the `aria-expanded` pairs precisely
 * because a second implementation is how one of them quietly stops announcing
 * itself. When the Financial hub needed folds too, the honest answer was not a
 * second copy with the same four lines in it.
 *
 * THE SKIN IS THE CALLER'S, THE CONTRACT IS NOT. `face` and `panel` are class
 * names, so beauty keeps `.beauty-leaf` — a rule, a tracked name and an index
 * line, from the owner's printed contents page — and Financial gets `.fold`,
 * which is the city's ordinary card. Two rooms, two papers, one behaviour.
 *
 * There is no chevron and no animation. A fold that measures its own height to
 * animate it is a fold that fights the browser over a number the browser
 * already knows, and the word on the right says everything an arrow would.
 *
 * ── THE WORD IS THE CITY'S STATE INDICATOR (owner, 8 Sep) ──────────────────
 *
 * The disclosure audit found four visual languages for one behaviour: this
 * word, a rotating chevron on the Master Profile panels, a second rotating
 * chevron on the store's order days, and a `▸` on the nutrition targets. The
 * owner's call was to keep the WORD and retire the chevrons, because it is
 * already the majority treatment and it is the one that reads without colour,
 * at any size, in any hub's paper. `.fold-state` in layout.css is the same
 * word for the native `<details>` sections, which announce themselves to a
 * screen reader without help and only ever needed the paint.
 */

/**
 * THE FOUR LINES, FOR THE THINGS THAT ARE NOT SECTIONS.
 *
 * A Fold is a titled section of a page. A menu key, an edit-mode toggle and a
 * combobox are not — they have their own markup and their own place in their
 * own room, and wrapping them in a Fold would be dressing a control as a
 * chapter. But they are the SAME FOUR LINES, and before this hook eighteen of
 * them were written out by hand and nineteen were not written at all: the
 * panel opened and the screen reader was told nothing.
 *
 * So the contract lives here, once, and the skin stays the caller's:
 *
 *   const d = useDisclosure();
 *   <Button {...d.faceProps}>{d.open ? 'Cancel' : 'Edit hours'}</Button>
 *   {d.open && <div {...d.panelProps}>…</div>}
 *
 * `faceProps` carries the click as well as the two attributes, so a caller
 * cannot wire the paint without wiring the announcement — which is exactly the
 * failure this whole file exists to make impossible.
 */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  const id = useId();
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return {
    open,
    setOpen,
    toggle,
    close,
    /** Spread on the control. Carries the click AND what it announces. */
    faceProps: { onClick: toggle, 'aria-expanded': open, 'aria-controls': id } as const,
    /**
     * THE TWO ATTRIBUTES WITHOUT THE CLICK, for a control that already owns
     * its own handler — a combobox that opens on focus and on typing, a
     * "Change it" that fills the form before it shows it, an alerts key that
     * marks everything read on the way open. They still must not be written
     * out by hand: `aria-expanded={open}` typed into a page is exactly the
     * copy a-read-section-folds-itself.test.ts counts, and the half of it
     * that gets forgotten is always `aria-controls`.
     */
    announces: { 'aria-expanded': open, 'aria-controls': id } as const,
    /** Spread on the panel, which is rendered only while it is open. */
    panelProps: { id } as const,
  };
}

/**
 * WHAT A SECTION REMEMBERS.
 *
 * Owner, 8 Sep: a fold's state should survive going somewhere and coming back.
 * It survives for the TAB and not for the account — sessionStorage, not the
 * server — because a fold is a reading posture, not a preference, and syncing
 * one to the server is a write on every tap of a chevron the city does not
 * even draw.
 *
 * The key is the caller's to give and is opt-in: a fold that opens on what is
 * in it today (the photo section while photos are staged, the newest order)
 * must not be overruled by what somebody did to it yesterday.
 */
const KEY = (k: string) => `tc.fold.${k}`;
function useRemembered(rememberAs: string | undefined, fallback: boolean) {
  const [open, setOpen] = useState(() => {
    if (!rememberAs) return fallback;
    try {
      const v = sessionStorage.getItem(KEY(rememberAs));
      return v === null ? fallback : v === '1';
    } catch { return fallback; }
  });
  useEffect(() => {
    if (!rememberAs) return;
    try { sessionStorage.setItem(KEY(rememberAs), open ? '1' : '0'); } catch { /* private mode */ }
  }, [rememberAs, open]);
  return [open, setOpen] as const;
}

export function Fold({
  title, meta, defaultOpen = false, face = 'fold', panel = 'fold-open',
  open: openProp, onOpenChange, action, rememberAs, children,
}: {
  title: ReactNode;
  /**
   * WHAT IS IN IT, NOT HOW MUCH OF IT. "7 readings" is a size; "3 to work on"
   * is a reason to open it, and "all good" is a complete answer without opening
   * anything. A closed section that says only its own name is a section nobody
   * opens, which is the same as deleting it.
   */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Class for the button. The caller's hub decides what a fold looks like. */
  face?: string;
  /** Class for the panel, which only exists while it is open. */
  panel?: string;
  /**
   * CONTROLLED, WHEN SOMETHING ELSE HAS TO BE ABLE TO CLOSE IT. The daybook's
   * sections shut when their own Save is pressed (owner, 15 Aug), which a fold
   * holding its own state cannot know about — so the caller may hold it and
   * hand it back. Omit both and it keeps its own, exactly as every caller
   * written before this one does.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * A CONTROL BESIDE THE FACE — a Save, a Done. It cannot go INSIDE the face:
   * that is a button, and a button inside a button is markup no two browsers
   * agree on. So a fold WITH an action gains a row for the pair to sit in, and
   * a fold without one renders the DOM every caller before this rendered. A new
   * capability that changes the markup of the callers not using it is how a
   * shared component becomes a shared risk.
   */
  action?: ReactNode;
  /**
   * Remember open/closed for this tab under this name. Opt-in: see
   * `useRemembered` above for why it is not the default.
   */
  rememberAs?: string;
  children: ReactNode;
}) {
  const [self, setSelf] = useRemembered(rememberAs, defaultOpen);
  const open = openProp ?? self;
  const toggle = () => (onOpenChange ? onOpenChange(!open) : setSelf(!open));
  const id = useId();
  const lid = (
    <button type="button" className={face}
      onClick={toggle} aria-expanded={open} aria-controls={id}>
      <span className="t">{title}</span>
      {meta && <span className="m">{meta}</span>}
      <span className="s" aria-hidden>{open ? 'Close −' : 'Open +'}</span>
    </button>
  );
  return (
    <>
      {action ? <div className="fold-hd">{lid}<span className="fold-act">{action}</span></div> : lid}
      {open && <div className={panel} id={id}>{children}</div>}
    </>
  );
}
