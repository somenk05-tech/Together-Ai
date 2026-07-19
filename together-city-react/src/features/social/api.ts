import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Social domain types — mirror the NestJS social module DTOs. */
export interface PostAuthor { id: string; handle: string; name: string; profileImage: string | null }
export interface PostMedia { id: string; url: string; kind: 'image' | 'video'; thumbUrl: string | null }
export interface Post {
  id: string;
  text: string | null;
  feeling: string | null;
  lat: number | null;
  lng: number | null;
  author: PostAuthor;
  media: PostMedia[];
  likes: number;
  comments: number;
  likedByMe: boolean;
  createdAt: string;
}
export interface FeedPage { items: Post[]; nextCursor: string | null }
export interface PostComment { id: string; postId: string; text: string; author: PostAuthor; createdAt: string }

/** Payload for creating a post — mirrors the backend `POST /social/posts` body. */
export interface CreatePostInput {
  text?: string;
  feeling?: string;
  media?: { url: string; kind: 'image' | 'video'; thumbUrl?: string | null }[];
  lat?: number;
  lng?: number;
}

export const socialApi = {
  feed: (cursor?: string) =>
    api.get<FeedPage>('/social/feed', { params: { cursor, limit: 20 } }).then((r) => r.data),
  map: () => api.get<Post[]>('/social/map').then((r) => r.data),
  followers: () => api.get<PostAuthor[]>('/social/followers').then((r) => r.data),
  following: () => api.get<PostAuthor[]>('/social/following').then((r) => r.data),
  create: (input: CreatePostInput) =>
    api.post<Post>('/social/posts', input).then((r) => r.data),
  remove: (postId: string) => api.delete<{ ok: boolean }>(`/social/posts/${postId}`).then((r) => r.data),
  like: (postId: string) =>
    api.post<{ postId: string; liked: boolean; likes: number }>(`/social/posts/${postId}/like`, {}).then((r) => r.data),
  comments: (postId: string) =>
    api.get<PostComment[]>(`/social/posts/${postId}/comments`).then((r) => r.data),
  comment: (postId: string, text: string) =>
    api.post<PostComment>(`/social/posts/${postId}/comments`, { text }).then((r) => r.data),
};

const FEED_KEY = ['social', 'feed'] as const;

export function useFeed() {
  return useQuery({ queryKey: FEED_KEY, queryFn: () => socialApi.feed() });
}
export function useMap() {
  return useQuery({ queryKey: ['social', 'map'], queryFn: () => socialApi.map() });
}
export function useFollowers() {
  return useQuery({ queryKey: ['social', 'followers'], queryFn: () => socialApi.followers() });
}
export function useFollowing() {
  return useQuery({ queryKey: ['social', 'following'], queryFn: () => socialApi.following() });
}
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => socialApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['social', 'map'] });
    },
  });
}
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => socialApi.like(postId),
    onSuccess: (res) => {
      qc.setQueryData<FeedPage>(FEED_KEY, (page) =>
        page
          ? { ...page, items: page.items.map((p) => (p.id === res.postId ? { ...p, likedByMe: res.liked, likes: res.likes } : p)) }
          : page,
      );
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
      void qc.invalidateQueries({ queryKey: FEED_KEY });
    },
  });
}
