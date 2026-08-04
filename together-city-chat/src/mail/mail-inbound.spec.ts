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

describe('timingSafeEqualStr', () => {
  it('true for equal secrets', () => {
    expect(timingSafeEqualStr('s3cret', 's3cret')).toBe(true);
  });
  it('false for different secrets, including different lengths', () => {
    expect(timingSafeEqualStr('s3cret', 's3creX')).toBe(false);
    expect(timingSafeEqualStr('short', 'longer-secret')).toBe(false);
  });
});
