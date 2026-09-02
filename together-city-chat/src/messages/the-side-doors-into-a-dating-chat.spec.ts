/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessagesService } from './messages.service';
import { ShareCardSchema, SendMessageSchema } from './dto/messages.dto';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ── THE SIDE DOORS INTO A DATING CHAT (fifth audit, 29 Aug) ─────────────────
 *
 * Three rules in this hub are enforced in one place each and then routed
 * around by a fourth thing nobody updated. `serialize` masks the sender block,
 * `members()` masks the roster, `screenAttachments` screens the pictures — and
 * each of those had a door beside it that had never been asked the question.
 *
 *   · `GET /messages/:id/info` arrived after the masking and knew nothing
 *     about it, so it answered "who has read this" with the other person's
 *     city handle.
 *   · `share.image` is not an attachment, so neither the ownership gate nor
 *     the media guard ever looked at it — a 200 KB `data:` payload straight
 *     onto a stranger's screen, through the one field the guard does not read.
 *   · `clientId` was documented as idempotency and stored nowhere, so a
 *     retried send said the same thing twice.
 *
 * What follows pins each of them, and pins the SHAPE rather than the wording:
 * the point is that the question is asked where the answer is built.
 */

/** The masking `info()` performs, replicated exactly, applied to a row. */
function maskedRecipient(
  type: string, anonymousTrust: number | null, recipientId: string, callerId: string,
) {
  const msg = { conversation: { type, anonymousTrust } };
  const r = { userId: recipientId, user: { name: 'Angel', handle: 'somen' } };
  const at = msg.conversation?.anonymousTrust;
  const anonymous = msg.conversation?.type === 'DIRECT' && at != null && at < 2;
  const masked = anonymous && r.userId !== callerId;
  return {
    userId: r.userId,
    name: masked ? 'nickname(...)' : (r.user?.name ?? null),
    handle: masked ? null : (r.user?.handle ?? null),
  };
}

describe('who has read this message does not answer with the city handle', () => {
  it('withholds the handle while the dating chat is anonymous', () => {
    for (const trust of [0, 1]) {
      const r = maskedRecipient('DIRECT', trust, 'them', 'me');
      expect(r.handle).toBeNull();
      expect(r.name).toBe('nickname(...)');
    }
  });

  it('hands it over once both sides have revealed', () => {
    expect(maskedRecipient('DIRECT', 2, 'them', 'me')).toEqual({ userId: 'them', name: 'Angel', handle: 'somen' });
  });

  it('leaves an ordinary city chat, and a group, untouched', () => {
    expect(maskedRecipient('DIRECT', null, 'them', 'me').handle).toBe('somen');
    expect(maskedRecipient('GROUP', 1, 'them', 'me').handle).toBe('somen');
  });

  it('reads the conversation WITH the message rather than after it', () => {
    // A second query is a second thing to forget. The row that decides comes
    // back with the row being asked about.
    const svc = read('messages/messages.service.ts');
    const info = svc.slice(svc.indexOf('async info('), svc.indexOf('async search('));
    expect(info).toMatch(/conversation: \{ select: \{ type: true, anonymousTrust: true \} \}/);
    expect(info).toMatch(/const anonymous = msg\.conversation\?\.type === 'DIRECT'/);
    expect(info).toMatch(/handle: masked \? null :/);
    expect(info).not.toMatch(/handle: r\.user\?\.handle \?\? null,\n\s+status/);
  });
});

describe('a share card is a link to a picture, never the picture', () => {
  it('refuses a data: payload — the 200 KB the field used to take', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(400);
    expect(ShareCardSchema.safeParse({ kind: 'x', title: 'y', image: big }).success).toBe(false);
  });

  it('refuses plain http and a javascript: src', () => {
    for (const image of ['http://evil.example/p.jpg', 'javascript:alert(1)', 'ftp://x/y.png']) {
      expect(ShareCardSchema.safeParse({ kind: 'x', title: 'y', image }).success).toBe(false);
    }
  });

  it('takes an https link or an app path, which is every real caller', () => {
    for (const image of ['https://image.tmdb.org/p/abc.jpg', '/uploads/u1/abc.jpg', null]) {
      expect(ShareCardSchema.safeParse({ kind: 'x', title: 'y', image }).success).toBe(true);
    }
  });

  it('and a card link is a path inside the app, not a way out of it', () => {
    // `deepLink` is the sibling of `image` and was hardened a day late: the
    // client renders it as `<Link to={card.deepLink}>` inside a message
    // thread, and `//evil.example/x` is a protocol-relative href — one tap on
    // a card a stranger sent and the browser leaves the city. (re-audit, 29 Aug)
    for (const deepLink of ['//evil.example/x', 'https://evil.example/x', 'javascript:alert(1)', 'evil']) {
      expect(ShareCardSchema.safeParse({ kind: 'x', title: 'y', deepLink }).success).toBe(false);
    }
    for (const deepLink of ['/realestate/property/abc', '/nutrition/shared-meal?d=tok', null]) {
      expect(ShareCardSchema.safeParse({ kind: 'x', title: 'y', deepLink }).success).toBe(true);
    }
  });

  it('and the whole card is still optional — a share is not required to have one', () => {
    expect(SendMessageSchema.safeParse({
      conversationId: '00000000-0000-4000-8000-000000000000', text: 'hi',
    }).success).toBe(true);
  });
});

describe('a chat between strangers takes no picture from outside the city', () => {
  const build = (anonymousTrust: number | null) => {
    const prisma: any = { conversation: { findUnique: async () => ({ anonymousTrust }) } };
    return new MessagesService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never);
  };

  it('drops the picture in a dating chat, and keeps the rest of the card', async () => {
    const card = { kind: 'film', title: 'Tumbbad', subtitle: 'Horror', image: 'https://poster.example/t.jpg' };
    const out = await (build(0) as any).shareForConversation('c1', card);
    expect(out).toEqual({ ...card, image: null });
  });

  it('leaves an ordinary city chat alone', async () => {
    const card = { kind: 'film', title: 'Tumbbad', image: 'https://poster.example/t.jpg' };
    expect(await (build(null) as any).shareForConversation('c1', card)).toEqual(card);
  });

  /**
   * ── BELOW THE REVEAL, NOT MERELY "SET" (re-audit, 29 Aug) ────────────────
   *
   * The first version fired on any non-null `anonymousTrust`, while every
   * other anonymity test in the tree draws the line at `< 2`. It broke two
   * things it was never about: a dating chat where BOTH people have revealed —
   * by definition no longer a chat between strangers — and the real-estate
   * enquiry thread, which opens at trust 2 and whose whole purpose is sharing
   * the property, photograph and all.
   */
  it('hands the picture over once both sides have revealed', async () => {
    const card = { kind: 'film', title: 'Tumbbad', image: 'https://poster.example/t.jpg' };
    expect(await (build(2) as any).shareForConversation('c1', card)).toEqual(card);
  });

  it('and in the real-estate enquiry thread, which opens at that same trust', async () => {
    const card = { kind: 'property', title: '2BHK', image: 'https://media.city/p.jpg' };
    expect(await (build(2) as any).shareForConversation('c1', card)).toEqual(card);
  });

  it('but strips it at 0 and at 1', async () => {
    const card = { kind: 'film', title: 'Tumbbad', image: 'https://poster.example/t.jpg' };
    for (const trust of [0, 1]) {
      expect((await (build(trust) as any).shareForConversation('c1', card)).image).toBeNull();
    }
  });

  it('does not go to the database for a card with no picture', async () => {
    let asked = 0;
    const prisma: any = { conversation: { findUnique: async () => { asked += 1; return { anonymousTrust: 0 }; } } };
    const svc: any = new MessagesService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never);
    await svc.shareForConversation('c1', { kind: 'film', title: 'Tumbbad' });
    expect(asked).toBe(0);
  });

  it('is asked on the send path, before anything is persisted', () => {
    const svc = read('messages/messages.service.ts');
    const send = svc.slice(svc.indexOf('async send('), svc.indexOf('message.create'));
    expect(send).toMatch(/shareForConversation\(dto\.conversationId, dto\.share\)/);
    // The persisted blob is the screened one, not the one that arrived.
    expect(svc).toMatch(/shareJson: share \? JSON\.stringify\(share\) : undefined/);
    expect(svc).not.toMatch(/shareJson: dto\.share \? JSON\.stringify\(dto\.share\) : undefined/);
  });
});

describe('a retried send is not a second message', () => {
  const svc = read('messages/messages.service.ts');
  const schema = read('../prisma/schema.prisma');

  it('is stored, uniquely, per sender', () => {
    expect(schema).toMatch(/clientId\s+String\?/);
    expect(schema).toMatch(/@@unique\(\[senderId, clientId\]\)/);
    expect(svc).toMatch(/clientId: dto\.clientId,/);
  });

  it('looks for the earlier send after the gate and before the media work', () => {
    const send = svc.slice(svc.indexOf('async send('), svc.indexOf('message.create'));
    const gate = send.indexOf('assertCanPostToConversation');
    const dedupe = send.indexOf('senderId_clientId');
    const media = send.indexOf('assertAttachmentsAreYoursToSend');
    expect(gate).toBeGreaterThan(-1);
    expect(dedupe).toBeGreaterThan(gate);
    expect(dedupe).toBeLessThan(media);
  });

  it('hands back the winner when two identical sends race', () => {
    // The read cannot see an uncommitted row, so the unique index is what
    // actually decides — and the loser has to return the message, not an
    // error, or the retry fails exactly when it was needed.
    expect(svc).toMatch(/e\.code === 'P2002'/);
    expect(svc).toMatch(/if \(won && won\.conversationId === dto\.conversationId\) return this\.serialize\(won\);/);
  });

  it('and the id has to name the SAME conversation', () => {
    // The unique key is (sender, clientId), so a client reusing an id across
    // rooms — a per-conversation sequence rather than a uuid — would have been
    // handed back the first message, from the wrong room, with the second send
    // dropped silently. Latent with today's `crypto.randomUUID()`; a latent
    // silent-message-loss is still one. (re-audit, 29 Aug)
    const send = svc.slice(svc.indexOf('async send('), svc.indexOf('message.create'));
    expect(send).toMatch(/if \(already && already\.conversationId === dto\.conversationId\) return this\.serialize\(already\);/);
    expect(send).toMatch(/has already been used in another conversation/);
  });

  it('does nothing at all when no client id was sent', () => {
    // Most sends carry none, and a unique index over NULLs does not collide.
    expect(svc).toMatch(/if \(dto\.clientId\) \{/);
  });
});
