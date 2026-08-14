import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * A REPLY HAPPENS IN THE THREAD.
 *
 * Reply used to navigate to the Compose page: a different screen, the
 * conversation gone from behind it, for what is nearly always a few
 * sentences. Every mail client answers at the foot of the thread, and the
 * screenshots that prompted this change were of a citizen comparing exactly
 * that against Gmail. The full composer is still one press away — Cc, Bcc and
 * attachments live there — but the common case stays on the page.
 *
 * These read the source as text, like the rest of this folder: they pin the
 * decisions, and the real behaviour is the API contract Compose already
 * exercises through the same hooks.
 */
describe('a reply happens in the thread', () => {
  const view = read('features/mail/pages/MessageView.tsx');

  it('offers a reply box on the thread itself, not a page away', () => {
    expect(view).toMatch(/<textarea/);
    expect(view).toMatch(/Send reply/);
    expect(view).toMatch(/useSendMail/);
  });

  it('still keeps the full composer one press away, pre-filled', () => {
    expect(view).toMatch(/full composer/);
    expect(view).toMatch(/\/mail\/compose\?/);
  });

  it('carries the quoted trail when it goes, like Compose does', () => {
    expect(view).toMatch(/withQuote\(/);
    expect(view).toMatch(/quoteBlock\(/);
  });

  it('will not send nothing, and will not send before the trail arrives', () => {
    // The blank messages this mailbox already holds are why: a Send key live
    // on an empty box, pressed by a finger already resting on it.
    expect(view).toMatch(/body\.trim\(\)/);
    expect(view).toMatch(/trailPending/);
  });

  it('lets one message leave a conversation without taking the thread', () => {
    // The bin on a trail message moves THAT message to Trash. Not offered in
    // Trash, where the same press would mean destroy, and not offered on a
    // single message, where the page's own Delete is the same act.
    expect(view).toMatch(/Move this message to Trash/);
    expect(view).toMatch(/x\.folder !== 'trash'/);
    expect(view).toMatch(/trail\.length > 1/);
  });

  it('does not show the blank messages the old composer let through', () => {
    // Hidden, not destroyed: the rows still exist in Sent with their own
    // bins, and the server refuses to create new ones. The one the citizen
    // deep-linked into stays visible, or the page would be about nothing.
    expect(view).toMatch(/x\.id === id \|\| stripCityFooter\(x\.body\)\.trim\(\) !== ''/);
  });

  it('replies with the whole desk: recipient, copies, files', () => {
    // "The reply needs to be the full stack instead of half" — the owner,
    // 15 Aug. The subject alone stays behind the full-composer door, because
    // changing it is starting a new message.
    expect(view).toMatch(/Add Cc or Bcc/);
    expect(view).toMatch(/DrivePicker/);
    expect(view).toMatch(/attachmentFileIds/);
    expect(view).toMatch(/bcc: addrs\(bcc\)/);
  });

  it('keeps the project rail when a message from that project is open', () => {
    // /mail/message/<id> carries no project in the URL, so the sidebar used
    // to fall back to the whole mailbox's folders the moment a message
    // opened. The message itself knows its room; the sidebar asks it.
    const side = read('layouts/Sidebar.tsx');
    expect(side).toMatch(/\/mail\/message\//);
    expect(side).toMatch(/useMailMessage\(/);
    expect(side).toMatch(/messageProjectKey/);
  });
});
