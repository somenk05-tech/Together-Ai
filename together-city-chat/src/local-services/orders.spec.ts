import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';
import { ServiceOrdersService, transitions } from './orders.service';

/**
 * THE ORDER ENGINE'S OWN RULES, HELD.
 *
 * Money and promises are the two things this hub is not allowed to be casual
 * about, so the suite reads like the contract: prices come from the live menu
 * and nowhere else; sold out cannot be bought; the citizen is charged the
 * number they were shown or nothing; the state machine walks forward only; a
 * no is a refund; and what the citizen shared at checkout travels on the order
 * to the owner's eyes alone — the thread message that outlives everything
 * names nobody and locates nobody.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'u-owner';
const SEEKER = 'u-seeker';

function harness(opts: {
  menu?: any[];
  balance?: number;
  ai?: any;
  allergens?: string | null;
  payReplayInvoiceId?: string;
  payFails?: boolean;
  /** The listing's trust rung. Defaults to identity — gate lifted — so every
   *  test that is not about the cap never meets it. */
  tier?: string;
} = {}) {
  const listings: any[] = [{
    id: 'L1', ownerId: OWNER, businessName: 'The Bombay Kitchen', categoryKey: 'restaurants',
    moderation: 'approved', city: 'Mumbai', businessType: 'restaurant', createdAt: new Date(),
  }];
  const menu = opts.menu ?? [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', listingId: 'L1', section: 'Mains', name: 'Butter Chicken', description: 'Creamy tomato gravy', priceInr: 420, sortOrder: 0, available: true, veg: 'nonveg', spice: 1, photoUrl: null, prepMinutes: 25, variantsJson: null, addonsJson: JSON.stringify([{ name: 'Extra gravy', priceInr: 40 }]) },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', listingId: 'L1', section: 'Breads', name: 'Garlic Naan', description: null, priceInr: 120, sortOrder: 1, available: true, veg: 'veg', spice: 0, photoUrl: null, prepMinutes: null, variantsJson: JSON.stringify([{ name: 'Single', priceInr: 120 }, { name: 'Basket of 4', priceInr: 420 }]), addonsJson: null },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', listingId: 'L1', section: 'Drinks', name: 'Coke', description: null, priceInr: 60, sortOrder: 2, available: false, veg: 'veg', spice: 0, photoUrl: null, prepMinutes: null, variantsJson: null, addonsJson: null },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', listingId: 'L1', section: 'Mains', name: 'Seasonal Thali', description: null, priceInr: null, sortOrder: 3, available: true, veg: 'veg', spice: null, photoUrl: null, prepMinutes: null, variantsJson: null, addonsJson: null },
    { id: 'aaaaaaaa-0000-4000-8000-000000000005', listingId: 'L1', section: 'Mains', name: 'Kaju Masala', description: 'cashew gravy', priceInr: 380, sortOrder: 4, available: true, veg: 'veg', spice: 2, photoUrl: null, prepMinutes: null, variantsJson: null, addonsJson: null },
  ];
  const enquiries: any[] = [];
  const messages: any[] = [];
  const invoices: any[] = [];
  const orders: any[] = [];
  const profiles: any[] = opts.allergens !== undefined ? [{ userId: SEEKER, foodAllergens: opts.allergens, address: null }] : [];
  const book: any[] = [];
  const payCalls: any[] = [];
  const refundCalls: any[] = [];
  let seq = 0;

  const cmp = (where: any, r: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'listingId_seekerId') { const c = v as any; if (r.listingId !== c.listingId || r.seekerId !== c.seekerId) return false; continue; }
      if (v && typeof v === 'object' && 'in' in (v as any)) { if (!(v as any).in.includes(r[k])) return false; }
      else if (v && typeof v === 'object' && 'notIn' in (v as any)) { if ((v as any).notIn.includes(r[k])) return false; }
      else if (v && typeof v === 'object' && 'not' in (v as any)) { if (r[k] === (v as any).not) return false; }
      else if (r[k] !== v) return false;
    }
    return true;
  };
  const applyData = (r: any, data: any) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as any)) r[k] += (v as any).increment;
      else r[k] = v;
    }
  };

  const prisma: any = {
    serviceListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      findMany: async ({ where }: any) => listings.filter((l) => cmp(where, l)),
      update: async ({ where, data }: any) => { const r = listings.find((l) => l.id === where.id); applyData(r, data); return r; },
    },
    serviceMenuItem: {
      findMany: async ({ where }: any) => menu.filter((m) => cmp(where, m)).sort((a, b) => a.sortOrder - b.sortOrder),
      findFirst: async ({ where }: any) => menu.find((m) => cmp(where, m)) ?? null,
      update: async ({ where, data }: any) => { const r = menu.find((m) => m.id === where.id); applyData(r, data); return r; },
    },
    serviceEnquiry: {
      findUnique: async ({ where }: any) => enquiries.find((e) => cmp(where, e)) ?? null,
      count: async () => enquiries.length,
      create: async ({ data }: any) => { const r = { id: `E${++seq}`, lastMessageAt: new Date(), seekerUnread: 0, ownerUnread: 0, closed: false, revealName: false, createdAt: new Date(), ...data }; enquiries.push(r); return r; },
      update: async ({ where, data }: any) => { const r = enquiries.find((e) => e.id === where.id); applyData(r, data); return r; },
    },
    serviceMessage: {
      create: async ({ data }: any) => { const r = { id: `S${++seq}`, createdAt: new Date(), ...data }; messages.push(r); return r; },
      findMany: async () => messages,
    },
    invoice: {
      count: async () => invoices.length,
      create: async ({ data }: any) => {
        const { items, ...rest } = data;
        if (invoices.some((i) => i.number === rest.number)) { const e: any = new Error('unique'); e.code = 'P2002'; throw e; }
        const r = { id: `I${++seq}`, paidInr: 0, refundedInr: 0, cancelledAt: null, ...rest };
        invoices.push(r); void items; return r;
      },
      updateMany: async ({ where, data }: any) => {
        const hits = invoices.filter((i) => cmp(where, i));
        for (const r of hits) applyData(r, data);
        return { count: hits.length };
      },
    },
    serviceOrder: {
      count: async ({ where }: any = {}) =>
        (where ? orders.filter((o) => cmp(where, o)).length : orders.length),
      findUnique: async ({ where }: any) => orders.find((o) => cmp(where, o)) ?? null,
      findMany: async ({ where }: any) => orders.filter((o) => cmp(where, o)),
      create: async ({ data }: any) => {
        if (orders.some((o) => o.number === data.number)) { const e: any = new Error('unique'); e.code = 'P2002'; throw e; }
        const r = {
          id: `O${++seq}`, status: 'submitted', prepMinutes: null, note: null, phone: null,
          addressText: null, lat: null, lng: null, rejectReason: null, cancelReason: null,
          adjustmentNote: null, acceptedAt: null, preparingAt: null, readyAt: null,
          completedAt: null, rejectedAt: null, cancelledAt: null, createdAt: new Date(), ...data,
        };
        orders.push(r); return r;
      },
      updateMany: async ({ where, data }: any) => {
        const hits = orders.filter((o) => cmp(where, o));
        for (const r of hits) applyData(r, data);
        return { count: hits.length };
      },
    },
    user: {
      findUnique: async ({ where }: any) => (where.id === SEEKER ? { id: SEEKER, name: 'Rahul' } : { id: where.id, name: 'Somebody' }),
      findMany: async () => [],
    },
    masterProfile: {
      findUnique: async ({ where }: any) => profiles.find((p) => p.userId === where.userId) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const r = profiles.find((p) => p.userId === where.userId);
        if (r) { applyData(r, update); return r; }
        const made = { ...create }; profiles.push(made); return made;
      },
    },
    savedAddress: {
      upsert: async ({ where, update, create }: any) => {
        const k = where.userId_label;
        const r = book.find((b) => b.userId === k.userId && b.label === k.label);
        if (r) { applyData(r, update); return r; }
        const made = { ...create }; book.push(made); return made;
      },
    },
  };
  prisma.$transaction = async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma));

  const services: any = Object.create(LocalServicesService.prototype);
  services.prisma = prisma;
  services.notifications = { create: async () => undefined };
  services.ai = {};
  services.verification = { holdsNewThread: async () => false, releaseFor: async () => 0, badgeFor: async () => null, summariesFor: async () => new Map() };

  const notes: any[] = [];
  const svc: any = Object.create(ServiceOrdersService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async (n: any) => { notes.push(n); } };
  svc.financial = { wallet: async () => ({ balanceInr: opts.balance ?? 5_000, card: null }) };
  svc.payments = {
    pay: async (userId: string, invoiceId: string, dto: any, key?: string) => {
      payCalls.push({ userId, invoiceId, dto, key });
      if (opts.payFails) throw new BadRequestException('Your wallet covers ₹0 of this. Link a card, or top up.');
      const targetId = opts.payReplayInvoiceId ?? invoiceId;
      const inv = invoices.find((i) => i.id === targetId);
      if (inv) inv.paidInr = inv.totalInr;
      return { paid: true, replayed: !!opts.payReplayInvoiceId, invoice: { id: targetId }, payment: {} };
    },
    refund: async (ownerId: string, invoiceId: string, amountInr: number, reason: string) => {
      refundCalls.push({ ownerId, invoiceId, amountInr, reason });
      const inv = invoices.find((i) => i.id === invoiceId);
      if (inv) inv.refundedInr += amountInr;
      return { ok: true };
    },
  };
  svc.clock = { now: () => new Date() };
  svc.ai = opts.ai ?? { recommendFromMenu: async () => ({ ok: false, reason: 'off' }) };
  svc.services = services;
  svc.verification = { tierOf: async () => opts.tier ?? 'identity' };

  return { svc, prisma, menu, enquiries, messages, invoices, orders, profiles, book, payCalls, refundCalls, notes };
}

const BUTTER = 'aaaaaaaa-0000-4000-8000-000000000001';
const NAAN = 'aaaaaaaa-0000-4000-8000-000000000002';
const COKE = 'aaaaaaaa-0000-4000-8000-000000000003';
const THALI = 'aaaaaaaa-0000-4000-8000-000000000004';
const KAJU = 'aaaaaaaa-0000-4000-8000-000000000005';

const DELIVERY = {
  fulfilment: 'delivery' as const,
  phone: '9876543210',
  address: '14, Marine Drive, Mumbai 400002',
  lat: 18.94, lng: 72.82,
};

describe('the state machine walks forward only', () => {
  it('knows every road out of every state, and there are no others', () => {
    expect(transitions('submitted')).toEqual(['accepted', 'rejected', 'cancelled']);
    expect(transitions('accepted')).toEqual(['preparing']);
    expect(transitions('preparing')).toEqual(['ready']);
    expect(transitions('ready')).toEqual(['completed']);
    for (const terminal of ['completed', 'rejected', 'cancelled']) {
      expect(transitions(terminal)).toEqual([]);
    }
  });
});

describe('the quote prices from the live menu and nowhere else', () => {
  it('does the arithmetic: variant price, add-ons, quantity — and the two flat fees, named', async () => {
    const { svc } = harness();
    const q = await svc.quote(SEEKER, 'L1', {
      items: [
        { itemId: BUTTER, qty: 1, addons: ['Extra gravy'] }, // 420 + 40
        { itemId: NAAN, qty: 2, variant: 'Single' }, // 2 × 120
      ],
    });
    expect(q.lines.map((l: any) => l.lineTotalInr)).toEqual([460, 240]);
    expect(q.subtotalInr).toBe(700);
    // Itemized, never folded into a line: ₹20 platform + ₹50 delivery.
    expect(q.platformFeeInr).toBe(20);
    expect(q.deliveryFeeInr).toBe(50);
    expect(q.totalInr).toBe(770);
    expect(q.shortfallInr).toBe(0);
  });

  it('a pickup order carries the platform fee and no delivery fee', async () => {
    const { svc } = harness();
    const q = await svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], fulfilment: 'pickup' });
    expect(q.platformFeeInr).toBe(20);
    expect(q.deliveryFeeInr).toBe(0);
    expect(q.totalInr).toBe(440);
  });

  it('refuses a sold-out item by name', async () => {
    const { svc } = harness();
    const err = await svc.quote(SEEKER, 'L1', { items: [{ itemId: COKE, qty: 1 }] }).then(() => null, (e: any) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('Coke');
    expect(err.message).toMatch(/sold out/i);
  });

  it('refuses an unpriced item — "Ask" is a conversation, not a checkout', async () => {
    const { svc } = harness();
    await expect(svc.quote(SEEKER, 'L1', { items: [{ itemId: THALI, qty: 1 }] }))
      .rejects.toThrow(/no listed price/i);
  });

  it('refuses a variant or add-on the menu no longer lists', async () => {
    const { svc } = harness();
    await expect(svc.quote(SEEKER, 'L1', { items: [{ itemId: NAAN, qty: 1, variant: 'Family tub' }] }))
      .rejects.toThrow(/no longer comes as/i);
    await expect(svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1, addons: ['Gold leaf'] }] }))
      .rejects.toThrow(/no longer offers/i);
  });

  it('says the shortfall when the wallet does not cover it — fees included', async () => {
    const { svc } = harness({ balance: 100 });
    const q = await svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }] });
    expect(q.shortfallInr).toBe(390); // 420 + 20 + 50 − 100
  });

  it('is not for ordering from your own shop', async () => {
    const { svc } = harness();
    await expect(svc.quote(OWNER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }] }))
      .rejects.toThrow(/your own business/i);
  });
});

describe('placing an order: pay, then promise', () => {
  it('mints the invoice, charges the till, writes the order and the card — in that order', async () => {
    const { svc, invoices, orders, messages, payCalls, notes } = harness();
    const out = await svc.place(SEEKER, 'L1', {
      items: [{ itemId: BUTTER, qty: 1 }, { itemId: NAAN, qty: 2, variant: 'Single' }],
      expectInr: 730, ...DELIVERY, note: 'Less oil please',
    }, 'key-1');

    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe('sent'); // born sent — never a draft
    expect(payCalls).toEqual([expect.objectContaining({ invoiceId: invoices[0].id, dto: { expectInr: 730, useWallet: true }, key: 'key-1' })]);
    expect(orders).toHaveLength(1);
    expect(orders[0].number).toMatch(/^TCO-/);
    expect(orders[0].invoiceId).toBe(invoices[0].id);
    expect(JSON.parse(orders[0].itemsJson)).toHaveLength(2);
    expect(out.order.status).toBe('submitted');
    // The card is in the room and the owner was told.
    expect(messages).toHaveLength(1);
    expect(messages[0].orderId).toBe(orders[0].id);
    expect(notes.map((n: any) => n.kind)).toContain('service_order');
  });

  it('the thread message names nobody and locates nobody — the identity is on the order, for the owner', async () => {
    const { svc, messages } = harness();
    await svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    // The purge plan's promise — "no identity in those rows to destroy" —
    // holds only if this body never carries what the checkout shared.
    expect(messages[0].body).not.toContain('Rahul');
    expect(messages[0].body).not.toContain('Marine Drive');
    expect(messages[0].body).not.toContain('9876543210');
    expect(messages[0].body).toContain('Butter Chicken');
  });

  it('shows the owner the identity and keeps it out of the citizen’s own copy of the wire', async () => {
    const { svc, orders } = harness();
    await svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    const mineCopy = await svc.one(SEEKER, orders[0].id);
    const ownerCopy = await svc.one(OWNER, orders[0].id);
    expect(mineCopy.customerName).toBeUndefined();
    expect(mineCopy.addressText).toBeUndefined();
    expect(ownerCopy.customerName).toBe('Rahul');
    expect(ownerCopy.addressText).toContain('Marine Drive');
    expect(ownerCopy.phone).toBe('9876543210');
  });

  it('charges the number the citizen was shown, or nothing — fees inside that number', async () => {
    const { svc, payCalls, orders } = harness();
    // 420 of food is not the total any more: the guard answers with 490.
    await expect(svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 420, ...DELIVERY }))
      .rejects.toThrow(/now comes to ₹490/);
    expect(payCalls).toHaveLength(0);
    expect(orders).toHaveLength(0);
  });

  it('the invoice carries the fees on its own extra line, and the order snapshots them', async () => {
    const { svc, invoices, orders } = harness();
    await svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    expect(invoices[0]).toMatchObject({ subtotalInr: 420, extraInr: 70, totalInr: 490 });
    expect(invoices[0].notes).toMatch(/platform fee/i);
    expect(orders[0]).toMatchObject({ subtotalInr: 420, platformFeeInr: 20, deliveryFeeInr: 50, totalInr: 490 });
  });

  it('a delivery order without location services is refused, and told why', async () => {
    const { svc } = harness();
    const { lat, lng, ...noPin } = DELIVERY;
    void lat; void lng;
    await expect(svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 420, ...noPin }))
      .rejects.toThrow(/location services/i);
  });

  it('a delivery order needs an address; a pickup order refuses one', async () => {
    const { svc } = harness();
    const { address, ...noAddress } = DELIVERY;
    void address;
    await expect(svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 420, ...noAddress }))
      .rejects.toThrow(/needs an address/i);
    await expect(svc.place(SEEKER, 'L1', {
      items: [{ itemId: BUTTER, qty: 1 }], expectInr: 420,
      fulfilment: 'pickup', phone: '9876543210', address: 'somewhere',
    })).rejects.toThrow(/does not take an address/i);
  });

  it('saves the address to the book ONLY when the box was ticked — home also mirrors the legacy line', async () => {
    const first = harness();
    await first.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    expect(first.profiles).toHaveLength(0);
    expect(first.book).toHaveLength(0);

    const second = harness();
    await second.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY, saveAddress: true });
    expect(second.book[0]).toMatchObject({ label: 'home' });
    expect(second.book[0].addressText).toContain('Marine Drive');
    // home mirrors the legacy single line, so its old readers keep reading true
    expect(second.profiles[0].address).toContain('Marine Drive');

    const third = harness();
    await third.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY, saveAddress: true, saveLabel: 'work' });
    expect(third.book[0]).toMatchObject({ label: 'work' });
    // …and a page that is not home touches the legacy line not at all.
    expect(third.profiles).toHaveLength(0);
  });

  it('a failed payment leaves no order and no live invoice', async () => {
    const { svc, invoices, orders, messages } = harness({ payFails: true });
    await expect(svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY }))
      .rejects.toThrow(/wallet/i);
    expect(orders).toHaveLength(0);
    expect(messages).toHaveLength(0);
    expect(invoices[0].status).toBe('cancelled'); // not left in anybody's list as owed
  });

  it('a replayed payment returns the original order and kills the duplicate invoice', async () => {
    const h = harness();
    await h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY }, 'key-1');
    const originalInvoice = h.invoices[0].id;
    const originalOrder = h.orders[0].id;

    // The retry: the till answers from the first attempt's row.
    (h.svc as any).payments.pay = async () => {
      return { paid: true, replayed: true, invoice: { id: originalInvoice }, payment: {} };
    };
    const out = await h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY }, 'key-1');
    expect(out.order.id).toBe(originalOrder);
    expect(h.orders).toHaveLength(1); // promised exactly once
    const duplicate = h.invoices.find((i: any) => i.id !== originalInvoice);
    expect(duplicate.status).toBe('cancelled');
  });
});

describe('the owner’s verbs', () => {
  const placed = async (h = harness()) => {
    await h.svc.place(SEEKER, 'L1', {
      items: [{ itemId: BUTTER, qty: 1 }, { itemId: NAAN, qty: 2, variant: 'Single' }],
      expectInr: 730, ...DELIVERY,
    });
    return { ...h, order: h.orders[0] };
  };

  it('accept stamps the time and tells the citizen the wait', async () => {
    const h = await placed();
    const out = await h.svc.accept(OWNER, h.order.id, { prepMinutes: 25 });
    expect(out.status).toBe('accepted');
    expect(out.prepMinutes).toBe(25);
    expect(h.order.acceptedAt).toBeTruthy();
    expect(h.notes.some((n: any) => n.title.includes('accepted'))).toBe(true);
  });

  it('an agreed removal makes the order smaller and refunds the difference through the till', async () => {
    const h = await placed();
    await h.svc.accept(OWNER, h.order.id, { removeLines: [1], adjustmentNote: 'Out of naan tonight.' });
    // The naan's ₹240 comes back; the two fees stay, because dinner is still
    // being cooked and carried.
    expect(h.order.totalInr).toBe(490);
    expect(JSON.parse(h.order.itemsJson)).toHaveLength(1);
    expect(h.refundCalls).toEqual([expect.objectContaining({ amountInr: 240, invoiceId: h.order.invoiceId })]);
  });

  it('an accept can never remove everything — that is a rejection with a reason', async () => {
    const h = await placed();
    await expect(h.svc.accept(OWNER, h.order.id, { removeLines: [0, 1] }))
      .rejects.toThrow(/reject the order instead/i);
    expect(h.refundCalls).toHaveLength(0);
  });

  it('reject refunds every rupee and the citizen reads the reason verbatim', async () => {
    const h = await placed();
    await h.svc.reject(OWNER, h.order.id, { reason: 'Kitchen closed early tonight.' });
    expect(h.order.status).toBe('rejected');
    expect(h.refundCalls).toEqual([expect.objectContaining({ amountInr: 730 })]);
    expect(h.notes.at(-1).body).toContain('Kitchen closed early tonight.');
    expect(h.notes.at(-1).body).toContain('refunded');
  });

  it('the kitchen walks forward one step at a time and cannot skip', async () => {
    const h = await placed();
    await h.svc.accept(OWNER, h.order.id, {});
    await expect(h.svc.advance(OWNER, h.order.id, 'completed')).rejects.toThrow(/cannot become/);
    await h.svc.advance(OWNER, h.order.id, 'preparing');
    await h.svc.advance(OWNER, h.order.id, 'ready');
    const done = await h.svc.advance(OWNER, h.order.id, 'completed');
    expect(done.status).toBe('completed');
    expect(h.order.preparingAt && h.order.readyAt && h.order.completedAt).toBeTruthy();
  });

  it('two accepts from two devices land once — the second is told it moved on', async () => {
    const h = await placed();
    await h.svc.accept(OWNER, h.order.id, {});
    await expect(h.svc.accept(OWNER, h.order.id, {})).rejects.toThrow(/already moved on|cannot become/);
  });

  it('the citizen cannot accept, and a stranger cannot even see it', async () => {
    const h = await placed();
    await expect(h.svc.accept(SEEKER, h.order.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.one('u-stranger', h.order.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('five orders before verification', () => {
  const load = async (h: any, n: number) => {
    for (let i = 0; i < n; i += 1) {
      h.orders.push({
        id: `old${i}`, listingId: 'L1', userId: `u-${i}`, enquiryId: `E-${i}`, number: `TCO-x${i}`,
        status: 'completed', fulfilment: 'pickup', itemsJson: '[]', subtotalInr: 100,
        platformFeeInr: 20, deliveryFeeInr: 0, totalInr: 120, invoiceId: `I-x${i}`,
        customerName: 'Someone', submittedAt: new Date(), createdAt: new Date(),
      });
    }
  };

  it('the sixth order at an unverified kitchen is refused, at the quote and at the till', async () => {
    const h = harness({ tier: 'basic' });
    await load(h, 5);
    await expect(h.svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }] }))
      .rejects.toThrow(/can take 5 orders before it verifies/i);
    await expect(h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY }))
      .rejects.toThrow(/verifying takes minutes/i);
    expect(h.payCalls).toHaveLength(0);
  });

  it('under five, the unverified kitchen still takes the order', async () => {
    const h = harness({ tier: 'basic' });
    await load(h, 4);
    const out = await h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    expect(out.order.status).toBe('submitted');
  });

  it('rejected and cancelled orders never count — those were never taken', async () => {
    const h = harness({ tier: 'basic' });
    await load(h, 5);
    h.orders[0].status = 'rejected';
    h.orders[1].status = 'cancelled';
    const q = await h.svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }] });
    expect(q.totalInr).toBe(490);
  });

  it('an identity-verified kitchen has no cap at all', async () => {
    const h = harness(); // default tier: identity
    await load(h, 50);
    const q = await h.svc.quote(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }] });
    expect(q.totalInr).toBe(490);
  });
});

describe('the citizen’s cancel', () => {
  it('works while the order is only submitted, and the money comes straight back', async () => {
    const h = harness();
    await h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    await h.svc.cancel(SEEKER, h.orders[0].id, { reason: 'Ordered twice by mistake' });
    expect(h.orders[0].status).toBe('cancelled');
    expect(h.refundCalls).toEqual([expect.objectContaining({ amountInr: 490, ownerId: OWNER })]);
  });

  it('is refused once the kitchen has said yes — the thread is the way from there', async () => {
    const h = harness();
    await h.svc.place(SEEKER, 'L1', { items: [{ itemId: BUTTER, qty: 1 }], expectInr: 490, ...DELIVERY });
    await h.svc.accept(OWNER, h.orders[0].id, {});
    await expect(h.svc.cancel(SEEKER, h.orders[0].id, {})).rejects.toThrow(/already taken this order/i);
    expect(h.refundCalls).toHaveLength(0);
  });
});

describe('the recommender: the model proposes, the live menu disposes', () => {
  it('is shown only available, priced items — and its answer is filtered against the same set', async () => {
    let shown: any[] = [];
    const h = harness({
      ai: {
        recommendFromMenu: async (input: any) => {
          shown = input.items;
          return {
            ok: true,
            why: 'A mild veg meal.',
            picks: [
              { id: KAJU, qty: 1 }, // fine
              { id: COKE, qty: 1 }, // sold out — was never shown, must not survive
              { id: 'ffffffff-0000-4000-8000-00000000dead', qty: 1 }, // invented
            ],
          };
        },
      },
    });
    const out = await h.svc.recommend(SEEKER, 'L1', { brief: 'veg, not too spicy' });
    // Sold out and unpriced never reached the model.
    expect(shown.map((i: any) => i.name)).not.toContain('Coke');
    expect(shown.map((i: any) => i.name)).not.toContain('Seasonal Thali');
    // And the answer was filtered again: only the real, available pick remains.
    expect(out.picks.map((p: any) => p.name)).toEqual(['Kaju Masala']);
    expect(out.totalInr).toBe(380);
    expect(out.caveat).toMatch(/nothing is ordered until you place it/i);
  });

  it('screens declared allergens deterministically, and says what it left out', async () => {
    const h = harness({
      allergens: 'nut',
      ai: { recommendFromMenu: async (input: any) => ({ ok: true, why: '', picks: input.items.map((i: any) => ({ id: i.id, qty: 1 })) }) },
    });
    const out = await h.svc.recommend(SEEKER, 'L1', { brief: 'anything veg' });
    // Kaju is cashew — the shared matcher catches it before the model ever sees it.
    expect(out.picks.map((p: any) => p.name)).not.toContain('Kaju Masala');
    expect((out.screened ?? []).join(' ')).toMatch(/Kaju Masala/);
  });

  it('says plainly when the recommender is off, and never invents an answer', async () => {
    const h = harness(); // default ai: off
    const err = await h.svc.recommend(SEEKER, 'L1', { brief: 'veg' }).then(() => null, (e: any) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.message).toMatch(/pick by hand/i);
  });
});
