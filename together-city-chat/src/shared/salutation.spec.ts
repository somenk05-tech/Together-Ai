import { firstName, informalName, salutation } from './salutation';

describe('how the city addresses a citizen', () => {
  it('uses the first name', () => {
    expect(salutation('Somen Kumar')).toBe('Dear Somen,');
    expect(firstName('Somen Kumar')).toBe('Somen');
  });

  it('handles a single name', () => {
    expect(salutation('Priya')).toBe('Dear Priya,');
  });

  it('says "Dear user," when there is no name — never "Dear ,"', () => {
    // The bug this replaces: medical.service built its greeting from
    // `(user?.name ?? 'there').split(' ')[0]`, and ?? does not catch an empty
    // string. A citizen who had not filled in their name was greeted "Dear ,"
    // directly above their own lab results.
    expect(salutation('')).toBe('Dear user,');
    expect(salutation('   ')).toBe('Dear user,');
    expect(salutation(null)).toBe('Dear user,');
    expect(salutation(undefined)).toBe('Dear user,');
  });

  it('splits on any whitespace, not just a space', () => {
    // Names arrive from forms with tabs and non-breaking spaces attached.
    expect(firstName('Somen\tKumar')).toBe('Somen');
    expect(firstName('Somen Kumar')).toBe('Somen');
    expect(firstName('  Somen   Kumar  ')).toBe('Somen');
  });

  it('does not greet somebody by their email address', () => {
    // An email in the name field is a sign-up mistake. "Dear somen," beats
    // "Dear somen@gmail.com,".
    expect(salutation('somen@gmail.com')).toBe('Dear somen,');
  });

  it('caps a name that is not a name', () => {
    expect(firstName('x'.repeat(200))?.length).toBe(40);
  });

  it('keeps names that are not English', () => {
    expect(firstName('सोमेन कुमार')).toBe('सोमेन');
    expect(salutation('李 明')).toBe('Dear 李,');
  });

  it('does not choke on punctuation-only input', () => {
    expect(salutation('@')).toBe('Dear user,');
  });

  describe('informalName', () => {
    it('falls back to "there" rather than "user"', () => {
      // "What's happening, there" reads better on the feed than "…, user".
      expect(informalName('Somen Kumar')).toBe('Somen');
      expect(informalName('')).toBe('there');
    });
  });
});
