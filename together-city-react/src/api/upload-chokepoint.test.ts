import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Uploads go from the browser straight to storage with a pre-signed URL, so the
 * server never sees the bytes and cannot strip anything from them. That makes
 * api/media.api.ts the only place a photo's GPS coordinates can be removed
 * before they leave the device — and makes a screen that PUTs to storage by
 * itself a quiet privacy leak, not a style preference.
 *
 * So: nobody else does the PUT. This is the guard that says so, because the
 * next screen to need an upload will be written by someone who has never read
 * lib/image-metadata.ts and has no reason to.
 *
 * features/drive is allowed, deliberately. The Drive is a citizen's own vault
 * behind short-lived signed links; the file they put in it is theirs, and
 * rewriting its bytes on the way in — throwing away the date and the camera
 * along with the coordinates — would be us editing their filing cabinet.
 */
const ALLOWED = [
  'api/media.api.ts',
  'features/drive/api.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('the upload chokepoint', () => {
  it('is the only place that PUTs bytes to storage', () => {
    const offenders = walk(src)
      .filter((p) => /axios\s*\.\s*put\s*\(|fetch\([^)]*method:\s*['"]PUT/i.test(readFileSync(p, 'utf8')))
      .map((p) => relative(src, p).split('\\').join('/'))
      .filter((p) => !ALLOWED.includes(p));

    expect(offenders, [
      'These files upload bytes to storage without going through mediaApi, which',
      'means a photo posted from them still carries the coordinates it was taken',
      'at. Route them through mediaApi.upload / uploadDoc / uploadPrivate, or add',
      'the file to ALLOWED here with the reason it is safe.',
    ].join('\n')).toEqual([]);
  });

  it('still scrubs on all three of its own paths', () => {
    const media = readFileSync(join(src, 'api/media.api.ts'), 'utf8');
    for (const fn of ['async upload(', 'async uploadDoc(', 'async uploadPrivate(']) {
      const at = media.indexOf(fn);
      expect(at, `${fn} has gone missing from media.api.ts`).toBeGreaterThan(-1);
      const body = media.slice(at, media.indexOf('\n  },', at));
      expect(body, `${fn} no longer scrubs before uploading`).toContain('scrubImage(file,');
    }
  });
});
