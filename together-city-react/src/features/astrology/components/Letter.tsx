import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * The page the letter is printed on.
 *
 * IT WAS A CARD ON THE ROOM'S GROUND. The astrology hub is near-black, and the
 * letter sat in it as a raised charcoal panel with a drop cap — which read, the
 * owner said, as a long article inside a dashboard. It is a PAGE now: its own
 * paper, its own ink, its own measure, and no container. The room around it is
 * unchanged; the sidebar is untouched, deliberately and by instruction.
 *
 * `label` is where you are — TODAY, AUGUST 2026 — set small and quiet, because
 * the sidebar has already said it once and a second shout is a heading. `title`
 * is what the letter is ABOUT, which is the only thing on the page allowed to
 * be large. It is optional: letters written before titles existed are still in
 * the archive, and the composition simply closes up around a missing one.
 */
export function LetterSky({ label, title, children }: { label?: string; title?: string; children: ReactNode }) {
  return (
    <section className="letter-page">
      <div className="letter-inner">
        {label && <p className="letter-label">{label}</p>}
        {title && <h1 className="letter-title">{title}</h1>}
        {children}
      </div>
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
      {/* "With care," and nothing under it. The company does not sign its own
          letters — see SIGN_OFF in the backend for why. */}
      <p className="letter-sign">{signOff}</p>
    </>
  );
}

/**
 * Everything that is not a letter, said in the letter's own voice.
 *
 * These states used to be a spinner, an EmptyState titled "Couldn't reach the
 * stars", and a card telling the citizen to complete their birth details. On
 * this surface they are sentences, because a modal-looking box appearing on the
 * paper is exactly the furniture the page was stripped of.
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
