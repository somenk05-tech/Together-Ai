import { classifyShelf, formatGroceryQty } from './nutrition.service';

describe('grocery shelf-life classification (Smart Grocery Planner)', () => {
  it('pantry: grains, dals, oils, spices, dry goods', () => {
    for (const n of ['Brown Rice', 'Atta', 'Masoor Dal', 'Olive Oil', 'Turmeric Powder', 'Rajma', 'Oats', 'Peanut Butter', 'Soy Sauce'])
      expect(classifyShelf(n)).toBe('pantry');
  });
  it('daily: highly perishable herbs, seafood, berries, mushrooms', () => {
    for (const n of ['Fresh Coriander', 'Mint', 'Curry Leaves', 'Mushrooms', 'Fresh Fish', 'Prawns', 'Strawberries', 'Microgreens'])
      expect(classifyShelf(n)).toBe('daily');
  });
  it('weekly: proteins, dairy, sturdy veg, fruit', () => {
    for (const n of ['Chicken Breast', 'Paneer', 'Curd', 'Milk', 'Broccoli', 'Carrots', 'Tomato', 'Onion', 'Apple'])
      expect(classifyShelf(n)).toBe('weekly');
  });
  it('strong pantry signal wins over a perishable base word', () => {
    expect(classifyShelf('Coconut Oil')).toBe('pantry');   // not daily "coconut"
    expect(classifyShelf('Fish Sauce')).toBe('pantry');    // not daily "fish"
  });
});

describe('grocery human-readable units (never "×9")', () => {
  it('counts pieces for eggs / onions / tomatoes', () => {
    expect(formatGroceryQty('Egg', 900).qtyLabel).toBe('18');          // 900/50
    expect(formatGroceryQty('Onion', 900).qtyLabel).toBe('9 medium');  // 900/100
    expect(formatGroceryQty('Tomato', 960).qtyLabel).toBe('12 medium'); // 960/80
    expect(formatGroceryQty('Egg', 900).unit).toBe('pc');
  });
  it('weighs in g / kg', () => {
    expect(formatGroceryQty('Chicken Breast', 1800).qtyLabel).toBe('1.8 kg');
    expect(formatGroceryQty('Paneer', 800).qtyLabel).toBe('800 g');
    expect(formatGroceryQty('Rice', 2000).qtyLabel).toBe('2 kg');
  });
  it('volumes milk & oils in ml / L', () => {
    expect(formatGroceryQty('Milk', 2000).qtyLabel).toBe('2 L');
    expect(formatGroceryQty('Olive Oil', 500).qtyLabel).toBe('500 ml');
  });
  it('bunches for leafy herbs', () => {
    expect(formatGroceryQty('Fresh Coriander', 200).qtyLabel).toBe('2 bunches');
    expect(formatGroceryQty('Mint', 100).qtyLabel).toBe('1 bunch');
  });
  it('never emits an "×" count label', () => {
    for (const n of ['Chicken', 'Egg', 'Milk', 'Coriander', 'Rice', 'Onion'])
      expect(formatGroceryQty(n, 500).qtyLabel).not.toContain('×');
  });
});
