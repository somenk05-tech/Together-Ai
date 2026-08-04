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
  const text = post.text?.trim() ?? '';
  const when = isNew ? 'now' : timeAgo(post.createdAt);

  const name = `${post.author.name}'s moment${post.placeName ? ` at ${post.placeName}` : ''}${text ? `: ${text.slice(0, 80)}` : ''}`;

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
      <img src={cover} alt="" loading="lazy" />
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
