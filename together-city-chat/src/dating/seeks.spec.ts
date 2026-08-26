import { seeks } from './matching';

/**
 * P3: a bisexual citizen could not say so — the column offered one gender or
 * 'any', and 'any' is not what bisexual means. A `seekingList` in the extras
 * refines the column; the column stays what SQL narrows on.
 */
describe('who somebody seeks, said precisely', () => {
  it('the column alone behaves exactly as before', () => {
    expect(seeks('any', {}, 'male')).toBe(true);
    expect(seeks('female', {}, 'female')).toBe(true);
    expect(seeks('female', {}, 'male')).toBe(false);
    expect(seeks('female', null, 'male')).toBe(false);
  });

  it('a list overrides the column — men and women is bisexual, not anyone', () => {
    const bi = { seekingList: ['male', 'female'] };
    expect(seeks('any', bi, 'male')).toBe(true);
    expect(seeks('any', bi, 'female')).toBe(true);
    expect(seeks('any', bi, 'nonbinary')).toBe(false);
  });

  it('a list can also widen a stale column, so the two never fight', () => {
    expect(seeks('female', { seekingList: ['male', 'female', 'nonbinary'] }, 'male')).toBe(true);
  });

  it('junk in the list is dropped unread, and an emptied list defers to the column', () => {
    expect(seeks('female', { seekingList: ['gibberish', 42] as unknown as string[] }, 'female')).toBe(true);
    expect(seeks('female', { seekingList: [] }, 'male')).toBe(false);
  });
});
