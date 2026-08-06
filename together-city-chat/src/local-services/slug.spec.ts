import { normaliseSlug, slugProblem, suggestSlug, looksLikeId, RESERVED_SLUGS } from './slug';

/**
 * AN ADDRESS A SHOPKEEPER CAN SAY DOWN A PHONE.
 *
 * These are not cosmetic rules. Each one exists because of a way a business's
 * own URL can become somebody else's problem: a shop that shadows the Messages
 * screen, two shops at the same address, an address that changes shape between
 * the form and the database, or a "name" that is really a UUID and looks to a
 * citizen like the app leaking its own plumbing.
 */
describe('what a business may call its page', () => {
  it('turns what a person types into the one form that reaches the shop', () => {
    expect(normaliseSlug('Anna Idli')).toBe('anna-idli');
    expect(normaliseSlug('  SHARMA   Plumbing!! ')).toBe('sharma-plumbing');
    // Underscores go: an underscore disappears under a link's underline, and an
    // address you cannot read aloud from a screen is not an address.
    expect(normaliseSlug('looks_salon')).toBe('looks-salon');
    expect(normaliseSlug('--anna--idli--')).toBe('anna-idli');
  });

  it('refuses the words the router reads first', () => {
    // If a business took "messages", its page would be unreachable and the
    // Messages screen would look, to a citizen, like it had become a salon.
    for (const w of ['messages', 'regulars', 'offers', 'mine', 'browse', 'list']) {
      expect(RESERVED_SLUGS).toContain(w);
      expect(slugProblem(w)).toBe('reserved');
    }
  });

  it('refuses a name that is really an id', () => {
    expect(slugProblem('58fcf888-dbdd-4ff7-aac9-e426e891a9bd')).toBe('looksLikeAnId');
    expect(looksLikeId('58fcf888-dbdd-4ff7-aac9-e426e891a9bd')).toBe(true);
    expect(looksLikeId('anna-idli')).toBe(false);
  });

  it('refuses what it cannot make unambiguous', () => {
    expect(slugProblem('ab')).toBe('tooShort');
    expect(slugProblem('anna--idli')).toBe('shape');
    expect(slugProblem('-anna')).toBe('shape');
    expect(slugProblem('anna-')).toBe('shape');
    expect(slugProblem('Anna')).toBe('shape');
    expect(slugProblem('a'.repeat(41))).toBe('tooLong');
    expect(slugProblem('anna-idli-2')).toBeNull();
  });

  it('every address it hands out is one it would accept', () => {
    // The suggester and the validator drifting apart would mean a listing
    // created with an address its own edit screen then refuses to save.
    const names = ['Anna Idli', 'messages', 'A&B', '   ', 'x', 'Sharma Plumbing & Sons Pvt Ltd Mumbai Andheri West'];
    for (const n of names) {
      const s = suggestSlug(n, []);
      if (s) expect(slugProblem(s)).toBeNull();
    }
  });

  it('counts up rather than reaching for randomness', () => {
    // "anna-idli-2" is a second Anna Idli, which is what it is and what a
    // citizen can read. A hash would be unique and mean nothing.
    expect(suggestSlug('Anna Idli', [])).toBe('anna-idli');
    expect(suggestSlug('Anna Idli', ['anna-idli'])).toBe('anna-idli-2');
    expect(suggestSlug('Anna Idli', ['anna-idli', 'anna-idli-2'])).toBe('anna-idli-3');
  });

  it('never suggests a reserved word, even when the name is one', () => {
    const s = suggestSlug('Messages', []);
    expect(RESERVED_SLUGS).not.toContain(s);
    expect(slugProblem(s)).toBeNull();
  });

  it('keeps a suggestion inside the length limit when the name is long', () => {
    const long = 'Sharma Plumbing and Sanitary Works Private Limited Andheri';
    const taken = [normaliseSlug(long).slice(0, 40).replace(/-+$/, '')];
    const s = suggestSlug(long, taken);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(slugProblem(s)).toBeNull();
  });
});
