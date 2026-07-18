/** Core domain types (strict — no `any` anywhere in the app). */

export type HubKey =
  | 'travel' | 'restaurants' | 'nutrition' | 'entertainment' | 'social'
  | 'dating' | 'realestate' | 'jobs' | 'medical' | 'financial'
  | 'beauty' | 'fitness' | 'family' | 'mail';

export type AuthProvider = 'email' | 'google' | 'phone';

export interface User {
  id: string;
  handle: string;            // unique — also surfaced as <handle>@togethercity.tech
  name: string;
  profileImage?: string | null;
  lastSeen?: string | null;
  onlineStatus?: boolean;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Connection {
  id: string;
  userId: string;
  handle: string;
  name: string;
  status: 'pending' | 'accepted' | 'blocked';
  avatarUrl?: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  title?: string | null;
  isGroup?: boolean;
  lastMessageAt: string;
  unread: number;
}

export interface ShareCard {
  kind: string;
  hub?: string | null;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  priceInr?: number | null;
  meta?: string[];
  deepLink?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  share?: ShareCard | null;
  createdAt: string;
  media?: MediaAttachment[];
}

export interface MediaAttachment {
  id: string;
  url: string;
  kind: 'image' | 'video' | 'file';
  thumbUrl?: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  href?: string;
}

export interface SearchResult {
  id: string;
  hub: HubKey;
  title: string;
  subtitle?: string;
  href: string;
}

/** A generic paginated envelope returned by the NestJS API. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
