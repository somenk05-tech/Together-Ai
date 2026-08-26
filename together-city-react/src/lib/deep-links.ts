/**
 * Pure: what a push or app link points at, as a route. Kept apart from the
 * hook so it can be tested without a document.
 */
/** togethercity://dating/chat/abc → /dating/chats?c=abc; anything else maps by path. */
export function routeForDeepLink(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'togethercity:' && u.hostname !== 'togethercity.app') return null;
  const path = u.protocol === 'togethercity:' ? `/${u.hostname}${u.pathname}` : u.pathname;
  const chat = /^\/dating\/chat\/([^/]+)$/.exec(path);
  if (chat) return `/dating/chats?c=${encodeURIComponent(chat[1])}`;
  const direct = /^\/chat\/([^/]+)$/.exec(path);
  if (direct) return `/chats?c=${encodeURIComponent(direct[1])}`;
  return `${path}${u.search}`;
}

