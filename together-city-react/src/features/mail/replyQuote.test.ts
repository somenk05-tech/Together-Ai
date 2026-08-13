import { describe, it, expect } from 'vitest';
import { quoteBlock, withQuote, QUOTE_LINE_CAP } from './replyQuote';
import { splitQuoted } from './quoted';

const msg = (over: Partial<Parameters<typeof quoteBlock>[0]> = {}) => ({
  fromName: 'Somen K',
  fromAddr: 'somen@togethercity.app',
  body: 'hello how are you',
  createdAt: '2026-08-14T02:09:00.000Z',
  ...over,
});

describe('the quotation a reply carries', () => {
  it('writes the attribution line and prefixes every line', () => {
    const q = quoteBlock(msg({ body: 'line one\nline two' }));
    expect(q).toMatch(/^On .*Somen K <somen@togethercity\.app> wrote:$/m);
    expect(q).toContain('> line one');
    expect(q).toContain('> line two');
  });

  it('keeps a blank line quoted, so a paragraph break survives', () => {
    expect(quoteBlock(msg({ body: 'a\n\nb' }))).toContain('> a\n>\n> b');
  });

  it('drops our own footer before quoting it', () => {
    // The most repeated string in any thread. Left in, it is re-quoted on
    // every exchange until the message is mostly footer.
    const body = 'yes\n\n────────────────────────────\nSent by Somen K (somen@togethercity.app) via Together City Mail.';
    const q = quoteBlock(msg({ body }));
    expect(q).not.toMatch(/via Together City Mail/);
    expect(q).toContain('> yes');
  });

  it('says out loud when it stops, rather than trimming in silence', () => {
    const body = Array.from({ length: QUOTE_LINE_CAP + 12 }, (_, i) => `line ${i}`).join('\n');
    const q = quoteBlock(msg({ body }));
    expect(q).toContain(`> … 12 more lines`);
    expect(q).not.toContain(`> line ${QUOTE_LINE_CAP + 1}`);
  });

  it('uses the bare address when there is no name to use', () => {
    const q = quoteBlock(msg({ fromName: '', fromAddr: 'someone@example.com' }));
    expect(q).toMatch(/, someone@example\.com wrote:$/m);
    // and does not write "addr <addr>"
    expect(q).not.toContain('someone@example.com <someone@example.com>');
  });
});

describe('what is sent, and what comes back', () => {
  it('puts two blank-separated parts together in that order', () => {
    expect(withQuote('sure', '> old')).toBe('sure\n\n> old');
  });

  it('returns the typed text untouched when there is nothing to quote', () => {
    expect(withQuote('sure', '')).toBe('sure');
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR. quoted.ts collapses a reply's history
   * on the read side; this writes it on the send side. Two files agreeing by
   * inspection is how they drift — so the round trip is asserted, not assumed.
   */
  it('round-trips: what we write, our own reader splits back apart', () => {
    const sent = withQuote('Tuesday works for me.', quoteBlock(msg({ body: 'Are you free Tuesday?' })));
    const { latest, quoted } = splitQuoted(sent);
    expect(latest).toBe('Tuesday works for me.');
    expect(quoted).toMatch(/^On .*wrote:/);
    expect(quoted).toContain('> Are you free Tuesday?');
  });

  it('round-trips a reply to a reply, so the second exchange collapses too', () => {
    const first = withQuote('Tuesday works.', quoteBlock(msg({ body: 'Are you free Tuesday?' })));
    const second = withQuote('2pm then.', quoteBlock(msg({ body: first, createdAt: '2026-08-14T03:00:00.000Z' })));
    const { latest } = splitQuoted(second);
    expect(latest).toBe('2pm then.');
  });
});
