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
export interface PostMedia { id: string; url: string; kind: 'image' | 'video'; thumbUrl: string | null }
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
  followers: () => api.get<FollowPerson[]>('/social/followers').then((r) => r.data),
  following: () => api.get<FollowPerson[]>('/social/following').then((r) => r.data),
  // BY HANDLE. The API stopped accepting a raw user id here (and on block) —
  // an id off an anonymous Dating card must not resolve to a city identity.
  follow: (person: { handle: string }) =>
    api.post<{ following: boolean; userId: string }>('/social/follow', person).then((r) => r.data),
  unfollow: (userId: string) =>
    api.delete<{ following: boolean; userId: string }>(`/social/follow/${userId}`).then((r) => r.data),
  create: (input: CreatePostInput) =>
    api.post<Post>('/social/posts', input).then((r) => r.data),
  remove: (postId: string) => api.delete<{ ok: boolean }>(`/social/posts/${postId}`).then((r) => r.data),
  update: (postId: string, text: string) => api.patch<Post>(`/social/posts/${postId}`, { text }).then((r) => r.data),
  setCategory: (postId: string, category: 'work' | 'personal' | null) =>
    api.patch<Post>(`/social/posts/${postId}`, { category }).then((r) => r.data),
  like: (postId: string) =>
    api.post<{ postId: string; liked: boolean; likes: number }>(`/social/posts/${postId}/like`, {}).then((r) => r.data),
  comments: (postId: string) =>
    api.get<PostComment[]>(`/social/posts/${postId}/comments`).then((r) => r.data),
  comment: (postId: string, text: string) =>
    api.post<PostComment>(`/social/posts/${postId}/comments`, { text }).then((r) => r.data),
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
};

const FEED_KEY = ['social', 'feed'] as const;

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
  });
}
export function useFollowers() {
  return useQuery({ queryKey: ['social', 'followers'], queryFn: () => socialApi.followers() });
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
  return useQuery({ queryKey: ['social', 'following'], queryFn: () => socialApi.following() });
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
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.like(postId),
    onSuccess: (res) => {
      // Was setQueryData(FEED_KEY) — the exact key ['social','feed'], which no
      // component subscribes to (the live key is ['social','feed',filter]). Use
      // setQueriesData (partial match) over the infinite cache so the heart and
      // count actually update.
      qc.setQueriesData<FeedInfinite>({ queryKey: FEED_KEY }, (data) =>
        mapFeedPosts(data, (items) =>
          items.map((p) => (p.id === res.postId ? { ...p, likedByMe: res.liked, likes: res.likes } : p))));
      void qc.invalidateQueries({ queryKey: ['profile', 'posts'] });
    },
  });
}
export function useComments(postId: string | null) {
  return useQuery({
    queryKey: ['social', 'comments', postId],
    queryFn: () => socialApi.comments(postId as string),
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
