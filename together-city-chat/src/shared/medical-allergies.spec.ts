import { medicalFoodAllergenTerms } from './medical-allergies';
import { findAllergen, isAllergenSafe } from './allergens';

/**
 * P1-5 — the third allergy vocabulary joins the union.
 *
 * Medical's kind:'allergy' records are free text: "Penicillin", "nuts",
 * "reacts badly to shellfish", "dust". A drug allergy and a food allergy are
 * not the same claim, so the record joins the FOOD union only when it
 * resolves to a known food family; everything else stays in Medical and
 * surfaces on the prescription screen, where it already has a home.
 *
 * The audit's failing case, recorded here before the fix existed: a citizen
 * with a medical record reading "Peanut allergy" and nothing in their food
 * preferences was served a peanut dish.
 */
const withRecords = (titles: string[]) =>
  ({ medicalRecord: { findMany: async () => titles.map((title) => ({ title })) } }) as never;

describe('medical allergy records, read as food-allergen terms', () => {
  it('the peanut case: a medical record alone must block a peanut dish', async () => {
    const declared = await medicalFoodAllergenTerms(withRecords(['Peanut allergy']), 'u1');
    expect(declared).toContain('peanut');
    expect(isAllergenSafe('Peanut Chikki', ['Peanuts', 'Jaggery'], declared)).toBe(false);
    expect(findAllergen('Masala Dosa', ['Rice', 'Urad dal'], declared)).toBeNull();
  });

  it('free text resolves through the same matcher the city already uses', async () => {
    expect(await medicalFoodAllergenTerms(withRecords(['reacts badly to shellfish']), 'u1')).toContain('shellfish');
    expect(await medicalFoodAllergenTerms(withRecords(['Milk & eggs make me ill']), 'u1'))
      .toEqual(['egg', 'milk']);
  });

  it('drugs, dust and latex stay in Medical — they are not food claims', async () => {
    expect(await medicalFoodAllergenTerms(withRecords(['Penicillin']), 'u1')).toEqual([]);
    expect(await medicalFoodAllergenTerms(withRecords(['Dust mites']), 'u1')).toEqual([]);
    expect(await medicalFoodAllergenTerms(withRecords(['Latex gloves']), 'u1')).toEqual([]);
  });

  it('a failed read yields the empty union, witnessed — never a crash into the meal plan', async () => {
    const failing = { medicalRecord: { findMany: async () => { throw new Error('db down'); } } } as never;
    expect(await medicalFoodAllergenTerms(failing, 'u1')).toEqual([]);
  });
});
