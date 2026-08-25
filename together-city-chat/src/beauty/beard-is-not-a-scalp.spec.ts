import { BEAUTY_PRODUCTS, recommendProducts, type BeautyProduct } from './beauty-engine';
import { SCALP_KEYS, claimableKeys, siteOf } from './product-site';

/**
 * A WOMAN REPORTING HAIR FALL WAS OFFERED BEARD OIL, AT A MATCH SCORE OF 85.
 *
 * `density`'s keyword rule in the generator matches "growth" and "regrowth", and
 * a beard growth oil is a hair-care product that promotes growth — so six Ustraa
 * beard SKUs came out of the derivation carrying `density`, the reading key that
 * means SCALP hair density. They were five of the ten Hair Care products under
 * ₹1,000 carrying it, so "best hair-fall product under ₹500" answered:
 *
 *     85  ₹400  Ustraa Beard Growth Oil (35 ml)
 *     85  ₹450  Ustraa Beard Growth Serum (For Oily Skin) (35 ml)
 *     85  ₹465  Le Bonheur Regrowth Hair Oil (50 ml)
 *
 * Nothing in the data was false. The row had no way to say which hair it was
 * about, and `group` does not say it: Hair Care is a band of a routine, not a
 * part of the body.
 *
 * TWO GUARDS, BECAUSE ONE OF THEM CANNOT SEE THE FUTURE. The generator refuses
 * to WRITE a scalp key onto a facial-hair row; the engine refuses to ACT on one.
 * A row typed by hand, or arriving in a sheet the derivation has not seen, still
 * cannot reach someone losing the hair on their head. The pattern below is
 * deliberately its own literal rather than an import from the generator — a test
 * that shares its subject's definition of the thing agrees with it by
 * construction.
 */
const FACIAL_HAIR = /\bbeard\b|\bbeards\b|moustache|mustache|\bmooch\b|stubble/i;

const names = (ps: readonly BeautyProduct[]) =>
  ps.map((p) => `${p.id} (${p.name})`).join('\n    ');

describe('a beard is not a scalp', () => {
  const facialHair = BEAUTY_PRODUCTS.filter(
    (p) => p.group === 'Hair Care' && FACIAL_HAIR.test(p.name),
  );

  it('finds the facial-hair rows it is written about', () => {
    // If this ever goes to zero the rest of the file is asserting nothing, which
    // is the failure mode where a guard reads as green because its data left.
    expect(facialHair.length).toBeGreaterThan(0);
  });

  it('marks every facial-hair product in Hair Care with site: beard', () => {
    const unmarked = facialHair.filter((p) => siteOf(p) !== 'beard');
    expect(unmarked.length ? `not site: 'beard' —\n    ${names(unmarked)}` : 'none').toBe('none');
  });

  // The next two are written against the NAME rather than against `site`, on
  // purpose. Scoping them to `siteOf(p) === 'beard'` would make them vacuous on
  // exactly the data they exist to catch — an unmarked beard row is not a beard
  // row by that test, so the offender disappears instead of failing.
  it('lets no facial-hair product carry a scalp reading key', () => {
    const offenders = facialHair.filter((p) => p.profileKeys.some((k) => SCALP_KEYS.has(k)));
    expect(offenders.length ? `claiming scalp keys —\n    ${names(offenders)}` : 'none').toBe('none');
  });

  it('lets no facial-hair product carry a scalp biomarker tag', () => {
    // `hair-density` is what prints "Low ferritin (hair thinning & increased
    // shedding)" as the reason a product was prioritised. On a beard oil that
    // sentence is about the wrong hair.
    const offenders = facialHair.filter((p) => p.tags.some((t) => t === 'scalp' || t === 'hair-density'));
    expect(offenders.length ? `tagged for the scalp —\n    ${names(offenders)}` : 'none').toBe('none');
  });

  it('leaves every beard product still reachable', () => {
    // The fix must not be a silent deletion. A Hair Care row with no keys scores
    // zero for everybody, for ever — which would hide the defect, not fix it.
    const orphaned = facialHair.filter((p) => p.profileKeys.length === 0);
    expect(orphaned.length ? `unreachable —\n    ${names(orphaned)}` : 'none').toBe('none');
  });

  it('recommends no beard product to someone with hair fall', () => {
    const recs = recommendProducts({
      readings: [{ key: 'density', label: 'Hair fall & density', level: 'priority', intensity: 3 }],
      concerns: [],
      profile: { skinType: 'normal', budget: 'Under ₹500' },
      insights: [],
    });
    const matchedBeard = recs.filter((r) => r.matched && FACIAL_HAIR.test(r.name));
    expect(matchedBeard.length ? `matched anyway —\n    ${names(matchedBeard)}` : 'none').toBe('none');
  });

  it('refuses a scalp key on a beard row even when the data says otherwise', () => {
    // The generator is not the only way a row can be written. This is the engine
    // half of the guard: given a forged product, the match must still not happen.
    const forged = {
      group: 'Hair Care', site: 'beard' as const,
      profileKeys: ['density', 'damage'],
    };
    expect(claimableKeys(forged)).toEqual(['damage']);
    expect(claimableKeys({ group: 'Hair Care', profileKeys: ['density', 'damage'] }))
      .toEqual(['density', 'damage']);
  });

  it('still sells a beard oil to somebody shopping for one', () => {
    // Scoped, not deleted. The row keeps its place on the shelf and its own
    // claim; it simply cannot answer a reading about the hair on a head.
    const beardOil = BEAUTY_PRODUCTS.find((p) => p.id === 'bp_ustraa_beard_growth_oil');
    expect(beardOil).toBeDefined();
    expect(beardOil!.profileKeys.length).toBeGreaterThan(0);
  });
});
