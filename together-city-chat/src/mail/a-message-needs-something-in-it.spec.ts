import { MailService } from './mail.service';

/**
 * A MESSAGE NEEDS SOMETHING IN IT — THE SERVER'S HALF.
 *
 * The web composer stopped offering Send on an empty box, and the mailbox that
 * prompted it still holds the evidence of why: a dozen messages that are each
 * a name, a date and nothing else, sent by a finger that was already on the
 * key. That fix lives in one client. This door is public, the mobile app and
 * every future caller walk through it too, and a rule about what a message IS
 * belongs where the message is written.
 *
 * The rule is the composer's, verbatim: words count, a file with no covering
 * note counts, a subject alone does not.
 *
 * CHECKED AGAINST THE OLD CODE: with the guard removed from send(), the first
 * two cases below fail — fanOut runs and the blank message goes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bareService() {
  const svc: any = Object.create(MailService.prototype);
  // If the guard lets an empty message past, this is what makes the test say
  // so rather than dying somewhere inside Prisma.
  svc.fanOut = async () => { throw new Error('fanOut ran for an empty message'); };
  svc.clearDraft = async () => undefined;
  svc.list = async () => [];
  return svc;
}

describe('a message needs something in it', () => {
  it('refuses a send with no words and no files', async () => {
    await expect(bareService().send('u1', { to: 'a@example.com', subject: 'hi', body: '' }))
      .rejects.toThrow(/something in it/i);
  });

  it('a subject alone is not something', async () => {
    await expect(bareService().send('u1', { to: 'a@example.com', subject: 'Re: hello how are you', body: '   \n  ' }))
      .rejects.toThrow(/something in it/i);
  });

  it('a file with no covering note is a message', async () => {
    const svc = bareService();
    svc.fanOut = async () => ({ sent: ['a@example.com'], failed: [] });
    const res = await svc.send('u1', { to: 'a@example.com', subject: '', body: '', attachmentFileIds: ['f1'] });
    expect(res.delivered).toEqual(['a@example.com']);
  });

  it('words still go', async () => {
    const svc = bareService();
    svc.fanOut = async () => ({ sent: ['a@example.com'], failed: [] });
    const res = await svc.send('u1', { to: 'a@example.com', subject: 'hi', body: 'yes, Tuesday works' });
    expect(res.failed).toEqual([]);
  });
});
