import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RealEstateService } from './realestate.service';

/**
 * Connect with the seller (enquire) — the behaviours that make it a
 * marketplace feature rather than a chat curiosity:
 *
 *  • a buyer reaches the seller of an approved listing and gets a
 *    conversation id back;
 *  • the listing goes into the chat as a rich card exactly once — repeat
 *    Connects reuse the conversation and do not re-paste the card;
 *  • your own listing, a platform listing, and an unapproved listing are
 *    all refused (the last one as NotFound, matching detail()'s visibility);
 *  • the seller is notified, pointed at the conversation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const LISTING = {
  id: 'prop-1', sellerId: 'seller-1', moderation: 'approved',
  listingType: 'sale', propertyType: 'apartment', status: 'ready',
  title: '2BHK in Indiranagar', city: 'Bengaluru', locality: 'Indiranagar',
  priceInr: 9_000_000, areaSqft: 1200,
  photosJson: JSON.stringify([{ url: 'p1.webp' }]),
};

function build(over: Partial<typeof LISTING> | null = {}, opts: { priorCard?: boolean } = {}) {
  const s: any = Object.create(RealEstateService.prototype);
  const sent: any[] = [];
  const notified: any[] = [];
  s.prisma = {
    property: { findUnique: async () => (over === null ? null : { ...LISTING, ...over }) },
    message: { findFirst: async () => (opts.priorCard ? { id: 'msg-1' } : null) },
  };
  s.conversations = { getOrCreateDirectByIds: async (a: string, b: string, trust?: number) => `conv:${a}:${b}:${trust}` };
  s.messages = { send: async (senderId: string, dto: any) => { sent.push({ senderId, dto }); return dto; } };
  s.notifications = { create: async (n: any) => { notified.push(n); } };
  return { s, sent, notified };
}

describe('enquire — connect with the seller', () => {
  it('opens the conversation, sends the listing card, notifies the seller', async () => {
    const { s, sent, notified } = build();
    const out = await s.enquire('buyer-1', 'prop-1');
    expect(out).toEqual({ conversationId: 'conv:buyer-1:seller-1:2', alreadyOpen: false });
    expect(sent).toHaveLength(1);
    expect(sent[0].senderId).toBe('buyer-1');
    expect(sent[0].dto.share).toMatchObject({ kind: 'property', deepLink: '/realestate/property/prop-1' });
    expect(sent[0].dto.body).toContain('2BHK in Indiranagar');
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ userId: 'seller-1', kind: 'realestate_enquiry', href: '/chats?c=conv:buyer-1:seller-1:2' });
  });

  it('carries the buyer’s own message when they typed one', async () => {
    const { s, sent } = build();
    await s.enquire('buyer-1', 'prop-1', '  Is the price negotiable?  ');
    expect(sent[0].dto.body).toBe('Is the price negotiable?');
  });

  it('does not re-paste the card on a repeat Connect — reuses the conversation', async () => {
    const { s, sent, notified } = build({}, { priorCard: true });
    const out = await s.enquire('buyer-1', 'prop-1');
    expect(out.alreadyOpen).toBe(true);
    expect(sent).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('a repeat Connect with a fresh message sends the message, not another card', async () => {
    const { s, sent } = build({}, { priorCard: true });
    await s.enquire('buyer-1', 'prop-1', 'Still available?');
    expect(sent).toHaveLength(1);
    expect(sent[0].dto.body).toBe('Still available?');
    expect(sent[0].dto.share).toBeUndefined();
  });

  it('refuses your own listing and platform listings; hides unapproved ones', async () => {
    await expect(build({ sellerId: 'buyer-1' }).s.enquire('buyer-1', 'prop-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ sellerId: null as unknown as string }).s.enquire('buyer-1', 'prop-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ moderation: 'pending' }).s.enquire('buyer-1', 'prop-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(null).s.enquire('buyer-1', 'prop-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
