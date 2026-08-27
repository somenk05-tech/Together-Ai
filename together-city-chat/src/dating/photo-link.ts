import { createHmac, timingSafeEqual } from 'crypto';

/**
 * A DATING PHOTO LINK THAT IS CHECKED WHEN IT IS FETCHED.
 *
 * A presigned S3 URL is a bearer link: S3 checks the signature and nothing
 * else, so access is decided when the URL is MINTED — inside an authenticated
 * card request — and never again. Block the person whose card you were just
 * looking at, have their profile taken down, have the photo rejected in review:
 * the link in your browser keeps working until it expires. That is the whole of
 * the finding, and shortening the window from 300 seconds to 60 narrowed it
 * without changing its shape.
 *
 * This is the shape change. The URL names a VIEWER and a KEY and is signed by
 * the API, so the API can be asked again, on every single fetch, whether that
 * viewer may still see that photo. Revocation works: the answer is computed
 * from live rows, not from a signature minted a minute ago.
 *
 * What it is still not: proof of who is holding the string. A copied link works
 * for whoever has it, for as long as the named viewer's permission lasts. The
 * end of that is fetching images through the session itself, which is a change
 * on both sides of the wire; this is the half that removes the un-revokable
 * part, and it says so rather than claiming the rest.
 *
 * Deliberately pure functions over a secret rather than a service: a token
 * format is the kind of thing that must be testable without a container, and
 * the round trip, the expiry and the tamper cases are the whole of it.
 */

const SEP = '.';

/** Domain separation: the media secret is derived from the access secret and is
 *  never the access secret, so a leaked photo link cannot be replayed at the
 *  token verifier and a rotation of one rotates the other. */
function mediaKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('tc:dating-photo-link:v1').digest();
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', mediaKey(secret)).update(payload).digest('base64url');
}

/** `<base64url({v,k,e})>.<hmac>` — opaque to the browser, readable only here. */
export function mintPhotoToken(secret: string, viewerId: string, key: string, ttlSec: number, nowMs: number): string {
  const body = Buffer.from(JSON.stringify({ v: viewerId, k: key, e: Math.floor(nowMs / 1000) + ttlSec })).toString('base64url');
  return `${body}${SEP}${sign(secret, body)}`;
}

/**
 * The viewer and key a token names, or null.
 *
 * Null for every failure and for all of them alike — a wrong signature, a
 * mangled body and an expired link are one answer, because a caller that can
 * tell them apart is an oracle for whoever is holding the string.
 */
export function readPhotoToken(secret: string, token: string, nowMs: number): { viewerId: string; key: string } | null {
  if (typeof token !== 'string') return null;
  const cut = token.lastIndexOf(SEP);
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1), 'base64url');
  const want = Buffer.from(sign(secret, body), 'base64url');
  // Length first: timingSafeEqual throws on a mismatch rather than returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { v?: unknown; k?: unknown; e?: unknown };
    if (typeof claim.v !== 'string' || typeof claim.k !== 'string' || typeof claim.e !== 'number') return null;
    if (claim.e * 1000 <= nowMs) return null;
    return { viewerId: claim.v, key: claim.k };
  } catch {
    return null;
  }
}
