import { itemKey, mergeGroceryList, type ListItem } from './grocery-merge';

const item = (key: string, over: Partial<ListItem> = {}): ListItem => ({
  key, label: key, aisle: 'produce', qtyLabel: '1 kg', checked: false, source: 'plan', ...over,
});
const gen = (key: string, qtyLabel = '1 kg') => ({ key, label: key, aisle: 'produce', qtyLabel });

describe('regenerating the list does not undo the shopping', () => {
  it('keeps the tick on a line that is still needed', () => {
    // The easy implementation replaces the list and unticks a basket somebody
    // has already half-filled, while they are standing in the shop.
    const r = mergeGroceryList([item('tomato', { checked: true })], [gen('tomato', '2 kg')]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].checked).toBe(true);
    // The plan's wording wins — quantities change — but the tick is theirs.
    expect(r.items[0].qtyLabel).toBe('2 kg');
  });

  it('never removes something the citizen added by hand', () => {
    // The planner did not put bin bags there and does not know why they are.
    const r = mergeGroceryList([item('bin bag', { source: 'manual' })], [gen('tomato')]);
    expect(r.items.map((i) => i.key).sort()).toEqual(['bin bag', 'tomato']);
    expect(r.removed).toEqual([]);
  });

  it('keeps a dropped line that is already in the trolley', () => {
    // It has been bought. Removing it would make the list disagree with what
    // is physically in the basket.
    const r = mergeGroceryList([item('paneer', { checked: true })], [gen('tomato')]);
    expect(r.items.map((i) => i.key).sort()).toEqual(['paneer', 'tomato']);
    expect(r.removed).toEqual([]);
  });

  it('drops an unticked line the new plan no longer calls for', () => {
    const r = mergeGroceryList([item('paneer')], [gen('tomato')]);
    expect(r.items.map((i) => i.key)).toEqual(['tomato']);
    expect(r.removed).toEqual(['paneer']);
  });

  it('does not turn a manual line into a generated one', () => {
    // If the plan later happens to call for it too, it stays the citizen's.
    const r = mergeGroceryList([item('salt', { source: 'manual', checked: true })], [gen('salt')]);
    expect(r.items[0].source).toBe('manual');
    expect(r.items[0].checked).toBe(true);
  });

  it('handles the first ever generation', () => {
    const r = mergeGroceryList([], [gen('tomato'), gen('onion')]);
    expect(r.items).toHaveLength(2);
    expect(r.items.every((i) => !i.checked && i.source === 'plan')).toBe(true);
  });

  it('never emits the same key twice', () => {
    const r = mergeGroceryList(
      [item('tomato', { checked: true }), item('bin bag', { source: 'manual' })],
      [gen('tomato'), gen('onion')],
    );
    const keys = r.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('one item however it was written', () => {
  it('merges plurals and preparation words', () => {
    expect(itemKey('Tomatoes')).toBe(itemKey('tomato'));
    expect(itemKey('Chopped onion')).toBe(itemKey('Onions'));
    expect(itemKey('Fresh coriander (chopped)')).toBe(itemKey('coriander'));
  });

  it('keeps genuinely different things apart', () => {
    expect(itemKey('green chilli')).not.toBe(itemKey('red chilli'));
    expect(itemKey('sweet potato')).not.toBe(itemKey('potato'));
  });
});
