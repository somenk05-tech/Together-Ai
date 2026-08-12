import { timeAgo } from './PostCard';
import type { Post } from './api';

/**
 * ONE MOMENT AS A POSTER.
 *
 * The feed used to give every post the same tall card: an author line, then the
 * photograph, then the caption, then five action buttons — the chrome repeated
 * once per post, and the picture, which is the reason anyone scrolls a feed at
 * all, got whatever was left. Three posts filled a laptop screen.
 *
 * A poster is the photograph, at 3:4, with the words set over it and the chrome
 * held back until somebody wants it. Nine moments to a screen, each of them
 * larger than the one card used to be.
 *
 * NOTHING HERE IS INVENTED. The picture is the post's own first image, or a
 * video's own cover frame; the headline is the post's own text; the two numbers
 * are its likes and its comments. Where a post has no picture there is no
 * picture: `words` sets it on the city's paper as a card, which is what a
 * Thought has always been, rather than dressing plain text up as a photograph.
 *
 * IT IS ONE BUTTON. The whole poster opens the post — no tap targets stacked
 * inside a tap target, and one accessible name that says whose moment it is.
 */
export function Poster({ post, isNew, onOpen }: {
  post: Post;
  isNew: boolean;
  onOpen: () => void;
}) {
  const image = post.media.find((m) => m.kind === 'image');
  const video = post.media.find((m) => m.kind === 'video');
  // A video counts as a picture only if it actually carries a cover frame. A
  // <video> element behind type would be a second thing to load and decode nine
  // times over, and a video with no cover has nothing to show anyway.
  const cover = image?.url ?? video?.thumbUrl ?? null;
  /**
   * EVERY PICTURE THE POST CARRIES, NOT JUST THE FIRST.
   *
   * A post with four photographs was showing one of them, on every surface, and
   * the other three existed only for somebody who opened it. On a phone the
   * poster IS the post — it fills the column — so a silent 3-in-4 loss of the
   * thing people came to look at is worth a horizontal scroll.
   *
   * Same rule as `cover` for what counts as a picture, applied to all of them
   * rather than to the first match: an image is its own url, a video is its
   * cover frame, and a video without one contributes nothing.
   */
  const covers = post.media
    .map((m) => (m.kind === 'image' ? m.url : m.thumbUrl))
    .filter((u): u is string => Boolean(u));
  const text = post.text?.trim() ?? '';
  const when = isNew ? 'now' : timeAgo(post.createdAt);

  // THE COUNT GOES IN THE ACCESSIBLE NAME AND NOT ONLY IN THE BADGE. The badge
  // is a number on a photograph; somebody who cannot see it should still be
  // told there are four, and told it in the one place this poster announces
  // itself, because there is nothing else to focus.
  const many = covers.length > 1 ? ` — ${covers.length} photographs` : '';
  const name = `${post.author.name}'s moment${post.placeName ? ` at ${post.placeName}` : ''}${many}${text ? `: ${text.slice(0, 80)}` : ''}`;

  const who = (
    <div className="poster-top">
      <div className="poster-who">{post.author.name} <span>@{post.author.handle}</span></div>
      <div className="poster-when">{when}</div>
    </div>
  );

  const meta = (
    <div className="poster-meta">
      <span>{post.likes} {post.likes === 1 ? 'like' : 'likes'}</span>
      <span>{post.comments} {post.comments === 1 ? 'comment' : 'comments'}</span>
      <span className="grow">Open</span>
    </div>
  );

  if (!cover) {
    return (
      <button type="button" onClick={onOpen} aria-label={name}
        className={`poster words${isNew ? ' fresh' : ''}`}>
        {who}
        <p className="poster-head">{text || 'A moment with nothing written on it.'}</p>
        {meta}
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} aria-label={name}
      className={`poster${isNew ? ' fresh' : ''}`}>
      {covers.length > 1 ? (
        /* NO ARROWS, NO DOTS, NO AUTOPLAY — a scroll, exactly like the arc in
           the Astrology zone. It is also the only shape available here: the
           poster is ONE button by design, and a control inside it would be a
           tap target stacked inside a tap target, which is the thing the note
           at the top of this file forbids. A swipe is not a click, so scrolling
           the strip never opens the post by accident.

           The count is `aria-hidden` and duplicated into the button's name
           above: it says how many pictures there are, never which one you are
           on, because nothing here tracks the scroll and a badge reading "1/4"
           after you have scrolled to the third is worse than no badge. */
        <span className="poster-strip">
          {covers.map((url, at) => (
            <img key={url} src={url} alt="" loading={at === 0 ? 'eager' : 'lazy'} />
          ))}
        </span>
      ) : (
        <img src={cover} alt="" loading="lazy" />
      )}
      {covers.length > 1 && <span className="poster-count" aria-hidden>{covers.length}</span>}
      <span className="poster-scrim" />
      {who}
      {video && !image && <span className="poster-play" />}
      <div className="poster-foot">
        {post.placeName && <p className="poster-place">{post.placeName}</p>}
        {text && <p className="poster-head">{text}</p>}
        {meta}
      </div>
    </button>
  );
}
