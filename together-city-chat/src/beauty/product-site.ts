/**
 * Together City — Beauty · WHERE ON THE BODY A PRODUCT ACTS
 * ---------------------------------------------------------------------------
 * `group` says which band of the routine a product belongs to. It does not say
 * which part of the body it is FOR, and inside Hair Care that difference is the
 * whole of a defect:
 *
 *   Asked for the best hair-fall product under ₹500, the shelf answered
 *   **Ustraa Beard Growth Oil (₹400) and Ustraa Beard Growth Serum (₹450), both
 *   at a match score of 85.** Six Ustraa beard SKUs carried
 *   `profileKeys: ['density']` — five of the ten Hair Care products under
 *   ₹1,000 that carried it — because `density`'s keyword rule matches
 *   "growth" and "regrowth", and a beard oil is unarguably a hair-care product
 *   that promotes growth.
 *
 * Nothing in the data was false. `density` means SCALP hair density and no
 * field said so, so a woman reporting hair fall was offered beard oil,
 * confidently.
 *
 * The generator already refuses to let a face cream have an opinion about a
 * scalp (`KEYS_FOR_GROUP`). This is that same rule one level down, and it is a
 * FIELD rather than a name test on purpose: the judgement is made once, at
 * derivation, where every other derived judgement is made. Nothing at request
 * time re-reads a product name to guess what it is for — that is the failure
 * mode this hub already has in `isTopicallySafe`, matching declared allergies
 * against marketing copy, and it should not be copied.
 */

/** The part of the body a product acts on. */
export type ProductSite = 'face' | 'scalp' | 'beard' | 'body' | 'none';

/**
 * ABSENT MEANS "THE GROUP'S DEFAULT", NOT "UNKNOWN.
 *
 * `site` is emitted by the generator only where it DIFFERS from the default
 * below, so the catalogue diff for this fix is fourteen rows rather than 1,841
 * and a reader can see what actually changed. The default is resolved here, in
 * one function, rather than being a fact about which rows happen to carry the
 * field.
 */
const DEFAULT_SITE: Readonly<Record<string, ProductSite>> = {
  Skincare: 'face',
  'Hair Care': 'scalp',
  'Body Care': 'body',
  Makeup: 'face',
  Fragrance: 'none',
  Tools: 'none',
};

export const siteOf = (p: { group: string; site?: string }): ProductSite =>
  (p.site as ProductSite) ?? DEFAULT_SITE[p.group] ?? 'none';

/**
 * The reading keys that are statements about the hair on someone's HEAD.
 *
 * `hairline` is in here and no product carries it today — the assessment emits
 * the reading and the shelf cannot answer it. That is a separate gap, recorded
 * rather than fixed here; listing it now means the day a product does claim it,
 * a beard oil cannot.
 */
export const SCALP_KEYS: ReadonlySet<string> = new Set(['scalp', 'density', 'thickness', 'hairline']);

/**
 * The keys a product is allowed to be MATCHED on, which is not always the keys
 * it carries. A beard product keeps whatever the data says — deleting the key
 * would make the row unmatchable and hide the defect rather than fix it — and
 * simply cannot answer a scalp reading with it.
 *
 * Belt and braces with the generator's own rule on purpose: the generator stops
 * the data from being written, this stops it from being acted on. A row typed by
 * hand, or arriving in a future sheet the derivation has not seen, still cannot
 * put beard oil in front of someone losing the hair on their head.
 */
export function claimableKeys(p: { group: string; site?: string; profileKeys: readonly string[] }): string[] {
  return siteOf(p) === 'scalp' || !p.profileKeys.some((k) => SCALP_KEYS.has(k))
    ? [...p.profileKeys]
    : p.profileKeys.filter((k) => !SCALP_KEYS.has(k));
}
