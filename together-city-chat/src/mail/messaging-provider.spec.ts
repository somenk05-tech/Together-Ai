import { describeFromAddress } from './messaging-provider';

/**
 * The regression test for a week of silent failure.
 *
 * EMAIL_FROM was set to "Together City <hello@togethercity.app" — one missing
 * closing bracket — and Resend refused every message with a 422 that nothing
 * logged. These cases exist so that shape can never be called valid again.
 */
describe('describeFromAddress', () => {
  it('accepts a display name with a bracketed address', () => {
    expect(describeFromAddress('Together City <hello@togethercity.app>')).toEqual({ ok: true });
  });

  it('accepts a bare address', () => {
    expect(describeFromAddress('hello@togethercity.app')).toEqual({ ok: true });
  });

  it('tolerates surrounding whitespace', () => {
    expect(describeFromAddress('  Together City <hello@togethercity.app>  ')).toEqual({ ok: true });
  });

  it('REJECTS the exact value that broke production', () => {
    const v = describeFromAddress('Together City <hello@togethercity.app');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/unbalanced angle brackets/);
  });

  it.each([
    ['missing opening bracket', 'Together City hello@togethercity.app>'],
    ['brackets the wrong way round', 'Together City >hello@togethercity.app<'],
    ['nothing inside the brackets', 'Together City <>'],
    ['no domain', 'Together City <hello>'],
    ['no at sign', 'Together City <hello.togethercity.app>'],
    ['no dot in the domain', 'hello@localhost'],
    ['a space inside the address', 'Together City <hello @togethercity.app>'],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, value) => {
    expect(describeFromAddress(value).ok).toBe(false);
  });

  it('always explains itself when it refuses', () => {
    for (const bad of ['', 'Together City <hello@togethercity.app', 'nonsense', 'a@b']) {
      const v = describeFromAddress(bad);
      expect(v.ok).toBe(false);
      expect(v.reason && v.reason.length).toBeGreaterThan(20);
    }
  });

  it('tells the reader what a valid value looks like', () => {
    // A rejection that does not show the correct shape just moves the guessing
    // from the config file to the error message.
    const v = describeFromAddress('Together City <hello@togethercity.app');
    expect(v.reason).toMatch(/Display Name <user@domain>/);
  });
});
