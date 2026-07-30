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
    expect(describeFromAddress('Together City <hello@togethercity.app>'))
      .toEqual({ ok: true, value: 'Together City <hello@togethercity.app>' });
  });

  it('accepts a bare address', () => {
    expect(describeFromAddress('hello@togethercity.app'))
      .toEqual({ ok: true, value: 'hello@togethercity.app' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(describeFromAddress('  Together City <hello@togethercity.app>  '))
      .toEqual({ ok: true, value: 'Together City <hello@togethercity.app>' });
  });

  it('REPAIRS the exact value that broke production, and says it did', () => {
    // This started life as a rejection. It became a repair when Railway's
    // variable editor turned out to drop the closing ">" on save — which makes
    // this a defect the configuration UI inflicts on you rather than one you can
    // avoid by typing carefully. Refusing to send in that situation punishes the
    // operator for someone else's bug.
    //
    // It is safe to repair because it is not a guess: one opening bracket, a
    // valid address after it, nothing closing it. There is exactly one thing
    // that can mean.
    const v = describeFromAddress('Together City <hello@togethercity.app');
    expect(v).toEqual({
      ok: true,
      value: 'Together City <hello@togethercity.app>',
      repaired: true,
    });
  });

  it('does not claim a repair when none was needed', () => {
    // The flag drives a warning log. Setting it on a healthy value would train
    // people to ignore that warning.
    expect(describeFromAddress('Together City <hello@togethercity.app>').repaired).toBeUndefined();
    expect(describeFromAddress('hello@togethercity.app').repaired).toBeUndefined();
  });

  it('returns the value to actually use, so callers never re-parse', () => {
    expect(describeFromAddress('  hello@togethercity.app  ').value).toBe('hello@togethercity.app');
  });

  it.each([
    ['missing opening bracket', 'Together City hello@togethercity.app>'],
    ['brackets the wrong way round', 'Together City >hello@togethercity.app<'],
    ['nothing inside the brackets', 'Together City <>'],
    ['no domain', 'Together City <hello>'],
    ['no at sign', 'Together City <hello.togethercity.app>'],
    ['no dot in the domain', 'hello@localhost'],
    ['a space inside the address', 'Together City <hello @togethercity.app>'],
    ['a truncated bracket around a NON-address', 'Together City <not-an-address'],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, value) => {
    expect(describeFromAddress(value).ok).toBe(false);
  });

  it('repairs only the unambiguous truncation, never a guess', () => {
    // The repair is deliberately narrow. If what follows "<" is not an address,
    // there is more than one thing the value could have meant, and the right
    // answer is to refuse rather than to invent one.
    expect(describeFromAddress('Together City <hello@togethercity.app').ok).toBe(true);
    expect(describeFromAddress('Together City <hello').ok).toBe(false);
    expect(describeFromAddress('Together City <hello@').ok).toBe(false);
  });

  it('always explains itself when it refuses', () => {
    for (const bad of ['', 'Together City <hello', 'nonsense', 'a@b']) {
      const v = describeFromAddress(bad);
      expect(v.ok).toBe(false);
      expect(v.reason && v.reason.length).toBeGreaterThan(20);
    }
  });

  it('tells the reader what a valid value looks like', () => {
    // A rejection that does not show the correct shape just moves the guessing
    // from the config file to the error message.
    const v = describeFromAddress('Together City <not-an-address');
    expect(v.reason).toMatch(/Display Name <user@domain>/);
  });
});
