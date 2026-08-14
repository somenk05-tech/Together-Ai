import { normalizeInbound } from './mail-inbound';
import { MailService } from './mail.service';

/**
 * OUTBOUND MAIL CARRIED NO THREADING HEADERS, AND INBOUND HAD NOTHING TO MATCH.
 *
 * The Resend call set no Message-ID, no In-Reply-To and no References — there
 * was no seam on OutboundMessage to put one on — so Gmail and Outlook were
 * left to thread on the subject line. And `resolveInboundThread` fell back to
 * "the most recent message from this correspondent, if the Re:-stripped
 * subjects are identical", which two live conversations with one person is
 * enough to break: a reply to the older one matches the newer one's subject,
 * fails, and starts a third thread with no original beside it.
 *
 * The trail id is now encoded into the ids we mint, so a reply that echoes
 * References back names its own thread with no lookup and no new column.
 *
 * A THREAD ID IN A HEADER IS A CLAIM, NOT A CREDENTIAL — believed only after
 * checking the citizen already holds a row in that trail. The last two
 * assertions are that check; without it, one header would put a stranger's
 * mail inside somebody's conversation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const THREAD = '11111111-2222-3333-4444-555555555555';
const anchor = `<t.${THREAD}.thread@togethercity.app>`;

describe('what a reply says about the thread it answers', () => {
  it('reads In-Reply-To out of the headers, whatever the case', () => {
    const out = normalizeInbound({
      data: {
        to: ['somen@togethercity.app'], from: 'a@b.com', subject: 'Re: hi',
        headers: { 'In-Reply-To': anchor },
      },
    });
    expect(out?.inReplyTo).toEqual([anchor]);
  });

  it('reads the whole References chain', () => {
    const out = normalizeInbound({
      data: {
        to: ['somen@togethercity.app'], from: 'a@b.com', subject: 'Re: hi',
        headers: { references: `<x@y.com> ${anchor}` },
      },
    });
    expect(out?.inReplyTo).toContain(anchor);
    expect(out?.inReplyTo).toContain('<x@y.com>');
  });

  it('is an empty list, never undefined, when the mail names no parent', () => {
    const out = normalizeInbound({ data: { to: ['somen@togethercity.app'], from: 'a@b.com' } });
    expect(out?.inReplyTo).toEqual([]);
  });
});

function svcWith(rowsInThread: string[]) {
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = {
    mailMessage: {
      findFirst: async ({ where }: any) => {
        if (where.threadId) return rowsInThread.includes(where.threadId) ? { id: 'm1' } : null;
        // The subject-matching fallback finds nothing in these tests.
        return null;
      },
    },
  };
  return svc;
}

describe('which trail an arriving message joins', () => {
  it('joins the thread its References names', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', [anchor]);
    expect(got).toBe(THREAD);
  });

  it('takes the thread from any id in the chain, not only the first', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', ['<x@y.com>', anchor]);
    expect(got).toBe(THREAD);
  });

  it('refuses a thread the citizen holds no message in', async () => {
    // The forgery: one header claiming somebody else's conversation.
    const svc = svcWith([]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', [anchor]);
    expect(got).not.toBe(THREAD);
    expect(got).toEqual(expect.any(String));
  });

  it('ignores an id that is not one of ours', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', ['<t.not-a-uuid.x@evil.com>']);
    expect(got).not.toBe(THREAD);
  });

  it('still falls back to the subject when the headers are gone', async () => {
    const svc: any = Object.create(MailService.prototype);
    svc.prisma = {
      mailMessage: {
        findFirst: async ({ where }: any) =>
          (where.threadId ? null : { threadId: THREAD, subject: 'hi' }),
      },
    };
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', []);
    expect(got).toBe(THREAD);
  });
});
