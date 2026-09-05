import { readFileSync } from 'fs';
import { join } from 'path';
import { derivedSecret, purposeSecret } from './derived-secret';
import { addressFromUnsubscribeToken, unsubscribeToken } from '../../mail/mail-inbound';
import { createHmac } from 'crypto';

/**
 * ── ONE SECRET PER THING THAT CAN BE HANDED OUT (launch gate, third
 *    reading, 4 Sep) ──────────────────────────────────────────────────────
 *
 * The Worker held the JWT access secret. It derived its own media key from
 * it, which kept the TOKENS apart and the SECRET shared: anyone who read the
 * Worker's LINK_SECRET could sign an access token for any account. The root
 * stays in the API now and hands out per-purpose values.
 */
const SRC = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('one secret per thing', () => {
  it('a derived secret is one-way, 64 hex chars, and differs by purpose', () => {
    const a = derivedSecret('root-secret-that-is-long-enough-to-count', 'media-link');
    const b = derivedSecret('root-secret-that-is-long-enough-to-count', 'mail-unsubscribe');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('root-secret');
  });

  it('an explicit variable pins a purpose; blank falls through to the derivation', () => {
    expect(purposeSecret('explicit-value', 'root', 'media-link')).toBe('explicit-value');
    expect(purposeSecret('   ', 'root', 'media-link')).toBe(derivedSecret('root', 'media-link'));
    expect(purposeSecret(undefined, 'root', 'media-link')).toBe(derivedSecret('root', 'media-link'));
  });

  it('the storage provider signs links with media.linkSecret, never jwt.accessSecret', () => {
    const provider = strip(read('media/storage.provider.ts'));
    expect(provider).toMatch(/config\.get<string>\('media\.linkSecret'\)/);
    expect(provider).not.toMatch(/jwt\.accessSecret/);
  });

  it('the print script derives exactly what the API derives', () => {
    // Same domain string, same digest — so the value an operator pastes into
    // the Worker is the value the API signs with.
    const script = read('../scripts/print-media-link-secret.mjs');
    expect(script).toContain("'tc:secret:media-link:v1'");
    const root = 'a-root-secret-nobody-else-holds-0123456789';
    const fromScript = createHmac('sha256', root).update('tc:secret:media-link:v1').digest('hex');
    expect(fromScript).toBe(derivedSecret(root, 'media-link'));
  });

  it('the Worker docs no longer say to copy the JWT secret', () => {
    const toml = readFileSync(join(SRC, '..', '..', 'workers', 'media-edge', 'wrangler.toml'), 'utf8');
    expect(toml).toMatch(/MEDIA_LINK_SECRET/);
    expect(toml).not.toMatch(/must equal the API's JWT_ACCESS_SECRET/);
  });
});

describe('the unsubscribe link', () => {
  const prior = process.env;
  beforeEach(() => { process.env = { ...prior, JWT_ACCESS_SECRET: 'root-for-mail-0123456789-0123456789' }; delete process.env.MAIL_UNSUBSCRIBE_SECRET; });
  afterEach(() => { process.env = prior; });

  it('is keyed by its own secret, not the JWT secret under a prefix', () => {
    const exp = Date.now() + 60_000;
    const token = unsubscribeToken('Reader@Example.com', exp);
    const legacy = createHmac('sha256', `together-city/unsubscribe/${process.env.JWT_ACCESS_SECRET}`)
      .update(`${exp}.reader@example.com`).digest('base64url');
    expect(token.split('.')[1]).not.toBe(legacy);
    expect(addressFromUnsubscribeToken(token)).toBe('reader@example.com');
  });

  it('still honours a link sent before the key changed, through its own expiry', () => {
    const exp = Date.now() + 60_000;
    const payload = `${exp}.reader@example.com`;
    const legacyMac = createHmac('sha256', `together-city/unsubscribe/${process.env.JWT_ACCESS_SECRET}`)
      .update(payload).digest('base64url');
    const legacyToken = `${Buffer.from(payload).toString('base64url')}.${legacyMac}`;
    expect(addressFromUnsubscribeToken(legacyToken)).toBe('reader@example.com');
    // Tampered, expired, or signed with something else: null.
    expect(addressFromUnsubscribeToken(`${legacyToken.split('.')[0]}.notthemac`)).toBeNull();
  });

  it('an explicit MAIL_UNSUBSCRIBE_SECRET pins the key', () => {
    process.env.MAIL_UNSUBSCRIBE_SECRET = 'pinned-unsubscribe-key-0123456789abcdef';
    const exp = Date.now() + 60_000;
    const token = unsubscribeToken('reader@example.com', exp);
    const mac = createHmac('sha256', 'pinned-unsubscribe-key-0123456789abcdef').update(`${exp}.reader@example.com`).digest('base64url');
    expect(token.split('.')[1]).toBe(mac);
  });
});
