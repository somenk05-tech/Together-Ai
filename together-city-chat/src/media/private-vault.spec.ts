import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE PRIVATE VAULT MUST NEVER BE THE PUBLIC BUCKET.
 *
 * StorageProvider keeps two buckets. The public one holds post and listing
 * images and is published at MEDIA_PUBLIC_BASE_URL. The private one holds three
 * things: blood tests and prescriptions (`health/`), every Drive file
 * (`drive/`), and every dating photo (`dating/`). All three are served through
 * short-lived signed GETs and never through a stored URL — the code is careful
 * about this and the carefulness is why the hole was hard to see.
 *
 * `this.healthBucket = privateBucket || bucket`. With MEDIA_PRIVATE_BUCKET
 * unset, that line moves all three into the bucket anyone can read, and the
 * signing discipline goes on protecting a link to a file that no longer needs
 * one. The old comment on that line said health docs are "served ONLY via
 * short-lived signed links either way", which is true and answers a different
 * question than the one that matters.
 *
 * So production refuses to boot instead, in the same block as the JWT secrets,
 * on the same test that block states: booting this way is worse than downtime.
 */

const API = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(API, 'src', p), 'utf8');
/** Comments are not code — every claim below is checked against the statements. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const STORAGE_ON = {
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  MEDIA_BUCKET: 'together-city-media',
};
const GOOD_SECRETS = {
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  CORS_ORIGIN: 'https://togethercity.app',
  ALLOW_STUB_MESSAGING: 'true',
  /* Fatal since 3 Sep and unrelated to the vault — a blank one removes the
     attachment origin check rather than weakening it. It lives here so every
     case below keeps testing the bucket rule it was written for; the guard
     that it fires at all is in a-config-guard-that-fires.spec.ts. */
  MEDIA_PUBLIC_BASE_URL: 'https://media.togethercity.app',
};

/** Load configuration.ts fresh under a given environment and return the throw, if any. */
function boot(env: Record<string, string | undefined>): Error | null {
  const saved = { ...process.env };
  // A clean slate: a stray MEDIA_* in the developer's own shell must not decide
  // the result of a test about missing MEDIA_*.
  for (const k of Object.keys(process.env)) {
    if (/^(MEDIA_|S3_|JWT_|NODE_ENV|CORS_ORIGIN|ALLOW_STUB_MESSAGING|STRICT_PROD_CONFIG|EMAIL_PROVIDER|MESSAGING_PROVIDER)/.test(k)) {
      delete process.env[k];
    }
  }
  Object.assign(process.env, env);
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('./../shared/config/configuration') as { default: () => unknown }).default();
    return null;
  } catch (e) {
    return e as Error;
  } finally {
    quiet.mockRestore();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

describe('production refuses to boot without a private vault', () => {
  it('refuses when storage is configured and MEDIA_PRIVATE_BUCKET is unset', () => {
    const err = boot({ NODE_ENV: 'production', ...GOOD_SECRETS, ...STORAGE_ON });
    expect(err).not.toBeNull();
    expect(err?.message).toContain('MEDIA_PRIVATE_BUCKET');
    // The message has to say what happens, not just what is missing — a boot
    // failure nobody understands gets "fixed" by setting it to the public one.
    expect(err?.message).toMatch(/PUBLIC media bucket/);
  });

  it('refuses when the private bucket IS the public bucket', () => {
    const err = boot({
      NODE_ENV: 'production', ...GOOD_SECRETS, ...STORAGE_ON,
      MEDIA_PRIVATE_BUCKET: STORAGE_ON.MEDIA_BUCKET,
    });
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/SEPARATE bucket/);
  });

  it('starts when the two buckets are genuinely different', () => {
    const err = boot({
      NODE_ENV: 'production', ...GOOD_SECRETS, ...STORAGE_ON,
      MEDIA_PRIVATE_BUCKET: 'together-city-private',
    });
    expect(err).toBeNull();
  });

  it('does not refuse when object storage is not configured at all', () => {
    // Nothing is uploaded anywhere, so there is nothing to expose. Refusing here
    // would be config pedantry that takes the API down over an unused feature.
    const err = boot({ NODE_ENV: 'production', ...GOOD_SECRETS });
    expect(err).toBeNull();
  });

  it('never refuses outside production', () => {
    expect(boot({ NODE_ENV: 'development', ...STORAGE_ON })).toBeNull();
    expect(boot({ ...STORAGE_ON })).toBeNull();     // NODE_ENV unset
  });

  it('still refuses on the JWT secrets, which this must not have displaced', () => {
    const err = boot({ NODE_ENV: 'production', ...STORAGE_ON, MEDIA_PRIVATE_BUCKET: 'p' });
    expect(err?.message).toMatch(/JWT_ACCESS_SECRET/);
  });
});

describe('the vault is routed to the private bucket, and returns no public URL', () => {
  const provider = strip(src('media/storage.provider.ts'));

  /** Each private presign, and the object prefix that proves what it carries. */
  const PRIVATE = [
    ['presignHealthUpload', 'health/'],
    ['presignDriveUpload', 'drive/'],
    ['presignDatingUpload', 'dating/'],
    // Its own prefix, and that IS the feature: a verification selfie is never
    // displayed, and `ownPhotosOnly` admits anything under `dating/<me>/`.
    // One prefix per thing that can be owned — see the daybook's own note.
    ['presignDatingSelfieUpload', 'dating-selfie/'],
  ] as const;

  it.each(PRIVATE)('%s writes to the private bucket', (fn, prefix) => {
    const start = provider.indexOf(`async ${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const body = provider.slice(start, provider.indexOf('\n  async ', start + 1));
    expect(body).toContain(prefix);
    expect(body).toContain('Bucket: this.healthBucket');
    expect(body).not.toContain('Bucket: this.bucket');
  });

  it.each(PRIVATE)('%s hands back a key, never a public URL', (fn) => {
    const start = provider.indexOf(`async ${fn}(`);
    const body = provider.slice(start, provider.indexOf('\n  async ', start + 1));
    // publicUrl is the field the public path returns. Its absence here is the
    // whole difference between the two vaults, so it is asserted rather than
    // assumed — a helpful refactor that "made the return types consistent"
    // would publish every health document in the city.
    expect(body).not.toMatch(/\bpublicUrl\b/);
  });

  it('leaves the public path on the public bucket', () => {
    const start = provider.indexOf('async presignUpload(');
    const body = provider.slice(start, provider.indexOf('\n  get configured', start));
    expect(body).toContain('Bucket: this.bucket');
    expect(body).toContain('publicUrl');
  });
});

describe('the two buckets are declared where a deploy will read them', () => {
  it('names MEDIA_PRIVATE_BUCKET in .env.example', () => {
    const env = readFileSync(join(API, '.env.example'), 'utf8');
    expect(env).toMatch(/^MEDIA_PRIVATE_BUCKET=\S+/m);
  });

  it('names MEDIA_PRIVATE_BUCKET in render.yaml', () => {
    // The blueprint declared MEDIA_* nowhere at all, so a fresh Render service
    // came up with an empty private bucket and no sign that anything was wrong.
    const render = readFileSync(join(API, 'render.yaml'), 'utf8');
    expect(render).toContain('MEDIA_PRIVATE_BUCKET');
    expect(render).toContain('MEDIA_BUCKET');
  });
});
