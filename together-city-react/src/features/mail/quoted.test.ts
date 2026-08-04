import { describe, it, expect } from 'vitest';
import { splitQuoted, stripCityFooter } from './quoted';

/**
 * Built from the real thread on the owner's account, 4 Aug 2026 — a Gmail reply
 * that arrived carrying two previous messages, our own footer, and a signature
 * block, for four words of new text.
 */
const GMAIL_REPLY = [
  'hello how are you ? are you getting this message',
  '',
  'Regards',
  '',
  'Somen K',
  'Director/ Producer/Partner',
  '',
  'On Tue, Aug 4, 2026 at 4:28 PM Somen K <somenk05@gmail.com> wrote:',
  '',
  '> hi are you getting my emails',
  '>',
  '> Regards',
  '>',
  '>> are you getting my email',
].join('\n');

describe('splitQuoted', () => {
  it('keeps the new text and folds the history away', () => {
    const { latest, quoted } = splitQuoted(GMAIL_REPLY);
    expect(latest).toContain('hello how are you');
    expect(latest).toContain('Somen K');            // the signature is theirs, not history
    expect(latest).not.toContain('On Tue, Aug 4');
    expect(quoted).toMatch(/^On Tue, Aug 4/);
    expect(quoted).toContain('> hi are you getting my emails');
  });

  it('handles an attribution line wrapped onto two lines', () => {
    const body = ['ok', '', 'On Tue, Aug 4, 2026 at 4:28 PM Somen K <a@b.com>', 'wrote:', '> hi'].join('\n');
    expect(splitQuoted(body).latest).toBe('ok');
  });

  it('recognises Outlook, both ways round', () => {
    const original = ['sure', '', '-----Original Message-----', 'From: a@b.com'].join('\n');
    expect(splitQuoted(original).latest).toBe('sure');
    const headers = ['sure', '', 'From: A <a@b.com>', 'Sent: Tuesday', 'To: b@c.com'].join('\n');
    expect(splitQuoted(headers).latest).toBe('sure');
  });

  it('needs a RUN of quoted lines, not one', () => {
    // Somebody quoting a single sentence mid-message is writing, not quoting a
    // whole email. Collapsing there would hide what they said next.
    const one = ['as you said:', '> just the one line', 'and here is my answer'].join('\n');
    expect(splitQuoted(one).quoted).toBe('');
    const run = ['see below', '> a', '> b', '> c'].join('\n');
    expect(splitQuoted(run).latest).toBe('see below');
  });

  it('shows the whole thing when there is nothing to fold', () => {
    expect(splitQuoted('just a message').quoted).toBe('');
    expect(splitQuoted('').latest).toBe('');
  });

  it('never hides everything', () => {
    // A forward with no comment is entirely quotation. Collapsing it would leave
    // an empty message, which is the same bug pointed the other way.
    const forward = ['On Tue, Aug 4, 2026 at 4:28 PM A <a@b.com> wrote:', '> hi', '> there', '> you'].join('\n');
    const { latest, quoted } = splitQuoted(forward);
    expect(latest).toContain('> hi');
    expect(quoted).toBe('');
  });
});

describe('stripCityFooter', () => {
  const RULE = '─'.repeat(28);
  it('removes our own footer from the top-level body', () => {
    const body = `are you getting my email\n\n${RULE}\nSent by somen (somen@togethercity.app) via Together City Mail.`;
    expect(stripCityFooter(body)).toBe('are you getting my email');
  });
  it('leaves a body that does not carry one alone', () => {
    expect(stripCityFooter('plain message')).toBe('plain message');
  });
  it('leaves the footer inside quoted history, which is a record of what was sent', () => {
    const quoted = `> ${RULE}\n> Sent by somen (somen@togethercity.app) via Together City Mail.`;
    expect(stripCityFooter(quoted)).toBe(quoted);
  });
});
