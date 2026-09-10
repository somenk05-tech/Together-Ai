/**
 * ── THE READER IS A PAGE NOW (owner, 8 Sep) ─────────────────────────────────
 *
 * "fix the scroll feel that start on the edge, make it a completely new page."
 *
 * The reader used to be an overlay that expanded out of the tile you touched
 * (4 Sep) and then scrolled itself to that post. Two things were wrong with
 * it in use. It opened MID-POST — the column jumped to the tapped card, so the
 * picture arrived already cut off at the top, which is what "starts on the
 * edge" describes. And it was a dialog: no address, no browser Back, a second
 * scroll surface over a locked page, and a Close button pinned to a corner.
 *
 * So the column moved to a route of its own and the post you tapped is simply
 * the FIRST thing on it. There is nothing to scroll to on arrival, which is
 * the only way a page can reliably start at the top.
 *
 * These helpers are here rather than in Profile.tsx because the grid and the
 * reader are now two pages, and a link between two pages that each keep their
 * own idea of the address is a link that breaks the first time one moves.
 */
import type { Post } from './api';
import type { ProfilePost } from './myProfile.api';

/** A post with a clip in it plays on the television, not in the reader. */
export const hasVideo = (p: { media: Array<{ kind: string }> }) => p.media.some((m) => m.kind === 'video');

/** Together TV, tuned to one post. */
export const tvHref = (postId: string) => `/social/feed?post=${encodeURIComponent(postId)}`;

/**
 * The reader's address. `handle` is whose wall the column is read from — left
 * out, it is the citizen's own, which is also the only wall that carries the
 * cover and sorting tools. One route rather than two, because "read a wall
 * from this post" is one idea and a second route would be a second place for
 * it to be got wrong.
 */
export function readerHref(postId: string, handle?: string | null): string {
  const base = `/social/read/${encodeURIComponent(postId)}`;
  return handle ? `${base}?of=${encodeURIComponent(handle)}` : base;
}

/**
 * WHERE THE GRID PUTS YOU BACK. The reader is a page, so leaving it is browser
 * Back — and Back to a grid of ninety tiles lands you at the top of it, three
 * screens above the post you were just reading. The tile's id is left in
 * sessionStorage on the way out and taken (once) on the way back in, so the
 * grid can put that tile under your eye.
 *
 * sessionStorage rather than router state: Back does not carry state forward,
 * and a citizen who arrives at the grid any other way should not be scrolled.
 * `take` clears the key, so it can only ever fire for the return trip it was
 * written for.
 */
const RETURN_KEY = 'tc:social:return-to-tile';

export function rememberTile(postId: string): void {
  try { sessionStorage.setItem(RETURN_KEY, postId); } catch { /* private mode: the grid opens at the top */ }
}

export function takeRememberedTile(): string | null {
  try {
    const id = sessionStorage.getItem(RETURN_KEY);
    if (id) sessionStorage.removeItem(RETURN_KEY);
    return id;
  } catch { return null; }
}

/**
 * Map the profile's ProfilePost into the full feed Post shape so a wall can
 * render the exact same PostCard (like / comment / share / save / play / edit
 * / delete) as the city feed.
 */
export function profilePostToPost(
  p: ProfilePost,
  me?: { id: string; handle: string; name: string; profileImage: string | null },
): Post {
  const author = p.author ?? me ?? { id: '', handle: '', name: 'You', profileImage: null };
  return {
    id: p.id,
    text: p.text,
    feeling: p.feeling,
    audience: p.audience ?? 'public',
    placeName: p.placeName ?? null,
    tagged: p.tagged ?? [],
    lat: null,
    lng: null,
    author,
    media: p.media.map((m) => ({ id: `${p.id}:${m.url}`, url: m.url, kind: m.kind === 'video' ? 'video' : 'image', thumbUrl: m.thumbUrl })),
    likes: p.likeCount,
    comments: p.commentCount,
    likedByMe: p.likedByMe ?? false,
    savedByMe: p.savedByMe ?? false,
    createdAt: p.createdAt,
    hidden: p.hidden ?? false,
  };
}
