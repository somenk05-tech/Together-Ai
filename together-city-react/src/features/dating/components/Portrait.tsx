import { useState } from 'react';

/**
 * A PHOTOGRAPH THAT IS ALLOWED TO FAIL, AND A LETTER WHEN IT DOES. (28 Aug.)
 *
 * Every dating photograph is fetched through `GET /dating/photo/:token`, and
 * that route answers 404 for every refusal ALIKE — a signature it does not
 * like, a link that has expired, a photo pulled in review, a person blocked, a
 * profile hidden since the card was built, an object missing from the bucket.
 * That is deliberate: a caller who can tell those apart is an oracle for
 * whoever holds the string. It also means a failed photo is a NORMAL outcome
 * on this path, not an exception, and the card has to be able to survive one.
 *
 * It could not. Each of these four places rendered a bare <img> whose only
 * fallback was the src being absent, so a src that was PRESENT and refused
 * gave the browser's broken-image glyph — a black frame with a torn page in
 * it, in the middle of somebody's face, on the screen where the city shows
 * you the people who chose you back.
 *
 * The letter was always the right answer and was already written; it was
 * only reachable when the server sent nothing. Now it is reachable when the
 * server sends something that does not load, which is the same fact about
 * the same card. The failed src is REMEMBERED rather than a boolean, so a
 * carousel moving to the next photograph tries that one honestly.
 */
export function Portrait({ src, fallback, className, alt = '', draggable }: {
  src?: string | null;
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
  draggable?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return (
    <img className={className} src={src} alt={alt} loading="lazy" draggable={draggable}
      onError={() => setFailed(src)} />
  );
}
