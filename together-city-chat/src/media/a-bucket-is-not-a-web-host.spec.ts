import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bareMimeType, EXECUTABLE_IN_A_BROWSER } from './media.service';

/**
 * ── A BUCKET IS NOT A WEB HOST (fifth audit, 29 Aug) ───────────────────────
 *
 * Two doors, one property. Object storage serves whatever Content-Type the
 * object carries, and both of these buckets sit on a city origin that
 * `main.ts` reflects for CORS — so a file typed as something a browser runs is
 * a script on a city origin, put there by whoever chose the file.
 *
 *  · `requestUpload` — the general presign — accepted ANY mimeType, and the
 *    type is signed into the PUT. `requestDatingUpload` twenty lines below it
 *    has an allowlist and writes down why ("an SVG is an image that runs
 *    script"); this door had nothing. Dating chats were covered anyway by
 *    `screenAttachments`, which sniffs the bytes. City chats were not.
 *  · `presignHealthDownload` signed a bare GET, so a mail attachment — a file
 *    a stranger chose and sent — opened in a tab and RENDERED.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('what may not be uploaded through the general door', () => {
  it('names the things a browser executes, SVG included', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript']) {
      expect(EXECUTABLE_IN_A_BROWSER.has(t)).toBe(true);
    }
  });

  it('and nothing a real attachment is', () => {
    // A denylist and not an allowlist, because this door takes whatever a
    // citizen attaches to a message: photos, voice notes, documents, video.
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/webm', 'video/mp4', 'text/plain']) {
      expect(EXECUTABLE_IN_A_BROWSER.has(t)).toBe(false);
    }
  });

  it('the presign refuses them, after the size check and before the signature', () => {
    const svc = read('media/media.service.ts');
    const fn = svc.slice(svc.indexOf('async requestUpload('), svc.indexOf('async requestDatingUpload('));
    expect(fn).toMatch(/EXECUTABLE_IN_A_BROWSER\.has\(bareMimeType\(mimeType\)\)/);
    expect(fn.indexOf('EXECUTABLE_IN_A_BROWSER')).toBeLessThan(fn.indexOf('presignUpload'));
  });

  /**
   * ── THE VERSION THAT WOULD HAVE CAUGHT IT (re-audit, 29 Aug) ─────────────
   *
   * The first version of the test above asserted `/split\(';'\)\[0\]/`
   * against the SOURCE and never ran a value through it. The source did say
   * that — and it trimmed before it split, so `image/svg+xml ; x` kept its
   * trailing space, matched nothing in the set, and was signed into the public
   * bucket as a document the browser runs. `media-type = type "/" subtype *(
   * OWS ";" OWS parameter )`: the whitespace before the semicolon is legal.
   *
   * A guard is only proven where the data has reached. These are values.
   */
  const REFUSED = [
    'image/svg+xml',
    'image/svg+xml; charset=utf-8',
    'image/svg+xml ; charset=utf-8',
    'image/svg+xml\t;x',
    ' IMAGE/SVG+XML ',
    'Text/HTML ;a',
    'application/xhtml+xml;q=1',
  ];

  it.each(REFUSED)('refuses %p however it is spelled', (t) => {
    expect(EXECUTABLE_IN_A_BROWSER.has(bareMimeType(t))).toBe(true);
  });

  it.each(['image/jpeg', 'image/png; charset=binary', 'application/pdf', 'audio/webm;codecs=opus'])(
    'and still takes %p',
    (t) => { expect(EXECUTABLE_IN_A_BROWSER.has(bareMimeType(t))).toBe(false); },
  );

  it('the PRIVATE door has the same rule', () => {
    // The first version guarded the public bucket only. Drive fills the
    // private one from `requestPrivateUpload`, and its files are served
    // through signed links from a city origin.
    const svc = read('media/media.service.ts');
    const fn = svc.slice(svc.indexOf('async requestPrivateUpload('));
    expect(fn).toMatch(/EXECUTABLE_IN_A_BROWSER\.has\(bareMimeType\(mimeType\)\)/);
  });

  it('the dating door keeps its allowlist — a different rule for a different door', () => {
    expect(read('media/media.service.ts')).toMatch(/DATING_PHOTO_MIME\[mimeType\]/);
  });
});

describe('what a signed download is offered as', () => {
  const storage = read('media/storage.provider.ts');
  const fn = storage.slice(storage.indexOf('async presignHealthDownload('), storage.indexOf('async getHealthObjectBase64('));

  it('a mail attachment is handed over as a file to save', () => {
    expect(read('mail/mail.service.ts')).toMatch(/presignHealthDownload\(f\.storageKey, \{ asAttachment: true, filename: f\.name \}\)/);
  });

  it('and so is a Drive file, which is the same bytes through the other door', () => {
    // The signer's own docblock names both callers; only mail was passing the
    // flag, and a Drive file can arrive by being attached to mail.
    expect(read('drive/drive.service.ts')).toMatch(/presignHealthDownload\(row\.storageKey, \{ asAttachment: true, filename: row\.name \}\)/);
  });

  it('and typed as bytes as well, so a stripped header is not the whole defence', () => {
    expect(fn).toMatch(/ResponseContentDisposition/);
    expect(fn).toMatch(/ResponseContentType: 'application\/octet-stream'/);
  });

  it('with a filename that cannot close the quote or split the header', () => {
    // The name is chosen by whoever sent the mail.
    expect(fn).toMatch(/replace\(\/\[\^A-Za-z0-9\._ -\]\/g, '_'\)/);
  });

  it('and it is opt-in, because an avatar and a scan are meant to be looked at', () => {
    // Four callers share this signer and they do not want the same thing;
    // forcing a download on all of them would break two working screens.
    expect(fn).toMatch(/opts: \{ asAttachment\?: boolean; filename\?: string \} = \{\}/);
    expect(fn).toMatch(/\.\.\.\(opts\.asAttachment/);
  });
});
