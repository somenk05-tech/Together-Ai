/** Canonical Socket.IO event names for the Social hub (server → client). */
export const SOCIAL_WS = {
  POST_NEW: 'post:new',
  COMMENT_NEW: 'comment:new',
  LIKE_CHANGED: 'like:changed',
  POST_DELETED: 'post:deleted',
} as const;

export type SocialWsEvent = (typeof SOCIAL_WS)[keyof typeof SOCIAL_WS];
