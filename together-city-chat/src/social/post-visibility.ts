/**
 * What "removed" means for a post, in one place (BE-13.7).
 *
 * A moderator acting on a report sets Post.moderation to 'removed'. That has to
 * mean the post stops appearing — on the feed, on the author's grid, in a
 * profile count, in a reel. Fifteen places read Post, and a console that
 * recorded "removed" while the post carried on showing would be worse than no
 * console at all: it would let a moderator believe they had acted, and let the
 * citizen who reported it believe somebody had.
 *
 * So the filter is a value, not a habit. Spreading VISIBLE_ONLY into a `where`
 * is one line and hard to get subtly wrong, and moderation-reach.spec.ts fails
 * the build when a list read of Post appears without it.
 *
 * The author is the deliberate exception. Somebody whose post was removed
 * should be able to see that it was, rather than find a hole where their
 * evening went — silent disappearance is how people conclude the app is broken
 * and post it again.
 */

export const VISIBLE = 'visible';
export const REMOVED = 'removed';

/** Spread into any `where` that lists posts for somebody other than the author. */
export const VISIBLE_ONLY = { moderation: VISIBLE } as const;

export type ModerationState = typeof VISIBLE | typeof REMOVED;

/**
 * Posts a given viewer may see, moderation aside from audience.
 * The author sees their own removed post; nobody else does.
 */
export function visibleToViewer(
  post: { authorId: string; moderation?: string | null },
  viewerId: string,
): boolean {
  if ((post.moderation ?? VISIBLE) === VISIBLE) return true;
  return post.authorId === viewerId;
}

/**
 * The note shown on a removed post to the person who wrote it.
 *
 * It says what happened and does not say who reported it. A report that
 * identifies its reporter is a report nobody files twice.
 */
export function removedNotice(): string {
  return 'This post was removed by a moderator after it was reported. It is visible only to you.';
}
