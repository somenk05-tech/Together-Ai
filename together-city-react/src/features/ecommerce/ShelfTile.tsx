import { Link } from 'react-router-dom';
import { useState } from 'react';

/**
 * ── THE CARD IS THE PICTURE ─────────────────────────────────────────────────
 *
 * Owner, 22 Aug: "use the relevant images as the background for each card …
 * also uniform the card sizes for both the pages … adding one text image for
 * reference style — only the heading and nothing else."
 *
 * The reference was an Aēsop poster: a photograph filling the frame and one
 * short line of type. Nothing else on the sheet — no eyebrow, no subtitle, no
 * rule, no footnote.
 *
 * THE TYPE STANDS IN THE FRAME AND THE PICTURE IS NOT DARKENED. The owner's
 * three follow-ups settled that in order: "remove the darken wash, just keep it
 * neat", "I want the text to be in the centre", "forget about readability."
 * White heading, centre of an untouched photograph, no scrim — which reads the
 * way the poster does on the three dark pictures and does not on the other
 * three. When that matters the fix is a darker picture in the same slot; the
 * file name is the only thing that would change.
 *
 * WHICH COST THREE LINES PER CARD, AND THEY ARE NOT LOST. Each tile used to
 * carry the hub name over the top, the shelf's own sentence under the heading,
 * and "Reads your Skin & Hair Profile" (or "In Fitness") at the foot. All three
 * are printed at the top of the shop the card opens — `st-eyebrow` is the hub,
 * `st-line` is the sentence, `st-from` names the profile and links to it — so
 * the provenance is one tap away, at the moment somebody is actually looking at
 * a shortlist and wondering whose it is. The note under each grid still says
 * whose shelves these are. A card that repeats what the next screen opens with
 * is a card that has been read twice and used once.
 *
 * ── ONE COMPONENT BECAUSE "UNIFORM" IS A PROMISE, NOT A COINCIDENCE ─────────
 *
 * The Personalized Store and the Open Market drew the same markup twice, and
 * two copies of a card is how two floors of one district end up a few pixels
 * apart the first time either is edited. The shape lives here now: both pages
 * hand this a shelf and a destination, and neither can drift from the other
 * without the other moving too. The height is not measured from the text —
 * `aspect-ratio: 3 / 4`, the same proportion `.mstack .mshot` already uses —
 * so a long name and a short one occupy exactly the same tile.
 *
 * NO INLINE STYLE, and that is the ceiling talking rather than taste: the art
 * is an `<img>` with a class on it, never a `style={{ backgroundImage }}`.
 */
export function ShelfTile({ to, onClick, art, name, note, soon }: {
  /** Where the card goes, when it is a door. */
  to?: string;
  /** What it does, when it is not one. The grocery list is the only card in
   *  either room that hands a file over rather than opening a room, and the
   *  whole tile is the control — same as every other card, different verb. */
  onClick?: () => void;
  art: string;
  name: string;
  /**
   * THE ONE EXCEPTION TO "HEADING AND NOTHING ELSE", and it is one sentence.
   * A card that downloads a file has to say so before it is pressed, and a
   * card whose plan could not be read has to say THAT rather than draw a
   * heading over a photograph and let somebody press it for nothing. Every
   * other tile in both rooms passes none.
   */
  note?: string;
  /**
   * A SHELF THE CITY HAS NOT BUILT YET, and the state is drawn HERE rather
   * than passed in as a note by whichever page happens to render it. Two
   * pages writing "Coming soon" is two copies of one sentence, and the second
   * one is wrong the day somebody rewords the first. It is also the reason
   * neither page has to reach for `note`, which is the grocery card's alone.
   *
   * A soon tile is not a door — no `to`, no `onClick`, no cursor, nothing to
   * press. This district was deleted once on 10 Aug for being "a photograph
   * of a shop that did not exist"; a card that opens nothing has to be
   * unmistakably not a card that opens something.
   */
  soon?: boolean;
}) {
  /* THE CARD WAITS IN PAPER, NOT IN BLACK (whole-site walk, 23 Aug). The
     tile's resting ground was --media-bg, so until its lazy photograph
     arrived the shop was a field of black rectangles with invisible white
     headings — on the walked connection, for whole seconds. Until the art
     has painted, the card is the city's own paper with the name in ink; the
     photograph fades up when it lands and the type reverses with it. The
     ref-check covers the cached case, where a re-render can beat onLoad. */
  const [lit, setLit] = useState(false);
  const face = (
    <>
      {/* DECORATIVE ON PURPOSE. The heading beside it is the accessible name of
          the link, and an alt text repeating it would have a screen reader read
          the card twice. */}
      <img
        className="ec-art" src={`/assets/img/${art}`} alt="" loading="lazy"
        onLoad={() => setLit(true)}
        ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLit(true); }}
      />
      <span className="ec-face">
        <span className="ec-name">{name}</span>
        {soon ? <span className="ec-state">Coming soon</span> : note && <span className="ec-state">{note}</span>}
      </span>
    </>
  );
  if (soon) return <article className={`ec-card is-soon${lit ? ' is-lit' : ''}`} aria-disabled="true">{face}</article>;
  if (to) return <Link to={to} className={`ec-card ec-go${lit ? ' is-lit' : ''}`}>{face}</Link>;
  if (onClick) return <button type="button" className={`ec-card ec-go${lit ? ' is-lit' : ''}`} onClick={onClick}>{face}</button>;
  return <article className={`ec-card${lit ? ' is-lit' : ''}`}>{face}</article>;
}
