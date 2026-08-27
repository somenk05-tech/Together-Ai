import { keyFromUrl } from './chat-media-guard';
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
    expect(guard).toMatch(/retryable: true[\s\S]{0,120}could not check that image just now/);
    expect(guard).toMatch(/retryable: false[\s\S]{0,120}did not pass our automated check/);
    // No client, no send. This is the same trade the profile pipeline makes.
    expect(guard).toMatch(/if \(!this\.client\) \{\s*return \{ ok: false, retryable: true/);
  });

  it('will not hand the classifier something that is not an image', () => {
    expect(guard).toMatch(/SCREENABLE = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
    // A file claiming to be an image and arriving as something else is refused
    // unread rather than handled cleverly.
    expect(guard).toMatch(/if \(!SCREENABLE\.has\(mimeType\)\)/);
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
    // Non-images pass through this function untouched, by construction.
    expect(guard).toMatch(/if \(!mimeType\.startsWith\('image\/'\)\) return \{ ok: true \};/);
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
});
