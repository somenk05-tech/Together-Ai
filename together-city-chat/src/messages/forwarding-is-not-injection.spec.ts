import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A FORWARD IS NOT AN INJECTION.
 *
 * The audit's attachment gate requires a URL to name the sender's own upload
 * namespace, because an unchecked URL is a tracking pixel anyone can post into
 * any conversation and every recipient's browser fetches it on render.
 * Forwarding is the one legitimate case that rule forbids, so the rule widened
 * — and the danger in widening a security check is that it widens further than
 * intended. These four assertions are the edges.
 */
function build(seenUrls: string[]) {
  const prisma: any = {
    attachment: { findMany: jest.fn(async () => seenUrls.map((url) => ({ url }))) },
  };
  const svc = new MessagesService(
    prisma,
    {} as any,
    { publish: () => undefined } as any,
    { get: () => 'https://cdn.example' } as any,
  );
  const check = (attachments: unknown) =>
    (svc as any).assertAttachmentsAreYoursToSend('me', attachments);
  return { svc, prisma, check };
}

describe('a forward is not an injection', () => {
  it('lets you send a file you uploaded yourself, without asking the database', async () => {
    const { check, prisma } = build([]);
    await expect(check([{ url: 'https://cdn.example/uploads/me/a.jpg' }])).resolves.toBeUndefined();
    expect(prisma.attachment.findMany).not.toHaveBeenCalled();
  });

  it('lets you forward a file that was sent to a conversation you are in', async () => {
    const url = 'https://cdn.example/uploads/them/b.jpg';
    const { check } = build([url]);
    await expect(check([{ url }])).resolves.toBeUndefined();
  });

  it('refuses a URL that names no attachment row at all — the hole the gate exists to close', async () => {
    const { check } = build([]);
    await expect(check([{ url: 'https://tracker.example/pixel.gif' }])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a real file from a conversation the sender is not in', async () => {
    // The query is membership-scoped, so a file that exists but belongs to a
    // chat they are not in comes back as no row — same refusal, and this is
    // the assertion that would fail if somebody dropped the `members: some`.
    const { check } = build([]);
    await expect(check([{ url: 'https://cdn.example/uploads/them/private.pdf' }])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the thumbnail too, not only the file', async () => {
    const { check } = build(['https://cdn.example/uploads/them/ok.mp4']);
    await expect(check([{
      url: 'https://cdn.example/uploads/them/ok.mp4',
      thumbnail: 'https://tracker.example/pixel.gif',
    }])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
