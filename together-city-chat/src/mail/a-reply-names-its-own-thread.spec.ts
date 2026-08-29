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

  /**
   * ── AND THE FALLBACK NOW ASKS WHO IS WRITING (fifth audit, 29 Aug) ────────
   *
   * The header path above is safe on its own: a claimed thread id is checked
   * against a row the citizen already holds, so the claim has to survive a
   * lookup. This heuristic has no such check — it asks only "who was the last
   * correspondent at this address, and does the subject match" — and the From
   * header is free to write. The webhook's guard authenticates the PROVIDER
   * and has never said anything about the message, so any host on the internet
   * could forge a correspondent's address with a matching subject and be
   * spliced into that live conversation, inheriting its history and filing.
   *
   * The mail is still delivered either way. What an unproved sender does not
   * get is somebody else's thread to sit inside.
   */
  const subjectOnly = () => {
    const svc: any = Object.create(MailService.prototype);
    svc.prisma = {
      mailMessage: {
        findFirst: async ({ where }: any) =>
          (where.threadId ? null : { threadId: THREAD, subject: 'hi' }),
      },
    };
    return svc;
  };

  it('falls back to the subject for a sender the provider vouched for', async () => {
    const got = await subjectOnly().resolveInboundThread('u1', 'a@b.com', 'Re: hi', [], true);
    expect(got).toBe(THREAD);
  });

  it('but not for one it said failed', async () => {
    const got = await subjectOnly().resolveInboundThread('u1', 'a@b.com', 'Re: hi', [], false);
    expect(got).not.toBe(THREAD);
  });

  it('and not for one it said nothing about', async () => {
    // "Said nothing" is not proof either, and the cost of getting this wrong
    // in the safe direction is one extra thread.
    const got = await subjectOnly().resolveInboundThread('u1', 'a@b.com', 'Re: hi', [], null);
    expect(got).not.toBe(THREAD);
  });

  it('the header path is unaffected, because it checks ownership itself', async () => {
    const svc = svcWith([THREAD]);
    const got = await svc.resolveInboundThread('u1', 'a@b.com', 'Re: hi', [anchor], null);
    expect(got).toBe(THREAD);
  });
});
