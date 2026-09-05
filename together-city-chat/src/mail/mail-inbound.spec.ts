import { cityFromHeader, parseAddr, toAddrList, normalizeInbound, timingSafeEqualStr } from './mail-inbound';

describe('cityFromHeader — a message leaves AS the citizen', () => {
  it('uses the citizen city address as the sender', () => {
    expect(cityFromHeader('Somen K', 'somen2@togethercity.app')).toBe('Somen K <somen2@togethercity.app>');
  });
  it('quotes a display name with a comma so the header is valid', () => {
    expect(cityFromHeader('Doe, Jane', 'jane@togethercity.app')).toBe('"Doe, Jane" <jane@togethercity.app>');
  });
  it('escapes quotes/backslashes inside the display name', () => {
    expect(cityFromHeader('a"b\\c', 'x@togethercity.app')).toBe('"a\\"b\\\\c" <x@togethercity.app>');
  });
  it('falls back to a bare address when there is no name', () => {
    expect(cityFromHeader('', 'x@togethercity.app')).toBe('x@togethercity.app');
  });
  it('never lets a newline break out of the header', () => {
    expect(cityFromHeader('Evil\nName', 'x@togethercity.app')).toBe('Evil Name <x@togethercity.app>');
  });
});

describe('parseAddr', () => {
  it('splits "Name <addr>"', () => {
    expect(parseAddr('Somen K <somen2@togethercity.app>')).toEqual({ addr: 'somen2@togethercity.app', name: 'Somen K' });
  });
  it('lowercases a bare address', () => {
    expect(parseAddr('SOMEN2@Togethercity.App')).toEqual({ addr: 'somen2@togethercity.app', name: '' });
  });
});

describe('toAddrList — reply To may take several shapes', () => {
  it('a single string', () => {
    expect(toAddrList('somen2@togethercity.app')).toEqual(['somen2@togethercity.app']);
  });
  it('an array of "Name <addr>" strings', () => {
    expect(toAddrList(['A <a@togethercity.app>', 'b@togethercity.app'])).toEqual(['a@togethercity.app', 'b@togethercity.app']);
  });
  it('an array of { address } objects', () => {
    expect(toAddrList([{ address: 'a@togethercity.app' }, { email: 'b@togethercity.app' }])).toEqual(['a@togethercity.app', 'b@togethercity.app']);
  });
});

describe('normalizeInbound — a reply is parsed to route to the right citizen', () => {
  it('parses a { type, data } envelope', () => {
    const out = normalizeInbound({
      type: 'email.received',
      data: { to: ['somen2@togethercity.app'], from: 'Alice <alice@gmail.com>', subject: 'Re: hi', text: 'hello back', message_id: '<abc@mail>' },
    });
    expect(out).toEqual({
      to: ['somen2@togethercity.app'],
      from: { addr: 'alice@gmail.com', name: 'Alice' },
      subject: 'Re: hi',
      text: 'hello back',
      html: undefined,
      providerMessageId: '<abc@mail>',
      emailId: undefined,
      // Read since 5 Sep; this payload lists none.
      attachments: [],
      // Empty because this payload names no parent. The threading fields are
      // parsed now; see a-reply-names-its-own-thread.spec.ts for the shapes
      // that fill them.
      inReplyTo: [],
      // NULL, NOT FALSE: this payload carries no verdict at all, and "the
      // provider said nothing" is a different fact from "the provider said no".
      // What they have in common is that neither is proof, which is why the
      // subject heuristic refuses both — see a-reply-names-its-own-thread.
      authenticated: null,
    });
  });
  it('parses a bare email object with an object from', () => {
    const out = normalizeInbound({ to: 'somen2@togethercity.app', from: { address: 'bob@gmail.com', name: 'Bob' }, subject: 's', html: '<p>hi</p>' });
    expect(out?.from).toEqual({ addr: 'bob@gmail.com', name: 'Bob' });
    expect(out?.to).toEqual(['somen2@togethercity.app']);
  });
  it('returns null when there is no recipient or sender', () => {
    expect(normalizeInbound({ subject: 'x' })).toBeNull();
    expect(normalizeInbound(null)).toBeNull();
    expect(normalizeInbound('nope')).toBeNull();
  });
});

describe('normalizeInbound — the body is NOT in the webhook', () => {
  /**
   * Resend's own payload for email.received, field for field: from, to,
   * subject, message_id, email_id, attachment METADATA — and no text, no html.
   * "Webhooks do not include the email body, headers, or attachments, only
   * their metadata."
   */
  const REAL_PAYLOAD = {
    type: 'email.received',
    data: {
      email_id: '5e4d5e4d-5e4d-5e4d-5e4d-5e4d5e4d5e4d',
      created_at: '2026-08-04T10:40:00.000Z',
      from: 'somenk05@gmail.com',
      to: ['somen2@togethercity.app'],
      bcc: [], cc: [], received_for: [],
      message_id: '<CAF=abc@mail.gmail.com>',
      subject: 'Re: hi',
      attachments: [],
    },
  };

  it('routes correctly and carries the id the body must be fetched with', () => {
    const out = normalizeInbound(REAL_PAYLOAD);
    expect(out?.to).toEqual(['somen2@togethercity.app']);
    expect(out?.from.addr).toBe('somenk05@gmail.com');
    expect(out?.subject).toBe('Re: hi');
    expect(out?.emailId).toBe('5e4d5e4d-5e4d-5e4d-5e4d-5e4d5e4d5e4d');
  });

  it('has no body to read, which is the whole point', () => {
    const out = normalizeInbound(REAL_PAYLOAD);
    // If this ever starts passing with a body, Resend changed the contract and
    // the fetch in MailService.inboundBody can be reconsidered. Until then, a
    // parser that trusts data.text files empty mail.
    expect(out?.text).toBe('');
    expect(out?.html).toBeUndefined();
  });

  it('still honours a payload that DOES carry text', () => {
    // A different provider, or a replayed fixture, should not need a network
    // round trip to be filed.
    const out = normalizeInbound({ to: 'a@togethercity.app', from: 'b@x.com', text: 'inline body' });
    expect(out?.text).toBe('inline body');
    expect(out?.emailId).toBeUndefined();
  });
});

describe('timingSafeEqualStr', () => {
  it('true for equal secrets', () => {
    expect(timingSafeEqualStr('s3cret', 's3cret')).toBe(true);
  });
  it('false for different secrets, including different lengths', () => {
    expect(timingSafeEqualStr('s3cret', 's3creX')).toBe(false);
    expect(timingSafeEqualStr('short', 'longer-secret')).toBe(false);
  });
});
