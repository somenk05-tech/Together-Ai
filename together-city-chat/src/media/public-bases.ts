/**
 * ── A STORED URL OUTLIVES THE DOMAIN IT WAS WRITTEN UNDER (launch gate,
 *    third reading, 4 Sep) ────────────────────────────────────────────────
 *
 * Public media is stored as an absolute URL, `${publicBase}/${key}`, and
 * three things turn that URL back into a key: the delete paths (post,
 * listing, CV, medical record, account purge), the chat attachment-origin
 * gate, and the chat media screen. Every one of them compared against the
 * CURRENT base only. So the day `MEDIA_PUBLIC_BASE_URL` moves from the
 * r2.dev development address to a custom domain, every row written before
 * the cutover stops resolving: a deleted post leaves its photograph in the
 * bucket (silent `''` key), an old attachment cannot be forwarded, and the
 * r2.dev links keep serving — rate-limited and uncached — for as long as
 * they are stored.
 *
 * `MEDIA_LEGACY_PUBLIC_BASES` names the bases a row may still carry, comma
 * separated. The current base always comes first. Set it BEFORE the
 * cutover, not after: the first deploy on the new domain is the one that
 * meets the old rows.
 *
 * Reading-side only. Nothing here rewrites a stored URL — that is a one-shot
 * script against the database once the custom domain is live, and it can
 * run at leisure because with this in place nothing depends on it.
 */

export function publicBasesFrom(current: string | undefined, legacy: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of [current ?? '', ...(legacy ?? '').split(',')]) {
    const b = raw.trim().replace(/\/+$/, '');
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/** The base a URL was written under, or null when it is under none of them. */
export function publicBaseOf(url: string, bases: readonly string[]): string | null {
  for (const b of bases) if (url === b || url.startsWith(`${b}/`)) return b;
  return null;
}

/** `${base}/${key}` → `key`, for any base the city has ever served from. */
export function keyUnderPublicBases(url: string, bases: readonly string[]): string {
  const b = publicBaseOf(url, bases);
  return b ? url.slice(b.length + 1) : '';
}
