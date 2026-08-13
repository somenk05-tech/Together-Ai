import { cityRecipient, handleFromAddress, subAddressed } from './mail.constants';

/**
 * SUB-ADDRESSED MAIL HAS NEVER ARRIVED, AND THAT IS THE BUG UNDER THIS FILE.
 *
 * The old parser scrubbed everything outside [a-z0-9._-] out of the local
 * part, so `nikhil+abg@togethercity.app` resolved to the handle `nikhilabg` —
 * a mailbox nobody has — and ingestInbound dropped the message as having no
 * city recipient. Nothing failed loudly; the mail simply never came.
 *
 * Project folders are the reason it was noticed, but the fix is not about
 * projects: a `+` in an address is a convention every mail system on earth
 * honours, and a city that silently eats mail addressed with one has a bug
 * whether or not anything reads the tag.
 */
describe('city addresses carry a mailbox and, sometimes, a tag', () => {
  it('reads a plain city address as the mailbox and no tag', () => {
    expect(cityRecipient('nikhil@togethercity.app')).toEqual({ handle: 'nikhil', tag: null });
  });

  it('delivers a sub-addressed message to the MAILBOX, not to a handle that does not exist', () => {
    // The whole regression, stated as one assertion.
    expect(cityRecipient('nikhil+abg@togethercity.app')).toEqual({ handle: 'nikhil', tag: 'abg' });
    expect(handleFromAddress('nikhil+abg@togethercity.app')).toBe('nikhil');
  });

  it('keeps working on the legacy city domain, which people still have written down', () => {
    expect(cityRecipient('nikhil+abg@togethercity.tech')).toEqual({ handle: 'nikhil', tag: 'abg' });
  });

  it('is case-insensitive, because nobody types an address the way it was printed', () => {
    expect(cityRecipient('Nikhil+ABG@TogetherCity.app')).toEqual({ handle: 'nikhil', tag: 'abg' });
  });

  it('refuses an address that is not this city, so a stranger cannot name a mailbox here', () => {
    expect(cityRecipient('nikhil+abg@gmail.com')).toBeNull();
    expect(handleFromAddress('someone@example.org')).toBeNull();
  });

  it('treats an empty tag as no tag, so a trailing + files nothing anywhere', () => {
    expect(cityRecipient('nikhil+@togethercity.app')).toEqual({ handle: 'nikhil', tag: null });
    expect(cityRecipient('nikhil+...@togethercity.app')).toEqual({ handle: 'nikhil', tag: null });
  });

  it('never lets a tag become the mailbox', () => {
    // A local part that is nothing but a tag names nobody. It must not fall
    // back to the tag, or `+abg@` would deliver to a citizen called abg.
    expect(cityRecipient('+abg@togethercity.app')).toBeNull();
  });

  it('builds the address a project hands out from the citizen’s own', () => {
    expect(subAddressed('nikhil@togethercity.app', 'abg')).toBe('nikhil+abg@togethercity.app');
  });
});
