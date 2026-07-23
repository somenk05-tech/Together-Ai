import { http as api } from '@/api/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked';

export interface ProfileStats { posts: number; reputation: number; cityPoints: number; connections: number; followers: number; following: number }

export interface MyProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  email: string | null; verified: boolean; memberSince: string; stats: ProfileStats;
}

export interface PublicProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  verified: boolean; memberSince: string; stats: ProfileStats; relationship: Relationship;
}

export interface ProfilePostMedia { url: string; kind: string; thumbUrl: string | null }
export interface ProfilePost {
  id: string; text: string | null; feeling: string | null; createdAt: string;
  outdoor: boolean; media: ProfilePostMedia[]; likeCount: number; commentCount: number;
}
export interface ProfilePostsPage { items: ProfilePost[]; nextCursor: string | null }

export interface PersonResult {
  id: string; handle: string; name: string; profileImage: string | null;
  city: string | null; verified: boolean; relationship: Relationship;
}

export interface UpdateProfileInput {
  name?: string; handle?: string; bio?: string; city?: string; website?: string;
}

export const myProfileApi = {
  me: () => api.get<MyProfile>('/profile/me').then((r) => r.data),
  update: (input: UpdateProfileInput) => api.patch<MyProfile>('/profile', input).then((r) => r.data),
  posts: (cursor?: string) =>
    api.get<ProfilePostsPage>('/profile/posts', { params: { cursor, limit: 18 } }).then((r) => r.data),
  searchPeople: (q: string) =>
    api.get<{ items: PersonResult[] }>('/profile/people/search', { params: { q } }).then((r) => r.data.items),
  publicProfile: (handle: string) =>
    api.get<PublicProfile>(`/profile/user/${encodeURIComponent(handle)}`).then((r) => r.data),
};

const ME_KEY = ['profile', 'me'] as const;

export function useMyProfile() {
  return useQuery({ queryKey: ME_KEY, queryFn: myProfileApi.me });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => myProfileApi.update(input),
    onSuccess: (data) => {
      qc.setQueryData(ME_KEY, data);
      void qc.invalidateQueries({ queryKey: ['profile', 'summary'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'master'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'completion'] });
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useMyPosts() {
  return useInfiniteQuery({
    queryKey: ['profile', 'posts'],
    queryFn: ({ pageParam }) => myProfileApi.posts(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePeopleSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['profile', 'people', query.toLowerCase()],
    queryFn: () => myProfileApi.searchPeople(query),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

export function usePublicProfile(handle: string | null) {
  return useQuery({
    queryKey: ['profile', 'user', (handle ?? '').toLowerCase()],
    queryFn: () => myProfileApi.publicProfile(handle as string),
    enabled: Boolean(handle),
  });
}
