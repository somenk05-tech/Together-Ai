import { useId, useState, type ReactNode } from 'react';
import { Fold } from '@/components/ui';

/**
 * THE BEAUTY HUB'S TWO FOLDS — a plate and a leaf.
 *
 * EVERYTHING ON THE SKIN & HAIR PAGE IS AN INPUT: the photographs, the answers,
 * the assessment they produce. Before these, every return visit began with
 * several screens of your own answers standing between you and the routine they
 * exist to build. Nothing is deleted and nothing is re-asked — the sections are
 * simply closed, and one tap opens any of them.
 *
 * OPEN IS A PROP, NOT A DEFAULT. Which sections start open is a decision about
 * what somebody came for, and it belongs to the page rather than to a component.
 *
 * NO HEIGHT ANIMATION. Animating to `auto` needs a measured height, and a
 * measured height on a section holding lazily-loaded photographs is measured
 * before they land and wrong afterwards. The state is instant and honest; the
 * motion budget in this app is spent where it carries meaning.
 *
 * THE PLAIN ROUNDED `Collapsible` THAT USED TO LIVE HERE IS GONE, and its going
 * is the point rather than a tidy-up. It was the city's ordinary card with a
 * chevron, and next to the owner's printed plates it was the one object on the
 * page that had come from a different design — three rounded pills with emoji
 * in them, in the middle of a set of prints. Both faces below are the same
 * behaviour and the same keyboard contract; only the paper differs.
 */

/**
 * ── THE SAME FOLD, WEARING THE OWNER'S POSTER ──────────────────────────────
 *
 * The Beauty hub's reference is four editorial prints, all one object: a rule
 * of three tracked words across the top, a display-serif title set large and
 * centred, a hairline–star–hairline divider, a paragraph in wide capitals, and
 * a foot rule. Every section of the skin & hair page is now one of those, and
 * the poster IS the header of its fold rather than a lid sitting on top of one.
 *
 * WHY THE SAME COMPONENT AND NOT A SECOND ONE. The plate has to do exactly what
 * the plain fold does — whole header is the button, aria-expanded, aria-controls
 * paired to the panel, open decided by the page — and a copy of it with poster
 * chrome bolted on is two implementations of a keyboard contract, which is how
 * one of them quietly stops announcing itself. Only the face differs.
 *
 * THE AFFORDANCE LIVES IN THE FOOT RULE, where the reference prints EST. 2024.
 * A chevron would have to go somewhere on a centred composition and there is
 * nowhere on a centred composition for a chevron to go. The foot already exists,
 * it already reads as small print, and OPEN / CLOSE is the plainest word for
 * what happens.
 *
 * THE FRAME IS THE SECTION AND THE FACE IS THE BUTTON, in that order and not
 * the other way round. Writing the plate AS the button is the obvious shape and
 * it is invalid: what opens out of these is a photo grid, a budget slider and a
 * form full of chips, and a button containing a button is markup the browser
 * repairs by pulling one of them out of the other — silently, differently per
 * engine. A heading is not allowed in there either. So the poster chrome is a
 * section, the face inside it is the button, and the panel is the face's
 * sibling.
 */
export function BeautyPlate(
  { title, blurb, meta, defaultOpen = false, hero = false, foot = 'Together Beauty Labs', children }:
  {
    title: ReactNode; blurb?: ReactNode; meta?: ReactNode;
    defaultOpen?: boolean; hero?: boolean; foot?: string; children?: ReactNode;
  },
) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  const face = (
    <>
      <div className="beauty-rule" aria-hidden>
        <span>Skin</span><span>Beauty</span><span>Care</span>
      </div>
      <h2 className="beauty-display">{title}</h2>
      <div className="beauty-star" aria-hidden><span>✦</span></div>
      {blurb && <p className="beauty-blurb">{blurb}</p>}
      <div className="beauty-rule">
        <span>{foot}</span>
        <span>{meta}</span>
        <span aria-hidden>{!children ? 'Est. 2024' : open ? 'Close −' : 'Open +'}</span>
      </div>
    </>
  );

  /* A PLATE WITH NOTHING TO OPEN IS A PLATE, NOT A FOLD. The hero and the
     details tab's masthead have no panel behind them, and a header that
     announces itself to a screen reader as a collapsed region controlling
     nothing is worse than a heading — it is a heading that has been lied
     about. So the decision is made by whether there are children, not by a
     second prop somebody has to remember to pass. */
  if (!children) return <div className={`beauty-plate${hero ? ' is-hero' : ''}`}>{face}</div>;

  return (
    <section className="beauty-plate">
      <button type="button" className="beauty-face"
        onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        {face}
      </button>
      {open && <div className="beauty-open" id={id}>{children}</div>}
    </section>
  );
}

/**
 * ── THE LEAF: A LINE IN AN INDEX ───────────────────────────────────────────
 *
 * Skin, Hair & scalp and Ingredients are not four chapters of the page, they
 * are the CONTENTS of one — the analysis the hero plate is named after. Given
 * plates of their own the page becomes seven posters in a column, which is the
 * failure that makes a reference stop reading as a reference; given the city's
 * ordinary rounded card they are the one thing on the page from another design.
 *
 * So they are set as an index: a rule, a tracked name, what is in it, and the
 * word for opening it. The same three lines a printed contents page has, and
 * the same three facts the rounded card carried.
 *
 * WHAT IS IN IT MATTERS MORE THAN HOW MUCH. "7 readings" is a size; "3 to work
 * on" is the reason to open it, and "all good" is a complete answer without
 * opening anything. A closed section that says only its own name is a section
 * nobody opens, which is the same as deleting it.
 */
/**
 * THE BEHAVIOUR MOVED OUT AND THE PAPER STAYED. Everything above is still true
 * of this leaf; what is no longer true is that this file owns the disclosure.
 * When the Financial hub needed folds, the choice was a second copy of the
 * state, the id and the two aria attributes — four lines that look right when
 * one of them is missing — or one component wearing two skins. See
 * components/ui/Fold.tsx, and the test that now reads both files.
 *
 * The markup this renders is byte-for-byte what it rendered before.
 */
export function BeautyLeaf(
  { title, meta, defaultOpen = false, children }:
  { title: string; meta?: ReactNode; defaultOpen?: boolean; children: ReactNode },
) {
  return (
    <Fold title={title} meta={meta} defaultOpen={defaultOpen}
      face="beauty-leaf" panel="beauty-leaf-open">
      {children}
    </Fold>
  );
}
