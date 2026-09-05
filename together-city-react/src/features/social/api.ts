import { http as api } from '@/api/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Social domain types — mirror the NestJS social module DTOs. */
export interface PostAuthor { id: string; handle: string; name: string; profileImage: string | null }
/**
 * A person on the blocked list. `handle` and `profileImage` are null, and the
 * name is the one Dating showed, for somebody this citizen can only have met
 * there — blocking a match must not be a way of learning who they are.
 */
export interface BlockedPerson { id: string; handle: string | null; name: string; profileImage: string | null }
/** A follower/following row with the viewer's follow-state for Follow / Following / Follow back. */
export interface FollowPerson extends PostAuthor { iFollow: boolean; followsMe: boolean }
/** `state` (5 Sep): a video is 'processing' from the post until the server's
 *  worker has made it playable everywhere, 'ready' after, 'failed' if it
 *  could not be read. Absent on rows written before the column: ready. */
export interface PostMedia { id: string; url: string; kind: 'image' | 'video'; thumbUrl: string | null; state?: 'ready' | 'processing' | 'failed' }
export interface Post {
  id: string;
  text: string | null;
  feeling: string | null;
  audience?: string;
  placeName?: string | null;
  tagged?: Array<{ id: string; name: string; handle: string }>;
  lat: number | null;
  lng: number | null;
  author: PostAuthor;
  media: PostMedia[];
  likes: number;
  comments: number;
  likedByMe: boolean;
  /** A bookmark on the account — a row, not a device snapshot (4 Sep). Absent
   *  from a server older than this field, which reads as "not saved". */
  savedByMe?: boolean;
  createdAt: string;
  /** Attached royalty-free soundtrack (library track) played over reels. */
  musicUrl?: string | null;
  musicTitle?: string | null;
  /** Set when this feed entry is a repost — who shared it. */
  repostedBy?: { name: string; handle: string } | null;
  /** Unique key per feed entry (repost id); falls back to id for originals. */
  key?: string;
}
export interface FeedPage { items: Post[]; nextCursor: string | null }
export interface PostComment { id: string; postId: string; text: string; author: PostAuthor; createdAt: string }

/** One page of a cursor-paginated list. Same shape the feed already returns. */
export interface Page<T> { items: T[]; nextCursor: string | null }

/**
 * ── READ A PAGE FROM A SERVER THAT MAY NOT SEND PAGES YET ───────────────────
 *
 * Comments, Followers and Following returned bare arrays until 30 Aug and
 * return `{ items, nextCursor }` now. The web app deploys to Vercel and the API
 * to Railway, INDEPENDENTLY, so there is always a window where this frontend is
 * live against the previous backend — minutes usually, longer when a build
 * queues. `mira-tolerates-an-older-server.test.ts` is in this repo because that
 * window has already cost a working feature once.
 *
 * A shape change is the worst version of that: not a missing field, an
 * `undefined.map`. So the array is still accepted, as a single page with
 * nothing after it — which is exactly what an unpaginated server was always
 * saying.
 */
export function asPage<T>(body: Page<T> | T[] | null | undefined): Page<T> {
  if (Array.isArray(body)) return { items: body, nextCursor: null };
  return { items: body?.items ?? [], nextCursor: body?.nextCursor ?? null };
}

/** Payload for creating a post — mirrors the backend `POST /social/posts` body. */
export interface CreatePostInput {
  text?: string;
  feeling?: string;
  audience?: 'public' | 'friends' | 'family' | 'private';
  category?: 'work' | 'personal';
  musicUrl?: string;
  musicTitle?: string;
  placeName?: string;
  tagged?: Array<{ id: string; name: string; handle: string }>;
  media?: { url: string; kind: 'image' | 'video'; thumbUrl?: string | null }[];
  lat?: number;
  lng?: number;
}

export const socialApi = {
  feed: (cursor?: string, filter?: string) =>
    api.get<FeedPage>('/social/feed', { params: { cursor, limit: 20, ...(filter ? { filter } : {}) } }).then((r) => r.data),
  followers: (cursor?: string) =>
    api.get<Page<FollowPerson> | FollowPerson[]>('/social/followers', { params: { cursor, limit: 30 } }).then((r) => asPage(r.data)),
  following: (cursor?: string) =>
    api.get<Page<FollowPerson> | FollowPerson[]>('/social/following', { params: { cursor, limit: 30 } }).then((r) => asPage(r.data)),
  // BY HANDLE. The API stopped accepting a raw user id here (and on block) —
  // an id off an anonymous Dating card must not resolve to a city identity.
  follow: (person: { handle: string }) =>
    api.post<{ following: boolean; userId: string }>('/social/follow', person).then((r) => r.data),
  unfollow: (userId: string) =>
    api.delete<{ following: boolean; userId: string }>(`/social/follow/${userId}`).then((r) => r.data),
  /** One post by id — the destination of a shared card's link. */
  one: (postId: string) => api.get<Post>(`/social/posts/${postId}`).then((r) => r.data),
  create: (input: CreatePostInput) =>
    api.post<Post>('/social/posts', input).then((r) => r.data),
  remove: (postId: string) => api.delete<{ ok: boolean }>(`/social/posts/${postId}`).then((r) => r.data),
  update: (postId: string, text: string) => api.patch<Post>(`/social/posts/${postId}`, { text }).then((r) => r.data),
  setCategory: (postId: string, category: 'work' | 'personal' | null) =>
    api.patch<Post>(`/social/posts/${postId}`, { category }).then((r) => r.data),
  like: (postId: string) =>
    api.post<{ postId: string; liked: boolean; likes: number }>(`/social/posts/${postId}/like`, {}).then((r) => r.data),
  comments: (postId: string, cursor?: string) =>
    api.get<Page<PostComment> | PostComment[]>(`/social/posts/${postId}/comments`, { params: { cursor, limit: 30 } })
      .then((r) => asPage(r.data)),
  comment: (postId: string, text: string) =>
    api.post<PostComment>(`/social/posts/${postId}/comments`, { text }).then((r) => r.data),
  deleteComment: (postId: string, commentId: string) =>
    api.delete<{ ok: boolean; id: string }>(`/social/posts/${postId}/comments/${commentId}`).then((r) => r.data),
  // Safety
  blocks: () => api.get<BlockedPerson[]>('/social/blocks').then((r) => r.data),
  block: (person: { handle: string }) =>
    api.post<{ blocked: boolean; userId: string }>('/social/block', person).then((r) => r.data),
  unblock: (userId: string) =>
    api.delete<{ blocked: boolean; userId: string }>(`/social/block/${userId}`).then((r) => r.data),
  report: (input: { targetType: 'user' | 'post' | 'comment'; targetId: string; reason?: string }) =>
    api.post<{ reported: boolean }>('/social/report', input).then((r) => r.data),
  setCover: (postId: string, time: number) =>
    api.patch<{ ok: boolean; thumbUrl: string }>(`/social/posts/${postId}/cover`, { time }).then((r) => r.data),
  repost: (postId: string) =>
    api.post<{ reposted: boolean }>(`/social/posts/${postId}/repost`, {}).then((r) => r.data),
  // Saved posts live on the account now. `postId` in the answer is the post
  // that RENDERS — a save on a repost row bookmarks the original.
  bookmark: (postId: string) =>
    api.post<{ postId: string; saved: boolean }>(`/social/posts/${postId}/bookmark`, {}).then((r) => r.data),
  bookmarks: (cursor?: string) =>
    api.get<Page<Post> | Post[]>('/social/bookmarks', { params: { cursor, limit: 30 } }).then((r) => asPage(r.data)),
  syncBookmarks: (postIds: string[]) =>
    api.post<{ saved: number }>('/social/bookmarks/sync', { postIds }).then((r) => r.data),
};

const FEED_KEY = ['social', 'feed'] as const;
const BOOKMARKS_KEY = ['social', 'bookmarks'] as const;

/** React Query's infinite-query cache shape for a feed. */
type FeedInfinite = { pages: FeedPage[]; pageParams: unknown[] };

/** Apply a transform to every post across every cached feed page. */
function mapFeedPosts(data: FeedInfinite | undefined, fn: (items: Post[]) => Post[]): FeedInfinite | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((pg) => ({ ...pg, items: fn(pg.items) })) };
}

/**
 * Cursor-paginated feed as an INFINITE query, so "load more" reaches past the
 * first page. (It was a plain useQuery that ignored nextCursor, capping the
 * feed at ~20 posts.)
 */
export function useFeed(filter = 'foryou') {
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, filter],
    queryFn: ({ pageParam }) => socialApi.feed(pageParam, filter),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    /**
     * THE WORST CLIENT-INITIATED LOAD IN THE HUB (30 Aug audit).
     *
     * With the defaults — `staleTime: 0` and `refetchOnWindowFocus: true` —
     * React Query refetches EVERY LOADED PAGE of an infinite query when the tab
     * regains focus. A citizen who had scrolled ten pages, switched to a
     * message and come back fired ten feed requests and two hundred backend
     * queries, every time, on a train.
     *
     * Thirty seconds is the compromise: long enough that flicking between
     * tabs, or between this hub and another, costs nothing; short enough that
     * coming back to the feed after a coffee still shows the morning's posts.
     * A like or a comment still patches its own post in place, so the number
     * under somebody's thumb is never waiting on this.
     */
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    /* Ten pages of media is a lot of retained JavaScript on a phone. Older
       pages are dropped and re-fetched if the citizen scrolls back that far,
       which is rarer than the memory is precious. */
    maxPages: 6,
  });
}
/** Cursor-paginated: a citizen with ten thousand followers used to load all of
 *  them to render the first screenful. */
export function useFollowers() {
  return useInfiniteQuery({
    queryKey: ['social', 'followers'],
    queryFn: ({ pageParam }) => socialApi.followers(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (person: { handle: string }) => socialApi.follow(person),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['social', 'followers'] });
      void qc.invalidateQueries({ queryKey: ['social', 'following'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
export function useUnfollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => socialApi.unfollow(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['social', 'followers'] });
      void qc.invalidateQueries({ queryKey: ['social', 'following'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
export function useFollowing() {
  return useInfiniteQuery({
    queryKey: ['social', 'following'],
    queryFn: ({ pageParam }) => socialApi.following(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => socialApi.create(input),
    onSuccess: (post) => {
      // Optimistically insert the new post at the TOP of the first page of every
      // cached feed filter so it shows instantly, before the background refetch.
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) => {
        if (!data) return data;
        if (data.pages.some((pg) => pg.items.some((p) => p.id === post.id))) return data;
        const [first, ...rest] = data.pages;
        const firstPage: FeedPage = first ?? { items: [], nextCursor: null };
        return { ...data, pages: [{ ...firstPage, items: [post, ...firstPage.items] }, ...rest] };
      });
      void qc.invalidateQueries({ queryKey: FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['social', 'map'] });
    },
  });
}
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.remove(postId),
    onSuccess: (_r, postId) => {
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) =>
        mapFeedPosts(data, (items) => items.filter((p) => p.id !== postId)));
      qc.setQueriesData<FeedInfinite>({ queryKey: BOOKMARKS_KEY }, (data) =>
        mapFeedPosts(data, (items) => items.filter((p) => p.id !== postId)));
      void qc.invalidateQueries({ queryKey: ['social', 'map'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      // Keep the profile grid in sync — a delete from either place removes it here too.
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}
export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; text: string }) => socialApi.update(v.postId, v.text),
    onSuccess: (updated) => {
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) =>
        mapFeedPosts(data, (items) => items.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))));
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}
export function useSetPostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; category: 'work' | 'personal' | null }) => socialApi.setCategory(v.postId, v.category),
    onSuccess: () => {
      // Re-sort the profile grid (the Personal/Work tabs read category).
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
      void qc.invalidateQueries({ queryKey: FEED_KEY });
    },
  });
}
/**
 * Patch one post wherever it is cached — every feed lens, the Saved page and
 * the permalink — so a heart or a bookmark reads the same on all of them.
 */
function patchPost(qc: ReturnType<typeof useQueryClient>, postId: string, fn: (p: Post) => Post) {
  const over = (items: Post[]) => items.map((p) => (p.id === postId ? fn(p) : p));
  qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) => mapFeedPosts(data, over));
  qc.setQueriesData<FeedInfinite>({ queryKey: BOOKMARKS_KEY }, (data) => mapFeedPosts(data, over));
  qc.setQueriesData<Post>({ queryKey: ['social', 'post', postId] }, (p) => (p ? fn(p) : p));
  /* AND THE PROFILE GRIDS (4 Sep). They hold ProfilePost rows, a narrower
     shape the reader maps into Post; the two flags a tap changes are the same
     names in both, so the patch is applied to the fields they share and the
     grid's Save and heart agree with the feed's without a refetch. */
  const overProfile = (items: ProfilePostLike[]) => items.map((p) => {
    if (p.id !== postId) return p;
    const next = fn({ ...(p as unknown as Post), likes: p.likeCount, comments: p.commentCount });
    return { ...p, likedByMe: next.likedByMe, savedByMe: next.savedByMe, likeCount: next.likes, commentCount: next.comments };
  });
  for (const key of [['profile', 'posts'], ['profile', 'user-posts']]) {
    qc.setQueriesData<ProfileInfinite>({ queryKey: key }, (data) =>
      data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: overProfile(pg.items) })) } : data);
  }
}
type ProfilePostLike = { id: string; likeCount: number; commentCount: number; likedByMe?: boolean; savedByMe?: boolean };
type ProfileInfinite = { pages: Array<{ items: ProfilePostLike[]; nextCursor: string | null }>; pageParams: unknown[] };

/** What the caches held for a post before an optimistic write, for the rollback. */
function snapshotPost(qc: ReturnType<typeof useQueryClient>, postId: string): Post | undefined {
  for (const [, data] of qc.getQueriesData<FeedInfinite>({ queryKey: FEED_KEY })) {
    const hit = data?.pages.flatMap((pg) => pg.items).find((p) => p.id === postId);
    if (hit) return hit;
  }
  return qc.getQueryData<Post>(['social', 'post', postId]);
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.like(postId),
    /**
     * THE HEART FILLS ON THE TAP (4 Sep audit). It waited for the round trip,
     * which on a phone on a train is the half-second in which a citizen taps
     * again. The cache is patched before the request and put back if the
     * request fails; the server's answer is then the truth for both fields.
     */
    onMutate: (postId) => {
      const before = snapshotPost(qc, postId);
      patchPost(qc, postId, (p) => ({ ...p, likedByMe: !p.likedByMe, likes: Math.max(0, p.likes + (p.likedByMe ? -1 : 1)) }));
      return { before };
    },
    onError: (_e, postId, ctx) => {
      const before = ctx?.before;
      if (before) patchPost(qc, postId, (p) => ({ ...p, likedByMe: before.likedByMe, likes: before.likes }));
    },
    onSuccess: (res) => {
      // Was setQueryData(FEED_KEY) — the exact key ['social','feed'], which no
      // component subscribes to (the live key is ['social','feed',filter]). Use
      // setQueriesData (partial match) over the infinite cache so the heart and
      // count actually update.
      patchPost(qc, res.postId, (p) => ({ ...p, likedByMe: res.liked, likes: res.likes }));
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}

/** The Saved page — bookmarks on the account, newest first, a page at a time. */
export function useBookmarks() {
  return useInfiniteQuery({
    queryKey: BOOKMARKS_KEY,
    queryFn: ({ pageParam }) => socialApi.bookmarks(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * Save or unsave, optimistically, everywhere the post is cached. The Saved
 * list itself is re-read afterwards rather than patched: an unsave removes a
 * row, a save adds one at the top, and both are the server's to order.
 */
export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.bookmark(postId),
    onMutate: (postId) => {
      const before = snapshotPost(qc, postId);
      patchPost(qc, postId, (p) => ({ ...p, savedByMe: !p.savedByMe }));
      return { before };
    },
    onError: (_e, postId, ctx) => {
      const before = ctx?.before;
      if (before) patchPost(qc, postId, (p) => ({ ...p, savedByMe: before.savedByMe ?? false }));
    },
    onSuccess: (res) => {
      patchPost(qc, res.postId, (p) => ({ ...p, savedByMe: res.saved }));
      void qc.invalidateQueries({ queryKey: BOOKMARKS_KEY });
    },
  });
}
/** One post, for the permalink page a share link opens. */
export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ['social', 'post', postId],
    queryFn: () => socialApi.one(postId as string),
    enabled: Boolean(postId),
    // A permalink is opened once and read; refetching it on every window focus
    // buys nothing and costs a signed-URL round trip.
    staleTime: 60_000,
    retry: false,
  });
}
/** Oldest first, a page at a time — a comment thread is read as a conversation
 *  and a conversation starts at the beginning. The 501st comment used to exist,
 *  be counted on the card, and be reachable by nobody. */
export function useComments(postId: string | null) {
  return useInfiniteQuery({
    queryKey: ['social', 'comments', postId],
    queryFn: ({ pageParam }) => socialApi.comments(postId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(postId),
  });
}
export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; text: string }) => socialApi.comment(v.postId, v.text),
    onSuccess: (_c, v) => {
      void qc.invalidateQueries({ queryKey: ['social', 'comments', v.postId] });
      // Bump just this post's comment count in place — no full feed refetch
      // (which reloaded/reordered the feed and lost the reader's scroll).
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) =>
        mapFeedPosts(data, (items) => items.map((p) => (p.id === v.postId ? { ...p, comments: p.comments + 1 } : p))));
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}

/**
 * Remove a comment — yours, or one on your own post.
 *
 * Until 30 Aug there was no route for this at all: the only remedy for abuse in
 * your comments was deleting your own post. The count on the card comes down
 * in place, the same way `useAddComment` puts it up, so the number and the list
 * agree without refetching the feed under the reader's thumb.
 */
export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; commentId: string }) => socialApi.deleteComment(v.postId, v.commentId),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['social', 'comments', v.postId] });
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) =>
        mapFeedPosts(data, (items) => items.map((p) => (p.id === v.postId ? { ...p, comments: Math.max(0, p.comments - 1) } : p))));
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}

export function useBlocks() {
  return useQuery({ queryKey: ['social', 'blocks'], queryFn: () => socialApi.blocks() });
}
export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (person: { handle: string }) => socialApi.block(person),
    onSuccess: () => {
      // A block hides their content — drop everything and refetch the world.
      void qc.invalidateQueries({ queryKey: ['social'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
export function useUnblock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => socialApi.unblock(userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['social', 'blocks'] }),
  });
}
export function useReport() {
  return useMutation({
    mutationFn: (input: { targetType: 'user' | 'post' | 'comment'; targetId: string; reason?: string }) =>
      socialApi.report(input),
  });
}
export function useRepost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.repost(postId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
export function useSetCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; time: number }) => socialApi.setCover(v.postId, v.time),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
      void qc.invalidateQueries({ queryKey: FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['social', 'map'] });
    },
  });
}
