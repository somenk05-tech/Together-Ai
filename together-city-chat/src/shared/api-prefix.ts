/**
 * WHERE THIS API ANSWERS, SAID ONCE.
 *
 * `main.ts` mounts every route under `/api`. Nothing else needed to know that
 * until a URL had to be MINTED rather than received: the dating photo route
 * hands the browser an absolute link built from `PUBLIC_API_URL`, and a value
 * set without the prefix produces a 404 for every photograph in the hub —
 * silently, because a broken image says nothing to anybody.
 *
 * So the prefix is a constant both sides read, and the joiner is tolerant of
 * whichever form an operator writes. `https://api.example.com` and
 * `https://api.example.com/api` are the same deployment described two ways;
 * being right about which one somebody typed is not a thing to make them do at
 * midnight.
 */
export const API_PREFIX = 'api';

/** `<base>/<API_PREFIX>/<path>`, with the prefix added only if it is missing.
 *  A trailing slash on the base, or a leading one on the path, is fine. */
export function apiUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, '');
  const tail = path.replace(/^\/+/, '');
  const prefixed = new RegExp(`/${API_PREFIX}$`).test(root) ? root : `${root}/${API_PREFIX}`;
  return `${prefixed}/${tail}`;
}
