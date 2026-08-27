import { keyFromUrl, sniffImage } from './chat-media-guard';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── WHAT A STRANGER MAY PUT IN FRONT OF YOU ─────────────────────────────────
 *
 * The last code blocker from the launch audit. A dating profile PHOTO went
 * through a full fail-closed pipeline before another citizen could see it. A
 * photo sent into a dating CHAT got an ownership check on its URL and nothing
 * else — no scan, no size policy, no hold, no recipient consent, no
 * blur-until-accepted. Either party could send an image the moment a chat
 * opened, which is the most common abuse vector in this category.
 *
 * What follows pins the shape of the fix and, just as much, the THREE PLACES
 * IT DELIBERATELY STOPS — because each is a decision somebody could quietly
 * widen or quietly drop.
 */
describe('a stranger cannot just send you anything', () => {
  const svc = code('messages/messages.service.ts');
  const guard = code('messages/chat-media-guard.ts');

  it('screens attachments on the way in, after ownership and before persisting', () => {
    // Order matters: no point classifying an image the sender does not own,
    // and no point persisting a message whose attachment is about to be
    // refused.
    const send = svc.slice(svc.indexOf('async send('), svc.indexOf('message.create'));
    expect(send).toMatch(/assertAttachmentsAreYoursToSend/);
    expect(send).toMatch(/screenAttachments\(senderId, dto\.conversationId, dto\.attachments\)/);
    expect(send.indexOf('assertAttachmentsAreYoursToSend')).toBeLessThan(send.indexOf('screenAttachments'));
  });

  it('runs only where the two people are strangers', () => {
    // City chat is people who accepted a connection with each other. Dating
    // chat is two strangers a matching engine introduced, and `anonymousTrust`
    // is what marks the difference.
    const fn = svc.slice(svc.indexOf('private async screenAttachments'), svc.indexOf('private async assertAttachmentsAreYoursToSend'));
    expect(fn).toMatch(/anonymousTrust\?: number \| null \} \| null\)\?\.anonymousTrust == null\) return;/);
  });

  it('refuses the send rather than holding the image', () => {
    // The profile pipeline files a photo as `held` and a moderator looks at
    // it. There is no queue for message attachments and inventing one would
    // mean a human reading strangers' private messages to clear it.
    expect(svc).toMatch(/throw new BadRequestException\(verdict\.reason\)/);
    // So `held` refuses too — held means a person should look, and there is no
    // person. Only `approved` passes.
    expect(guard).toMatch(/if \(verdict\.status === 'approved'\) return \{ ok: true \};/);
  });

  it('fails closed, and says which kind of no it is', () => {
    // "Did not pass" and "could not be checked" are different sentences: one
    // is worth retrying and the other is not, and a sender told the wrong one
    // either retries forever or gives up on a transient failure.
    expect(guard).toMatch(/retryable: true[\s\S]{0,160}could not (?:check|read) that (?:image|file) just now/);
    // The final refusals route through refuse(), which deletes the object and
    // is retryable: false by construction — so the sentence and the flag are
    // asserted where each of them now lives.
    expect(guard).toMatch(/did not pass our automated check/);
    expect(guard).toMatch(/private async refuse\([\s\S]{0,600}?return \{ ok: false, retryable: false, reason \}/);
    // No client, no send. This is the same trade the profile pipeline makes.
    expect(guard).toMatch(/if \(!this\.client\)[\s\S]{0,240}?ok: false, retryable: true/);
  });

  it('will not hand the classifier something that is not an image', () => {
    expect(guard).toMatch(/SCREENABLE = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
    // REWRITTEN 27 AUG, and the rewrite is the point. This used to read
    // `SCREENABLE.has(mimeType)` — the SENDER'S label. It is the sniffed type
    // now, so a JPEG labelled application/octet-stream cannot walk past.
    expect(guard).toMatch(/if \(!SCREENABLE\.has\(actual\)\)/);
    // And a container we recognise but cannot screen — GIF, BMP, TIFF, HEIC,
    // AVIF — is REFUSED rather than waved through as "not an image".
    expect(guard).toMatch(/if \(actual === 'image'\)/);
    expect(guard).toMatch(/MAX_SCREEN_BYTES/);
  });

  /**
   * VOICE NOTES ARE NOT SCREENED, and that is stated rather than hidden.
   * Nothing in this stack can classify audio; running a voice note past an
   * image classifier would be theatre. This asserts the honesty, so that a
   * later reader does not assume coverage that does not exist.
   */
  it('says out loud that it cannot screen a voice note', () => {
    expect(read('messages/chat-media-guard.ts')).toMatch(/VOICE NOTES ARE NOT SCANNED/);
    // Non-images still pass through untouched — but since 27 Aug because the
    // BYTES say so, not because the sender's label did. `actual === null` is
    // "not a raster image we recognise", which is what a voice note is.
    expect(guard).toMatch(/if \(actual === null\)/);
    // The line this replaced must never come back: it let one string skip the
    // whole pipeline.
    expect(guard).not.toMatch(/if \(!mimeType\.startsWith\('image\/'\)\) return \{ ok: true \}/);
  });

  it('borrows the rule without borrowing a module', () => {
    // `verdictFor` is pure and imported as a function. A module edge from
    // messages to dating would be a new cycle risk for the sake of a
    // thresholds comparison — this way the two share the RULE, not a lifecycle.
    expect(guard).toMatch(/import \{ verdictFor \} from '\.\.\/dating\/photo-moderation\.service'/);
    expect(code('messages/messages.module.ts')).not.toMatch(/DatingModule/);
  });

  describe('the storage key an attachment url names', () => {
    const base = 'https://cdn.example';

    it('reads the key out of a well-formed attachment url', () => {
      expect(keyFromUrl(`${base}/uploads/u1/abc.jpg`, base)).toBe('uploads/u1/abc.jpg');
    });

    it('is not fooled by a query string or another origin', () => {
      // Parsed rather than sliced, so `?x=y` cannot become part of the key and
      // a look-alike host cannot smuggle one in.
      expect(keyFromUrl(`${base}/uploads/u1/abc.jpg?v=2`, base)).toBe('uploads/u1/abc.jpg');
      expect(keyFromUrl('https://evil.example/uploads/u1/abc.jpg', base)).toBeNull();
    });

    it('refuses anything outside the uploads namespace', () => {
      expect(keyFromUrl(`${base}/dating/u1/abc.jpg`, base)).toBeNull();
      expect(keyFromUrl(`${base}/`, base)).toBeNull();
      expect(keyFromUrl('not a url at all', base)).toBeNull();
    });
  });
  describe('the bytes decide, not the label (27 Aug — closing my own hole)', () => {
    // THE HOLE: the first version of this guard opened with
    //   if (!mimeType.startsWith('image/')) return { ok: true };
    // and mimeType arrives in the request body, from the sender, validated as
    // z.string().min(1) and never against the bytes. Label a JPEG
    // `application/octet-stream` and Rekognition was never called; the message
    // was delivered and the recipient opened a public URL to an unscreened
    // image. One string defeated the whole fail-closed pipeline.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0]);
    const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\u001a\n', 'latin1'), Buffer.alloc(8)]);
    const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(4)]);
    const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(10)]);
    const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(4)]);
    const ogg = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(12)]);

    it('reads the three Rekognition takes out of their magic numbers', () => {
      expect(sniffImage(jpeg)).toBe('image/jpeg');
      expect(sniffImage(png)).toBe('image/png');
      expect(sniffImage(webp)).toBe('image/webp');
    });

    it('still calls an unscreenable image an image', () => {
      // Refused, not waved through: an animated GIF or a HEIC burst is exactly
      // as capable of being the thing this guard exists to stop.
      expect(sniffImage(gif)).toBe('image');
      expect(sniffImage(heic)).toBe('image');
    });

    it('says null for what is not a raster image, and for a runt', () => {
      expect(sniffImage(ogg)).toBeNull();
      expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
      expect(sniffImage(Buffer.alloc(0))).toBeNull();
    });

    it('does not consult the label to decide whether to screen', () => {
      // The ONLY place mimeType may still appear is the branch that refuses a
      // file CLAIMING to be an image whose bytes we could not read. It must
      // never again be able to skip the check.
      expect(guard).not.toMatch(/if \(!mimeType\.startsWith\('image\/'\)\) return \{ ok: true \}/);
      expect(guard).toMatch(/const actual = sniffImage\(head\)/);
      // and sniffing happens before any decision
      expect(guard.indexOf('sniffImage(head)')).toBeLessThan(guard.indexOf('SCREENABLE.has(actual)'));
    });

    it('reads sixteen bytes rather than fifty megabytes', () => {
      // Every attachment is sniffed, voice notes included, and the upload cap
      // is 50MB. A ranged GET is what makes checking everything affordable.
      expect(guard).toMatch(/getPublicObjectPrefix\(key, SNIFF_BYTES\)/);
      expect(code('media/storage.provider.ts')).toMatch(/Range: `bytes=0-\$\{Math\.max\(0, n - 1\)\}`/);
    });
  });

  describe('a thumbnail is an attachment too (27 Aug — the second hole)', () => {
    it('screens both fields, the way the ownership gate always did', () => {
      // assertAttachmentsAreYoursToSend reads url AND thumbnail — it has to,
      // or you could put somebody else's file in the second field. Screening
      // read only the first, and the serializer hands `thumbnail` to the
      // recipient as `thumbUrl` and their chat renders it. The asymmetry was
      // visible in the same file, twenty lines apart.
      expect(svc).toMatch(/for \(const target of \[a\.url, a\.thumbnail\]\)/);
      expect(svc).toMatch(/attachments: Array<\{ url: string; thumbnail\?: string; mimeType\?: string \}>/);
    });
  });

  describe('a refused image does not stay published (27 Aug — the third)', () => {
    it('deletes the object on a FINAL refusal', () => {
      // Attachments are PUT into the public bucket by the browser before the
      // message is attempted, so a refused image stayed permanently
      // addressable to anyone holding its URL — and the sender holds it.
      expect(guard).toMatch(/private async refuse\(key: string, senderId: string, reason: string\)/);
      expect(guard).toMatch(/await this\.storage\.deleteObject\(key\)/);
      expect(guard).toMatch(/return \{ ok: false, retryable: false, reason \}/);
    });

    it('leaves the object alone when the refusal is retryable', () => {
      // Rekognition unreachable, or storage momentarily unreadable: the sender
      // is about to send that same URL again. Deleting it would turn a retry
      // into a dead link.
      const retryables = guard.match(/retryable: true/g) ?? [];
      expect(retryables.length).toBeGreaterThanOrEqual(3);
      // No retryable branch may route through refuse().
      for (const line of guard.split('\n').filter((l) => l.includes('retryable: true'))) {
        expect(line).not.toMatch(/this\.refuse\(/);
      }
    });

    it('never lets a failed delete change the answer', () => {
      // An object we could not remove is a tidiness problem; refusing the send
      // is the safety one. The catch logs and carries on.
      const body = guard.slice(guard.indexOf('private async refuse('));
      expect(body).toMatch(/catch \(e\)[\s\S]{0,200}?logger\.warn/);
    });
  });
});
