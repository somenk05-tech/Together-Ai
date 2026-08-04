import { useAuthStore } from './auth.store';

/**
 * Is somebody signed in?
 *
 * `Boolean(s.tokens?.accessToken && s.user)` was written out longhand in five
 * places and is now needed in several more, because every background POLL has to
 * ask it. A signed-out browser sitting on the home page was calling
 * GET /api/chat/conversations every fifteen seconds — the header's unread badge
 * reads useConversations(), so the poll runs on every page whether or not there
 * is anyone to poll for.
 *
 * Sixty of the 575 lines in one eight-minute production log were that request's
 * 401. During the quiet stretch after a deploy it was ALL of them, which is how
 * a real event — an inbound email arriving — became impossible to find in the
 * log it was recorded in. The requests are also charged against the rate limiter,
 * which now genuinely counts them.
 *
 * Both tokens AND user, not either: a token with no user is a half-restored
 * session, and firing authenticated requests during it is what produces a 401
 * storm rather than a single clean redirect to sign-in.
 */
export function useAuthed(): boolean {
  return useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
}
