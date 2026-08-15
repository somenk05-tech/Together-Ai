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
const GROUPS = new Set(['Skincare', 'Hair Care', 'Body Care']);

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
    expect(bad((p) => !Number.isInteger(p.priceInr) || p.priceInr < 50 || p.priceInr > 20_000)).toEqual([]);
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
    const singleSource = bad((p) => !p.imageAlt);
    expect(singleSource.length).toBeLessThanOrEqual(86);
    // Where there IS a second source it must be usable, and it must be
    // different — a copy is not a fallback.
    expect(bad((p) => !!p.imageAlt && !/^https:\/\//.test(p.imageAlt))).toEqual([]);
    expect(bad((p) => !!p.imageAlt && p.image === p.imageAlt)).toEqual([]);
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
    expect(bad((p) => p.profileKeys.length === 0)).toEqual([]);
    expect(bad((p) => p.suitableSkin.length === 0)).toEqual([]);
  });

  it('does not let a face product claim hair, or a hair product claim a face', () => {
    expect(bad((p) => p.group === 'Skincare' && p.profileKeys.some((k) => HAIR_KEYS.has(k)))).toEqual([]);
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
