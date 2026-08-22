/** Core domain types (strict — no `any` anywhere in the app). */

export type HubKey =
  | 'travel' | 'astrology' | 'nutrition' | 'entertainment' | 'social'
  | 'dating' | 'realestate' | 'jobs' | 'medical' | 'financial'
  | 'beauty' | 'fitness' | 'services' | 'family' | 'mail' | 'pets';

export type AuthProvider = 'email' | 'google' | 'phone';

export interface User {
  id: string;
  handle: string;            // unique — also surfaced as <handle>@togethercity.app
  name: string;
  profileImage?: string | null;
  lastSeen?: string | null;
  onlineStatus?: boolean;
  createdAt?: string;
  /** Own record only — drives the "verify your email" soft-gate banner. */
  email?: string | null;
  emailVerified?: boolean;
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
  anonymous?: boolean;
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
  /** Line items of a composite card — e.g. every dish in a shared meal. */
  items?: string[] | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  share?: ShareCard | null;
  status?: 'SENT' | 'DELIVERED' | 'READ';
  createdAt: string;
  edited?: boolean;
  deleted?: boolean; // soft-deleted for everyone → render tombstone
  media?: MediaAttachment[];
  /** Whether YOU have kept this message — per reader, never shared. */
  starred?: boolean;
  /** Who answered this message with what. SHARED, unlike `starred`: the server
   *  sends ids rather than a count and a "mine", so one broadcast frame is
   *  correct for everybody who receives it. Keep in step with api/schemas.ts. */
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  /** Set when this message is the one pinned in its conversation. */
  pinnedAt?: string | null;
  /** What this message answers. Keep in step with api/schemas.ts's
   *  MessageSchema, which is what parses the wire — the server has always
   *  sent the id, and now sends enough of the original to quote it. */
  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    senderId: string;
    body: string;
    messageType?: string;
    deleted?: boolean;
  } | null;
}

export interface MediaAttachment {
  id: string;
  url: string;
  /** 'audio' joined with voice notes — it was folded into 'file' before, which
   *  is why a voice note could only render as a link. Keep in step with
   *  api/schemas.ts's MediaAttachmentSchema, which is what parses the wire. */
  kind: 'image' | 'video' | 'audio' | 'file';
  thumbUrl?: string;
  mimeType?: string;
  /** Absent on a voice note and on anything sent before the column existed. */
  name?: string;
  sizeBytes?: number;
  durationSec?: number;
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
