import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient, WS } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import type { Post, PostComment } from './api';

/**
 * ── THE FEED LISTENS (4 Sep audit) ──────────────────────────────────────────
 *
 * The gateway has fanned out `post:new`, `comment:new`, `like:changed` and
 * `post:deleted` to audience-scoped per-user rooms since 30 Aug, and the
 * front end subscribed to none of them: a like count went stale until a
 * reload, a comment arrived only if you re-opened the thread, and a post from
 * a friend sat on the server until the next fetch. This is the other half.
 *
 * Two rules, both about the reader's thumb:
 *
 *   • A NEW POST IS NEVER INSERTED UNDER IT. Inserting at the top shifts the
 *     wall while somebody is reading; the post is COUNTED instead, the feed
 *     shows "3 new posts", and the tap that reads them is the one that
 *     refetches and scrolls. Your own posts are the exception — useCreatePost
 *     already put them at the top, on purpose, because you want to see it.
 *
 *   • COUNTS ARE PATCHED IN PLACE, NEVER REFETCHED. `like:changed` carries
 *     the post's true total and who-tapped is somebody else's business — it
 *     never touches `likedByMe`. A comment bumps the number on the card and
 *     invalidates the thread only if that thread is open somewhere.
 */

type FeedInfinite = { pages: Array<{ items: Post[]; nextCursor: string | null }>; pageParams: unknown[] };
const FEED_KEY = ['social', 'feed'] as const;

/* A module store, because the count belongs to the feed as a place and not to
   whichever component happens to be mounted. */
let fresh = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => fresh;

/** How many posts have arrived since the feed was last read, and the way to say "read them". */
export function useFreshPosts(): { fresh: number; clear: () => void } {
  const n = useSyncExternalStore(subscribe, read, read);
  return { fresh: n, clear: () => { if (fresh) { fresh = 0; emit(); } } };
}

export function useSocialLive(): void {
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = user?.id;
  useEffect(() => {
    const patch = (postId: string, fn: (p: Post) => Post) => {
      const over = (items: Post[]) => items.map((p) => (p.id === postId ? fn(p) : p));
      const map = (data: FeedInfinite | undefined) => (data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: over(pg.items) })) } : data);
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, map);
      qc.setQueriesData<FeedInfinite>({ queryKey: ['social', 'bookmarks'] }, map);
      qc.setQueriesData<Post>({ queryKey: ['social', 'post', postId] }, (p) => (p ? fn(p) : p));
    };
    const offs = [
      socketClient.on<Post>(WS.SOCIAL_POST_NEW, (post) => {
        if (!post?.id || post.author?.id === me) return;
        fresh += 1;
        emit();
      }),
      socketClient.on<{ postId: string; likes: number }>(WS.SOCIAL_LIKE_CHANGED, ({ postId, likes }) => {
        if (!postId || typeof likes !== 'number') return;
        patch(postId, (p) => ({ ...p, likes }));
      }),
      socketClient.on<PostComment>(WS.SOCIAL_COMMENT_NEW, (c) => {
        if (!c?.postId || c.author?.id === me) return;
        patch(c.postId, (p) => ({ ...p, comments: p.comments + 1 }));
        // Only a thread somebody is reading is worth a request.
        void qc.invalidateQueries({ queryKey: ['social', 'comments', c.postId], refetchType: 'active' });
      }),
      socketClient.on<{ postId: string }>(WS.SOCIAL_POST_DELETED, ({ postId }) => {
        if (!postId) return;
        const drop = (data: FeedInfinite | undefined) =>
          (data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== postId) })) } : data);
        qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, drop);
        qc.setQueriesData<FeedInfinite>({ queryKey: ['social', 'bookmarks'] }, drop);
      }),
    ];
    return () => { for (const off of offs) off(); };
  }, [qc, me]);
}
