import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { UserSchema, type User } from './schemas';

export const usersApi = {
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
  onlineContacts: (): Promise<string[]> => apiGet('/users/online', z.array(z.string())),
  registerDevice: (token: string, platform: string): Promise<void> =>
    apiPost('/users/device-token', { token, platform }, z.void()),
};

export function useMe(enabled = true) {
  return useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me(), enabled });
}
export function useOnlineContacts() {
  return useQuery({ queryKey: ['users', 'online'], queryFn: () => usersApi.onlineContacts() });
}
