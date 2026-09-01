import { createCipheriv, createDecipheriv, createHmac } from 'crypto';

/**
 * THE ID ON A CARD IS NOT THE CITY'S PRIMARY KEY.
 *
 * Fifth audit, H3, the half that stayed open: `cardIdentity` ships `user.id`,
 * which is the same id a citizen wears on their posts, their connections and
 * `GET /users/lookup` — so `@handle → lookup → id → the dating hub` connected
 * a person's public city life to their dating profile, and a dating card's id
 * resolved back to their city life. The filters (H3) narrowed who that works
 * on; this removes the join itself.
 *
 * A sealed card id is the target's real id, AES-256-GCM-encrypted under a key
 * derived from the access secret, BOUND TO THE VIEWER: the viewer's id is the
 * AAD and seeds the nonce, so the same person appears as a DIFFERENT opaque
 * string to every viewer, one viewer's token opens nothing for another, and
 * nothing about the string survives being carried between accounts.
 *
 * DETERMINISTIC on purpose — same viewer, same target, same token — because
 * the client uses the id as its identity for a person: React keys, query
 * cache keys, the dedup that keeps a face from appearing twice, the in-place
 * cache edits a Skip makes. A token that changed per fetch would refetch and
 * re-render the world. Deterministic GCM is safe HERE because the nonce is
 * derived from the entire message and key — identical input is the only way
 * to repeat a nonce, and an identical token is exactly the point.
 *
 * Pure functions over a secret, like photo-link.ts, and the same domain
 * separation: the card key is derived from the access secret and is never
 * the access secret, so nothing learned from a card token touches sessions.
 */

const PREFIX = 'dv1_';
const NONCE_LEN = 12;
const TAG_LEN = 16;

function cardKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('tc:dating-card-id:v1').digest();
}

/** Is this string a sealed card id at all? Raw ids never carry the prefix. */
export function isSealedCardId(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** The opaque, viewer-bound spelling of `targetId` for `viewerId`'s eyes. */
export function sealCardId(secret: string, viewerId: string, targetId: string): string {
  const key = cardKey(secret);
  const nonce = createHmac('sha256', key).update(`${viewerId}\n${targetId}`).digest().subarray(0, NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(viewerId, 'utf8'));
  const ct = Buffer.concat([cipher.update(targetId, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64url');
}

/**
 * The real id behind a sealed card id, or null — for a token minted for a
 * DIFFERENT viewer, a tampered byte, or a string that only looks the part.
 * Null, never a throw: the caller answers with the hub's uniform 404.
 */
export function openCardId(secret: string, viewerId: string, token: string): string | null {
  if (!isSealedCardId(token)) return null;
  let raw: Buffer;
  try { raw = Buffer.from(token.slice(PREFIX.length), 'base64url'); } catch { return null; }
  if (raw.length <= NONCE_LEN + TAG_LEN) return null;
  const nonce = raw.subarray(0, NONCE_LEN);
  const tag = raw.subarray(raw.length - TAG_LEN);
  const ct = raw.subarray(NONCE_LEN, raw.length - TAG_LEN);
  try {
    const decipher = createDecipheriv('aes-256-gcm', cardKey(secret), nonce);
    decipher.setAAD(Buffer.from(viewerId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
