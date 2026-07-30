import { alreadyGreeted, greetHtml, greetSms, greetText } from './greet';

describe('every message opens by addressing the reader', () => {
  describe('greetText', () => {
    it('prepends the salutation', () => {
      expect(greetText('Your tickets are booked.', 'Somen Kumar'))
        .toBe('Dear Somen,\n\nYour tickets are booked.');
    });

    it('says "Dear user," when there is no name', () => {
      expect(greetText('Your tickets are booked.', '')).toMatch(/^Dear user,/);
    });

    it('does not greet twice', () => {
      // The blood-test narrative writes its own salutation. Two is worse than
      // none.
      const body = 'Dear Somen,\n\nYour haemoglobin is 11.7 g/dL.';
      expect(greetText(body, 'Somen')).toBe(body);
    });

    it('recognises informal openings too', () => {
      expect(greetText('Hi Somen,\n\nWelcome.', 'Somen')).toMatch(/^Hi Somen,/);
    });

    it('ignores leading blank lines when looking for a greeting', () => {
      expect(greetText('\n\nDear Somen,\n\nHello.', 'Somen')).toMatch(/^\n\nDear Somen,/);
    });

    it('does not mistake "Dear" mid-sentence for a salutation', () => {
      const body = 'Your booking at Dear Prudence Cafe is confirmed.';
      expect(greetText(body, 'Somen')).toBe('Dear Somen,\n\n' + body);
    });
  });

  describe('greetSms', () => {
    it('greets inline so the code still shows in a lock-screen preview', () => {
      expect(greetSms('123456 is your Together City verification code.', 'Somen Kumar'))
        .toBe('Dear Somen, 123456 is your Together City verification code.');
    });

    it('does not greet twice', () => {
      expect(greetSms('Dear Somen, your code is 123456.', 'Somen'))
        .toBe('Dear Somen, your code is 123456.');
    });

    it('still says "Dear user," with no name', () => {
      expect(greetSms('123456 is your code.', null)).toBe('Dear user, 123456 is your code.');
    });
  });

  describe('greetHtml', () => {
    it('puts the salutation above the heading, where a letter has it', () => {
      const html = '<body><div><h1>Reset your password</h1><p>…</p></div></body>';
      const out = greetHtml(html, 'Somen Kumar');
      expect(out.indexOf('Dear Somen,')).toBeLessThan(out.indexOf('<h1'));
    });

    it('falls back to just inside <body> when there is no heading', () => {
      const out = greetHtml('<body><p>Hello world</p></body>', 'Somen');
      expect(out).toMatch(/<body><p style[^>]*>Dear Somen,<\/p><p>Hello world/);
    });

    it('handles a bare fragment', () => {
      expect(greetHtml('<p>Hi there</p>', 'Somen')).toMatch(/^<p style/);
    });

    it('does not greet twice, even through markup', () => {
      // The salutation is wrapped in a tag; stripping markup is what lets the
      // check see it.
      const html = '<body><p><strong>Dear Somen,</strong></p><h1>Your results</h1></body>';
      expect(greetHtml(html, 'Somen')).toBe(html);
    });

    it('escapes a citizen-supplied name', () => {
      // Names go into an email body verbatim everywhere else in this codebase.
      const out = greetHtml('<h1>Hi</h1>', '<script>alert(1)</script>');
      expect(out).not.toContain('<script>');
      expect(out).toContain('&lt;script&gt;');
    });

    it('leaves an empty body alone', () => {
      expect(greetHtml('', 'Somen')).toBe('');
    });
  });

  describe('alreadyGreeted', () => {
    it.each(['Dear Somen,', 'Hi Somen,', 'Hello,', 'Hey Somen,'])('sees %s', (s) => {
      expect(alreadyGreeted(s)).toBe(true);
    });

    it.each([
      'Your tickets are booked.',
      '',
      'Dearest friend',
      // The comma is what makes it a salutation. Without this, a message whose
      // body opens "Hello world" or "Hi there" would silently never be greeted.
      'Hello world',
      'Hi there — your plan is ready',
      'Dear Prudence Cafe is confirmed for 8pm.',
    ])('does not see %s', (s) => {
      expect(alreadyGreeted(s)).toBe(false);
    });
  });
});
