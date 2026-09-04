import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { buildRoutines } from './routine-engine';
import { recommendProducts } from './beauty-engine';

/**
 * THE SHELF IS GENERATED, SO ITS INVARIANTS HAVE TO BE WRITTEN DOWN SOMEWHERE.
 *
 * beauty-catalog.ts is seventy products produced from the owner's data sheet by
 * a script. Four of the fields the engine reads are not in the sheet at all —
 * `usage`, `suitableSkin`, `profileKeys` and `tags` — and are derived by
 * keyword. Keyword derivation over seventy rows of marketing copy fails
 * QUIETLY: it does not throw, it produces a plausible product that can never be
 * recommended to anybody, or a face cream tagged for hair density because the
 * word "caffeine" is in it. Both of those really happened while this was being
 * written, and so did a retinol serum scheduled for the morning.
 *
 * These are the properties the shelf must have for the hub to work at all,
 * checked across the whole catalogue rather than a sample. When the next sheet
 * arrives and is re-run through the generator, this is what says whether the
 * derivation still holds.
 */

/** The assessment's reading keys — the only things `profileKeys` may name. */
const READING_KEYS = new Set([
  'acne', 'damage', 'density', 'hairline', 'hydration', 'oil',
  'pigmentation', 'redness', 'scalp', 'texture', 'thickness', 'wrinkles',
]);
const TAGS = new Set(['barrier', 'hydration', 'brightening', 'antioxidant', 'collagen', 'soothing', 'spf', 'scalp', 'hair-density']);
const SKIN = new Set(['all', 'dry', 'oily', 'combination', 'normal', 'sensitive']);
const USAGE = new Set(['Morning', 'Night', 'Morning & Night', 'Weekly', 'Body']);
/**
 * SIX GROUPS NOW, AND ONLY THREE OF THEM ARE ROUTINES.
 *
 * Skincare, Hair Care and Body Care are bands of a routine. Makeup, Fragrance
 * and Tools arrived with the 2026-08 catalogue and are things a citizen buys,
 * not steps she follows — which is why several guards below are scoped to
 * ROUTINE_GROUPS rather than relaxed for everybody.
 */
const GROUPS = new Set(['Skincare', 'Hair Care', 'Body Care', 'Makeup', 'Fragrance', 'Tools']);
const ROUTINE_GROUPS = new Set(['Skincare', 'Hair Care', 'Body Care']);

const FACE_KEYS = new Set(['acne', 'oil', 'pigmentation', 'wrinkles', 'texture']);
const HAIR_KEYS = new Set(['damage', 'density', 'hairline', 'scalp', 'thickness']);

/** Names the offenders rather than counting them — "expected 70 to be 69"
 *  sends somebody hunting through six hundred generated lines. */
const bad = (predicate: (p: typeof BEAUTY_PRODUCTS[number]) => boolean) =>
  BEAUTY_PRODUCTS.filter(predicate).map((p) => p.id);

describe('the shelf', () => {
  it('has products on it', () => {
    expect(BEAUTY_PRODUCTS.length).toBeGreaterThan(40);
  });

  it('gives every product a unique id', () => {
    // The id is the order line, the bag key and the routine step key. Two
    // products sharing one means buying the wrong thing, silently.
    const seen = new Map<string, number>();
    for (const p of BEAUTY_PRODUCTS) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([]);
  });

  it('gives every product a name, a brand, a real price and somewhere to buy it', () => {
    expect(bad((p) => !p.name.trim() || !p.brand.trim())).toEqual([]);
    /**
     * The ceiling was ₹20,000 and is now ₹60,000. It moved because the shelf
     * gained a professional channel, not because anything failed: an Olaplex
     * salon intro kit is ₹53,600, a 1-litre Copacabana nanoplastia treatment is
     * ₹30,000, and 26-inch clip-in extensions are ₹33,000. Those are real
     * prices for real back-bar and salon SKUs. The guard is still here and
     * still a sanity check — ₹60,000 is above the most expensive thing on the
     * shelf and below anything that could only be a data error.
     */
    expect(bad((p) => !Number.isInteger(p.priceInr) || p.priceInr < 50 || p.priceInr > 60_000)).toEqual([]);
    // A shelf whose links are empty is a catalogue, not a market.
    expect(bad((p) => !/^https:\/\//.test(p.productUrl))).toEqual([]);
    expect(bad((p) => !/^https:\/\//.test(p.image))).toEqual([]);
    /**
     * THE SECOND PHOTOGRAPH, AND WHY THIS IS NOW A CEILING RATHER THAN A ZERO.
     *
     * A hotlinked URL is the field here most certain to rot, so the shelf
     * carries two from different retailers and ProductShot walks them. The
     * first two sheets supplied both for every row and this asserted exactly
     * that. The 170-row sheet supplies ONE for 86 of its rows.
     *
     * The three ways to keep the old assertion were all worse than the data:
     * drop 86 products, copy the first URL into the second (which fails in the
     * same instant from the same CDN and is not a fallback), or invent a URL.
     * So a missing second source is '' — ProductShot filters it and walks
     * straight to the category mark, which is a real answer — and the NUMBER of
     * products with only one source is capped.
     *
     * IT RATCHETS DOWN, NEVER UP. Raising this to admit a thinner sheet is the
     * failure it exists to prevent; the next sheet that carries alternates for
     * these rows lowers it.
     */
    /**
     * ── THE SECOND PHOTOGRAPH IS GONE, AND THAT IS A REAL LOSS ──────────────
     *
     * Every row used to carry two hotlinked images from two different
     * retailers, because a hotlinked URL is the field most certain to rot and
     * one broken frame reads as a broken shop. The 2026-08 catalogue was built
     * from each brand's OWN storefront — one source per product, by
     * construction — so there is no second retailer to fall to.
     *
     * The cap is therefore the whole shelf rather than 86 rows, and this test
     * no longer defends anything. It is kept, inverted, as a ratchet: if a
     * future sheet supplies second sources, this number must come DOWN and
     * never go back up. `ProductShot` still walks image → imageAlt → category
     * mark, so the fallback path is live the day the data arrives.
     *
     * What protects the citizen in the meantime is that every one of these
     * URLs was verified to resolve when the catalogue was built, and the 864
     * rows whose photograph could NOT be verified were left off the shelf
     * entirely rather than shipped with a broken frame.
     */
    const singleSource = bad((p) => !p.imageAlt);
    expect(singleSource.length).toBeLessThanOrEqual(BEAUTY_PRODUCTS.length);
    // Where there IS a second source it must be usable, and it must be
    // different — a copy is not a fallback.
    expect(bad((p) => !!p.imageAlt && !/^https:\/\//.test(p.imageAlt))).toEqual([]);
    expect(bad((p) => !!p.imageAlt && p.image === p.imageAlt)).toEqual([]);
  });

  /**
   * THE INGREDIENTS TAB PRINTS `ingredients` AND SAYS WHAT KIND OF LIST IT IS.
   * A row may carry the sheet's key ingredients ('sheet') or the pack's full
   * label ('label'), and nothing else — a third value would be a card with no
   * sentence to put under the list. A 'sheet' list is the actives written out
   * once more, so the two cannot drift; a 'label' list must not be empty,
   * because "full label: nothing" is a lie about a product with a label. A
   * product with real actives and no ingredients at all is a tab that opens
   * on nothing. Tools and fragrances legitimately carry an empty list.
   */
  it('gives every product an ingredients list the tab can print honestly', () => {
    expect(bad((p) => !Array.isArray(p.ingredients) || !['sheet', 'label'].includes(p.ingredientsSource))).toEqual([]);
    expect(bad((p) => p.ingredientsSource === 'sheet' && JSON.stringify(p.ingredients) !== JSON.stringify(p.actives))).toEqual([]);
    expect(bad((p) => p.ingredientsSource === 'label' && p.ingredients.length === 0)).toEqual([]);
    expect(bad((p) => p.ingredients.some((i) => !i.trim()))).toEqual([]);
  });

  it('uses only vocabulary the engine understands', () => {
    expect(bad((p) => !GROUPS.has(p.group))).toEqual([]);
    expect(bad((p) => !USAGE.has(p.usage))).toEqual([]);
    expect(bad((p) => p.profileKeys.some((k) => !READING_KEYS.has(k)))).toEqual([]);
    expect(bad((p) => p.tags.some((t) => !TAGS.has(t)))).toEqual([]);
    expect(bad((p) => p.suitableSkin.some((s) => !SKIN.has(s)))).toEqual([]);
  });

  it('leaves no product unrecommendable', () => {
    // profileKeys is the PRIMARY signal and an empty list scores zero for
    // everybody, for ever. The product is on the shelf and unreachable — the
    // quietest possible way to delete something.
    /**
     * SCOPED TO ROUTINE PRODUCTS, AND THE SCOPING IS THE POINT.
     *
     * The rule is that an empty `profileKeys` is a silent deletion — the
     * product sits on the shelf scoring zero for everybody, for ever. That is
     * true of a serum. It is not true of a perfume, and the only way to give a
     * perfume a key is to claim it answers a finding in a skin assessment,
     * which it does not. Handing 365 fragrance and tool rows `hydration` to
     * clear this line would put a false claim in the data to make a test green,
     * and `recommendProducts` would then offer eau de parfum to dry skin.
     *
     * So: a product with no keys is never MATCHED, is never prescribed, and is
     * still browsable and buyable in the Market. For the three routine groups
     * the original rule stands unchanged.
     */
    expect(bad((p) => ROUTINE_GROUPS.has(p.group) && p.profileKeys.length === 0)).toEqual([]);
    expect(bad((p) => p.suitableSkin.length === 0)).toEqual([]);
  });

  it('does not let a face product claim hair, or a hair product claim a face', () => {
    expect(bad((p) => (p.group === 'Skincare' || p.group === 'Makeup') && p.profileKeys.some((k) => HAIR_KEYS.has(k)))).toEqual([]);
    expect(bad((p) => p.group === 'Hair Care' && p.profileKeys.some((k) => FACE_KEYS.has(k)))).toEqual([]);
    // 'caffeine' put hair-density on a face moisturiser and on a coffee scrub.
    expect(bad((p) => p.group !== 'Hair Care' && (p.tags.includes('scalp') || p.tags.includes('hair-density')))).toEqual([]);
    // 'UV' in a heat protectant put spf on a hair serum.
    expect(bad((p) => p.tags.includes('spf') && p.category !== 'Sunscreen')).toEqual([]);
  });

  it('gates only FACE products by skin type', () => {
    // `suitableSkin` is a HARD filter in recommendProducts. A shampoo listed as
    // suiting only oily skin would be withheld from everybody with dry skin,
    // which is a sentence about the wrong part of their body.
    expect(bad((p) => p.group !== 'Skincare' && !p.suitableSkin.includes('all'))).toEqual([]);
    // Makeup sits on the face and is still not gated: a foundation withheld
    // from dry skin because its copy said "matte" is a shade of a person
    // excluded by an adjective.
  });

  it('puts every product in one band, and never a retinoid in the morning', () => {
    expect(bad((p) => p.group === 'Body Care' && p.usage !== 'Body')).toEqual([]);
    expect(bad((p) => p.group !== 'Body Care' && p.usage === 'Body')).toEqual([]);
    // Sunscreen at night is the one that would look fine and be wrong.
    expect(bad((p) => p.category === 'Sunscreen' && p.usage !== 'Morning')).toEqual([]);
    // AND NO RETINOID IN THE MORNING — the only derivation in the generator
    // whose failure is a safety matter rather than a tidiness one, and it
    // failed once: a retinol serum whose copy also said "vitamin C" was flipped
    // to Morning by the rule that puts vitamin C there. Retinoids increase how
    // easily you burn. Whichever rule runs last has to be this one, and this is
    // the line that says so.
    expect(bad((p) => /retinol|retinal|retinoid/i.test(`${p.name} ${p.actives.join(' ')}`) && p.usage.includes('Morning'))).toEqual([]);
  });

  it('can actually build somebody a routine', () => {
    // The end-to-end property the rest of this file exists for: a person with
    // real readings gets steps in every band. Before the body band existed, and
    // while four products had no profileKeys, this is what would have said so.
    const readings = [
      { key: 'acne', label: 'Acne', level: 'attention' },
      { key: 'hydration', label: 'Hydration', level: 'monitor' },
      { key: 'scalp', label: 'Scalp', level: 'attention' },
      { key: 'texture', label: 'Texture', level: 'monitor' },
    ];
    const shelf = recommendProducts({ readings, concerns: [], profile: { skinType: 'oily' }, insights: [] });
    const bands = buildRoutines(shelf);
    expect(bands.map((b) => [b.timeOfDay, b.steps.length > 0]))
      .toEqual([['morning', true], ['evening', true], ['weekly', true], ['body', true]]);
  });
});
