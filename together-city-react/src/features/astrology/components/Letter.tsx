import { Link } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';

/**
 * Marks the page as a letter for as long as one is on screen.
 *
 * The footer is global chrome and is not restyled globally — the other three
 * screens in this hub are ordinary light pages and need the ordinary light
 * footer. This sets `data-surface="letter"` on <html> while the surface is
 * mounted and removes it on the way out, which is the same mechanism
 * useHubTheme() already uses for `data-hub`. A rule scoped to it cannot leak to
 * a page that is not a letter, and cannot survive one.
 */
function useLetterSurface(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-surface', 'letter');
    return () => root.removeAttribute('data-surface');
  }, []);
}

/**
 * The letter surface — the whole of the daily and monthly guidance screens.
 *
 * There is no card here, no header, no chips, no sections and no icons, and
 * that is the design rather than an omission. The page this replaced put a
 * five-panel report on a white card under a heading that named the birth chart,
 * the transits, the running period and the numerology in its opening sentence.
 * What a citizen is meant to receive is a letter from someone who has been
 * paying attention, and a letter does not arrive with a legend.
 *
 * THE ARTWORK IS AN <img> AND SITS BELOW THE WRITING. Nothing is ever laid over
 * it. The upper area is flat ground the exact colour of the illustration's own
 * top edge, so however long the letter runs the sky simply continues.
 */

/** The sky, and whatever is written on it. */
export function LetterSky({ children }: { children: ReactNode }) {
  useLetterSurface();
  return (
    <section className="letter-sky">
      <div className="letter-sky-body">{children}</div>
      <picture>
        <source media="(max-width: 780px)" srcSet="/assets/img/guidance-sky-tall.webp" />
        <img className="letter-sky-art" src="/assets/img/guidance-sky-wide.webp" alt="" />
      </picture>
    </section>
  );
}

/**
 * One letter.
 *
 * Paragraphs come from the server already split, and are rendered as they
 * arrive. Nothing here reformats them, adds a heading or inserts a divider —
 * the point of the whole exercise is that the writing is the only thing with a
 * say in how it reads.
 */
export function LetterBody({ salutation, body, signOff }: { salutation: string; body: string; signOff: string }) {
  const paragraphs = body.split('\n\n').map((p) => p.trim()).filter(Boolean);
  return (
    <>
      <p className="letter-open">{salutation}</p>
      {paragraphs.map((p, i) => <p key={i} className="letter-p">{p}</p>)}
      <p className="letter-sign">{signOff}</p>
    </>
  );
}

/**
 * Everything that is not a letter, said in the letter's own voice.
 *
 * These states used to be a spinner, an EmptyState titled "Couldn't reach the
 * stars", and a card telling the citizen to complete their birth details. On
 * this surface they are sentences, because a modal-looking box appearing over
 * the sky is exactly the furniture the page was stripped of.
 */
export function LetterNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <p className="letter-p" style={{ marginBottom: action ? 22 : 0 }}>{children}</p>
      {action}
    </>
  );
}

/** The one thing we cannot write a letter without. */
export function NeedsBirthDetails() {
  return (
    <LetterNote action={<Link className="letter-link" to="/profile/astrology">Add your details</Link>}>
      There is no letter here yet, because writing one to you means knowing when and where you were
      born. It is asked once and shared across everything else you use, so you will not be asked
      again.
    </LetterNote>
  );
}
