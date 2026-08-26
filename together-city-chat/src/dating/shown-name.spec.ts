import { shownName } from './matching';

/**
 * The chosen name is a stored blob read back to strangers, so the read is
 * defensive: collapsed, capped, and never empty — the account name is the
 * floor it can never fall through.
 */
describe('the name a person chose to be seen under', () => {
  it('prefers the chosen name, tidied', () => {
    expect(shownName({ firstName: 'Maya' }, 'Account Name')).toBe('Maya');
    expect(shownName({ firstName: '  Maya\n Rao  ' }, 'Account Name')).toBe('Maya Rao');
  });

  it('falls back to the account name when nothing usable was chosen', () => {
    expect(shownName({}, 'Account Name')).toBe('Account Name');
    expect(shownName(null, 'Account Name')).toBe('Account Name');
    expect(shownName({ firstName: '   ' }, 'Account Name')).toBe('Account Name');
    expect(shownName({ firstName: 42 as unknown as string }, 'Account Name')).toBe('Account Name');
  });

  it('caps a name that would not fit on a card', () => {
    expect(shownName({ firstName: 'x'.repeat(120) }, 'A')).toHaveLength(40);
  });
});
