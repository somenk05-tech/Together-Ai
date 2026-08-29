import type { ReactNode } from 'react';

/**
 * ── THE MARKS UNDER A MOMENT ────────────────────────────────────────────────
 *
 * The owner's two editorial references, 29 Aug — the video sheet and the photo
 * card — set the same row at the foot: outlined marks at one weight, in five
 * hues, with their words beside them. The card has four of them (no like); the
 * sheet has five. That is the whole difference, and it is why these live in a
 * file of their own rather than in either surface: a second copy of an icon
 * still LOOKS correct while the two rows drift a stroke-width apart.
 *
 * Colour comes from `currentColor`, set per action by social.css from the
 * --mark-* tokens, so the hue lives in tokens.css where every other colour in
 * the application lives instead of in a stroke attribute here.
 *
 * `fill` varies, and only for the two that are STATES: a like and a save. The
 * reference draws its heart solid, and filling the mark is how the row says
 * "you already did this" without a second colour or a second word.
 */
const Ico = ({ children, fill = 'none' }: { children: ReactNode; fill?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const HeartIcon = ({ filled }: { filled: boolean }) => (
  <Ico fill={filled ? 'currentColor' : 'none'}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
  </Ico>
);

/* A circle with a tail, which is the reference's bubble — not the squared
   speech balloon the tab bars of five other apps use. */
export const CommentIcon = () => (
  <Ico><circle cx="12.4" cy="10.9" r="8.1" /><path d="M7.2 17.4L4 21l4.6-1.3" /></Ico>
);

export const SendIcon = () => (
  <Ico><path d="M21.5 2.5L10.8 13.2" /><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z" /></Ico>
);

export const SaveIcon = ({ filled }: { filled: boolean }) => (
  <Ico fill={filled ? 'currentColor' : 'none'}>
    <path d="M18.5 21L12 16.3 5.5 21V4.8a1.8 1.8 0 0 1 1.8-1.8h9.4a1.8 1.8 0 0 1 1.8 1.8z" />
  </Ico>
);

/* Share is three points joined, not a second paper plane: sending a moment to
   one person and putting it back into the city are different verbs, and the
   row has one mark for each. */
export const ShareIcon = () => (
  <Ico>
    <circle cx="18" cy="5.2" r="2.8" /><circle cx="6" cy="12" r="2.8" /><circle cx="18" cy="18.8" r="2.8" />
    <path d="M8.5 10.6l7-3.9" /><path d="M8.5 13.4l7 3.9" />
  </Ico>
);

/* The place mark on the card's right-hand column. The one filled mark in the
   set, because the reference's is filled and because a pin outline at 15px is
   a shape nobody reads. */
export const PlaceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a7 7 0 0 0-7 7c0 5.1 6.2 12.3 6.4 12.6a.8.8 0 0 0 1.2 0C12.8 21.3 19 14.1 19 9a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z" />
  </svg>
);
