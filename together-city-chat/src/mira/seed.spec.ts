import { AskSchema, GreetSchema, SEED_MAX } from './mira.controller';

/**
 * The seed is one number that crosses a package boundary, and it broke on the
 * first day it was used.
 *
 * `daySeed()` in the web app returns `hash % 10_000_000`. `GreetSchema` accepted
 * that. `AskSchema` — written three commits earlier, and never revisited —
 * capped at 1_000_000. So on any day whose seed exceeded a million, the greeting
 * returned 200 and EVERY ask returned 400, and the thread said "I'm not reaching
 * the city right now" while the city was up and answering the greeting.
 *
 * The land script had a gate for exactly this. It read only the `z.coerce`
 * spelling of the bound, matched the greeting, compared it against the web, and
 * reported both agreed. It was measuring one of the two places the number lived.
 *
 * So the property is asserted here, from inside, where a regex cannot miss a
 * spelling: BOTH schemas take the largest number the web can produce.
 */
describe('one seed ceiling, and both routes honour it', () => {
  it('the ask accepts the largest seed the web can send', () => {
    expect(AskSchema.safeParse({ text: 'hi', seed: SEED_MAX }).success).toBe(true);
  });

  it('the greeting accepts the largest seed the web can send', () => {
    expect(GreetSchema.safeParse({ hour: 9, seed: SEED_MAX }).success).toBe(true);
  });

  /** Both must still be bounded — the point is one ceiling, not no ceiling. */
  it('neither takes one more than that', () => {
    expect(AskSchema.safeParse({ text: 'hi', seed: SEED_MAX + 1 }).success).toBe(false);
    expect(GreetSchema.safeParse({ hour: 9, seed: SEED_MAX + 1 }).success).toBe(false);
  });

  it('and the seed stays optional on the ask, so an older client still gets an answer', () => {
    expect(AskSchema.safeParse({ text: 'hi' }).success).toBe(true);
  });

  /**
   * AND OPTIONAL ON THE GREETING TOO, NOW THAT THE SERVER DECIDES IT.
   *
   * The seed picks which Mira turned up, and it was computed in the browser
   * from the date and a per-device salt — so she was a different character on
   * the phone and on the laptop on the same afternoon. It is derived from the
   * citizen and their local day now and answered on the reply; the client's
   * copy is a fallback for an older server, so the field must not be required.
   */
  it('the greeting no longer demands one', () => {
    expect(GreetSchema.safeParse({ hour: 9 }).success).toBe(true);
    expect(GreetSchema.safeParse({}).success).toBe(true);
  });
});
