import { useId, useState, type ReactNode } from 'react';

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
 */
export function Fold({
  title, meta, defaultOpen = false, face = 'fold', panel = 'fold-open', children,
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
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <>
      <button type="button" className={face}
        onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        <span className="t">{title}</span>
        {meta && <span className="m">{meta}</span>}
        <span className="s" aria-hidden>{open ? 'Close −' : 'Open +'}</span>
      </button>
      {open && <div className={panel} id={id}>{children}</div>}
    </>
  );
}
