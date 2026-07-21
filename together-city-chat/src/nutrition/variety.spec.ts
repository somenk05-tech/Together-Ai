import { detectCarb, detectMethod } from './nutrition.service';

// Minimal RecipeWithIng-shaped factory for the pure variety detectors.
const rec = (name: string, ing: string[] = []) =>
  ({ id: name, slot: 'l', diet: 'veg', name, country: 'India', minutes: 20,
     ingredients: ing.map((n) => ({ name: n })) }) as never;

describe('weekly variety — carbohydrate base detection', () => {
  it('classifies the staple carbohydrate from name/ingredients', () => {
    expect(detectCarb(rec('Chicken Biryani', ['rice']))).toBe('rice');
    expect(detectCarb(rec('Paneer Paratha', ['whole wheat flour']))).toBe('wheat');
    expect(detectCarb(rec('Overnight Oats', ['oats', 'milk']))).toBe('oats');
    expect(detectCarb(rec('Ragi Millet Bowl', ['ragi']))).toBe('millet');
    expect(detectCarb(rec('Aloo Sabzi', ['potato']))).toBe('potato');
    expect(detectCarb(rec('Penne Arrabbiata', ['pasta']))).toBe('pasta');
    expect(detectCarb(rec('Moong Dal Tadka', ['moong dal']))).toBe('legumeCarb');
  });

  it('returns a neutral bucket when no staple is obvious', () => {
    expect(detectCarb(rec('Grilled Fish', ['fish', 'lemon']))).toBe('other');
  });
});

describe('weekly variety — cooking method detection', () => {
  it('classifies the cooking style from the dish name', () => {
    expect(detectMethod(rec('Tandoori Chicken'))).toBe('grilled');
    expect(detectMethod(rec('Baked Ziti'))).toBe('baked');
    expect(detectMethod(rec('Steamed Idli'))).toBe('steamed');
    expect(detectMethod(rec('Stir-Fry Vegetables'))).toBe('fried');
    expect(detectMethod(rec('Paneer Butter Masala'))).toBe('curry');
    expect(detectMethod(rec('Tomato Soup'))).toBe('soup');
    expect(detectMethod(rec('Greek Salad'))).toBe('salad');
    expect(detectMethod(rec('Buddha Bowl'))).toBe('bowl');
    expect(detectMethod(rec('Chicken Wrap'))).toBe('wrap');
    expect(detectMethod(rec('Mango Smoothie'))).toBe('smoothie');
  });

  it('returns a neutral bucket for an unclassified dish', () => {
    expect(detectMethod(rec('Dal Makhani Special'))).toBe('curry'); // makhani → curry
    expect(detectMethod(rec('Assorted Platter'))).toBe('mixed');
  });
});
