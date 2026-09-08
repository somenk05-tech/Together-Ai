/** Core domain types (strict — no `any` anywhere in the app). */

export type HubKey =
  | 'travel' | 'astrology' | 'nutrition' | 'entertainment' | 'social'
  | 'dating' | 'realestate' | 'jobs' | 'medical' | 'financial'
  | 'beauty' | 'fitness' | 'services' | 'family' | 'mail' | 'pets'
  /* E-COMMERCE IS A KEY AGAIN (owner, 22 Aug), and it was never really one
     before: the district existed as a building in the homepage photograph with
     no hub behind it, so `Panel['key']` was `HubKey | 'ecommerce'` and four
     branches existed to describe that one exception. It comes back the other
     way round — two rooms first, and the key because of them. */
  | 'ecommerce'
  /* PERSONALIZE IS A HUB (owner, 7 Sep), and the cost of that word is worth
     stating where the type is widened: every map keyed by hub now owes it a
     photograph, a street line, a glyph, a switch and a consent decision. It is
     a hub rather than a page because it has the one property a page does not —
     a door on the street that a citizen can close. What is behind the door is
     not rooms of its own but the ten districts that read a profile, laid out
     the way the owner's poster lays them out. */
  | 'personalize'
  /* BABY CARE IS A HUB (owner, 8 Sep): "a store just for baby care for all the
     products available in Mumbai from 0-10 year old". A district rather than a
     tab under the Digital Store because it is the one shelf in this city that
     reads a record nobody else keeps — a child's birthday — and because part of
     it is governed by a criminal statute (see features/babycare/ims.ts), which
     is not a rule you want living inside somebody else's storefront. */
  | 'babycare';

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
  /**
   * OPTIONAL SINCE 6 SEP, AND ABSENT IS THE GOOD CASE.
   *
   * The long-lived refresh token rides an HttpOnly cookie the server has always
   * set and the client never used. Where that cookie works — every browser that
   * still accepts a cross-site one, which is nearly all of Android — the client
   * holds no refresh token at all and this is undefined. Where it is blocked
   * (Safari's ITP), the body fallback fills it in and it is persisted, exactly
   * as it always was. See the note in store/auth.store.ts.
   */
  refreshToken?: string;
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

/** What a temporary photo tells you about itself. NEVER an address for the
 *  bytes — those come from `GET /messages/:id/snap`, one view at a time. Keep
 *  in step with api/schemas.ts's SnapSchema, which is what parses the wire. */
export interface Snap {
  mode: 'once' | 'twice' | 'day' | 'keep';
  /** The composer's word for "off the camera, not out of a gallery". A claim
   *  about our capture path, not a verification — never shown as proof. */
  live: boolean;
  views: number | null;
  /** The READER'S remaining opens; null when the mode has no budget. */
  viewsLeft: number | null;
  expiresAt: string | null;
  openedAt: string | null;
  keptAt: string | null;
  /** Set only by a native shell. The web cannot detect a screenshot. */
  shotAt: string | null;
  gone: boolean;
}

export interface MediaAttachment {
  id: string;
  /** EMPTY on a snap — a snap has no address a client may hold. */
  url: string;
  /** 'audio' joined with voice notes — it was folded into 'file' before, which
   *  is why a voice note could only render as a link. 'snap' joined on 2 Sep
   *  and is a contract rather than a type: the bytes are fetched, once,
   *  through the API. Keep in step with
   *  api/schemas.ts's MediaAttachmentSchema, which is what parses the wire. */
  kind: 'image' | 'video' | 'audio' | 'file' | 'snap';
  thumbUrl?: string;
  mimeType?: string;
  /** Absent on a voice note and on anything sent before the column existed. */
  name?: string;
  sizeBytes?: number;
  durationSec?: number;
  /** The picture's own dimensions, when the sender's client measured them.
   *  Absent on every row sent before 3 Sep, which is why the bubble still
   *  carries a fallback reservation rather than trusting these. */
  width?: number;
  height?: number;
  /** Present exactly when `kind === 'snap'`. */
  snap?: Snap;
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
