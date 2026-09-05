import { createHmac } from 'crypto';

/**
 * ── ONE SECRET PER THING THAT CAN BE HANDED OUT (launch gate, third reading,
 *    4 Sep) ──────────────────────────────────────────────────────────────────
 *
 * The JWT access secret signed access tokens, AND was copied verbatim into
 * the Cloudflare media-edge Worker as LINK_SECRET, AND keyed the mail
 * unsubscribe HMAC. Each of those derived its own key from it with a domain
 * string, which keeps the tokens apart — but the Worker still HELD the raw
 * secret, and anybody who read it out of the Cloudflare dashboard could mint
 * an access token for any account. Derivation at the consumer is not
 * separation; separation is the consumer never seeing the root.
 *
 * So the root stays in the API and hands out per-purpose secrets:
 *
 *   MEDIA_LINK_SECRET   — what the Worker gets. Set it explicitly (a random
 *                         ≥32-char value, the same on Railway and in
 *                         `wrangler secret put LINK_SECRET`); if unset, it is
 *                         `derivedSecret(JWT_ACCESS_SECRET, 'media-link')`,
 *                         which `scripts/print-media-link-secret.mjs` prints
 *                         so an operator can put it in the Worker.
 *   MAIL_UNSUBSCRIBE_SECRET — keys the unsubscribe links in outbound mail;
 *                         derived the same way when unset. Never leaves the
 *                         API.
 *
 * A derived secret is HMAC-SHA256(root, `tc:secret:<purpose>:v1`) in hex —
 * 64 chars, one way, and no two purposes share one. Rotating the root rotates
 * every derived value; setting a purpose's variable pins that one alone.
 */
export function derivedSecret(root: string, purpose: string): string {
  return createHmac('sha256', root).update(`tc:secret:${purpose}:v1`).digest('hex');
}

/** The explicit variable if set, else the derivation from the root. */
export function purposeSecret(explicit: string | undefined, root: string, purpose: string): string {
  const v = (explicit ?? '').trim();
  return v || derivedSecret(root, purpose);
}
