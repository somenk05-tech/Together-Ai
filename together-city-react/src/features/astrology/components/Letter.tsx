import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/** The sky, and whatever is written on it. */
export function LetterSky({ children }: { children: ReactNode }) {
  return (
    <section className="letter-sky">
      {/* THE SKY GOES FIRST. It sat after the sign-off, which is where it made
          sense when the letter was a night surface and the picture was the
          ground the words were printed on — there was no "before" or "after",
          only behind. On a white letter it became a strip of space after the
          last line, and a picture below a signature is an afterthought. It is
          the letterhead now: you see the sky, then you read the letter. */}
      <picture className="letter-sky-frame">
        <source media="(max-width: 780px)" srcSet="/assets/img/guidance-sky-tall.webp" />
        <img className="letter-sky-art" src="/assets/img/guidance-sky-wide.webp" alt="" />
      </picture>
      <div className="letter-sky-body">{children}</div>
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
