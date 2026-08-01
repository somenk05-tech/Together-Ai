import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { UserSchema, type User } from './schemas';

export const RelationshipSchema = z.enum(['none', 'pending_out', 'pending_in', 'accepted', 'blocked']);
export type Relationship = z.infer<typeof RelationshipSchema>;

/** Result of an exact-handle lookup (private discovery). null when no match. */
export const LookupSchema = z
  .object({
    id: z.string(),
    handle: z.string(),
    name: z.string(),
    profileImage: z.string().nullable().optional(),
    relationship: RelationshipSchema,
    /** On a pending request only: the hubs it would open and what the sender
     *  called the relationship. The requester picks both and the accepter
     *  cannot change them before accepting — which is exactly why they have to
     *  be shown beside the Accept button. */
    requestedModules: z.array(z.string()).nullable().optional(),
    requestedRelationship: z.string().nullable().optional(),
  })
  .nullable();
export type LookupResult = z.infer<typeof LookupSchema>;

export const usersApi = {
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
  onlineContacts: (): Promise<string[]> => apiGet('/users/online', z.array(z.string())),
  /** Find one citizen by their EXACT @handle. No directory — you must know the handle. */
  lookup: (handle: string): Promise<LookupResult> =>
    apiGet('/users/lookup', LookupSchema, { params: { handle } }),
  registerDevice: (token: string, platform: string): Promise<void> =>
    apiPost('/users/device-token', { token, platform }, z.void()),
};

export function useMe(enabled = true) {
  return useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me(), enabled });
}
export function useOnlineContacts() {
  return useQuery({ queryKey: ['users', 'online'], queryFn: () => usersApi.onlineContacts() });
}
