/**
 * ── THE ONE FACE IN THE CITY ────────────────────────────────────────────────
 *
 * WHAT THIS REPLACED: eight of itself. Every surface that shows a person had
 * written its own — the post header, the reels overlay, the social profile, the
 * settings profile, the connections row, the dating chats list, the astrology
 * profile, and a ninth in social/shared.tsx — and no two of them agreed on what
 * a face is. Three were near-verbatim copies of each other. Two could not draw
 * a photograph AT ALL: their props were `{ name }` and `{ label, color }`, so
 * the picture the server had already sent was dropped on the floor by a
 * component that had no parameter to receive it.
 *
 * THAT IS THE FAILURE THIS FILE EXISTS TO STOP, and it is the same argument the
 * shared `Fold` was written under: duplication is not a problem because there
 * are two of something, it is a problem when a copy can keep LOOKING correct
 * while quietly doing less. A fold that stops announcing itself; an avatar that
 * stops being a face. The citizen uploads a photograph on their profile page,
 * it reaches the wire, it reaches the connections list — and the connections
 * list draws their initials, because that copy never learned about photographs.
 *
 * THE PICTURE IS DECORATIVE, AND THAT IS DELIBERATE. `alt=""` on every one of
 * these: a face never appears without the person's name set beside it, and an
 * alt would have a screen reader read the name twice on every row. Where a face
 * would ever stand alone, the caller labels the control around it — the header
 * avatar does exactly that.
 *
 * THE INITIALS ARE A REAL ANSWER, not a grey hole. Two letters in the hub's own
 * accent tell you which of four rows is Priya's; a silhouette icon tells you
 * nothing eight times over.
 */

/** Two letters, from the words a person is actually called by. */
function initialsOf(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({
  src, name, size = 44, className,
}: {
  /** The uploaded photograph, as it arrives on the wire — a data URL today.
   *  `null` and `''` are the same answer and both fall through to initials. */
  src?: string | null;
  /** Always required, even with a photograph: it is what the initials are made
   *  of, and it is what stops a caller passing a picture with nobody in it. */
  name: string;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size, flexShrink: 0 } as const;
  if (src) {
    return (
      <img
        src={src} alt="" loading="lazy" decoding="async" className={className}
        style={{ ...box, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={className ? `tc-avatar ${className}` : 'tc-avatar'}
      style={{ ...box, fontSize: Math.max(10, Math.round(size / 2.9)) }}
    >
      {initialsOf(name)}
    </div>
  );
}
