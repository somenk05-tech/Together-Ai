import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';

/**
 * A MENU READ OFF A PHOTOGRAPH, AND THE STEP THAT MAKES IT SAFE.
 *
 * The extraction is the demo; the review step is the feature. An AI that writes
 * straight into a menu produces a business held to a price a model misread —
 * ₹180 read as ₹160 is twenty rupees a plate, found out during an argument at a
 * table. Nobody gets an exception. So the split is enforced on the server, not
 * only in the screen: `scanMenu` proposes and has no write path, `saveMenu` is
 * the only door into the table.
 *
 * The other rule that matters is NULL, NOT ZERO. A price the reader could not
 * make out is absent, and absent renders as "Ask". A ₹0 is a wrong number that
 * looks like a decision.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'u-owner';
const SEEKER = 'u-seeker';

function harness(opts: { menu?: any[]; extract?: any } = {}) {
  const listings: any[] = [{
    id: 'L1', ownerId: OWNER, businessName: 'Anna Idli', categoryKey: 'restaurants',
    about: null, city: 'Chennai', areas: '', phone: null, priceFrom: null, photosJson: '[]',
    lat: null, lng: null, radiusKm: null, menuScanUrl: null,
    moderation: 'approved', createdAt: new Date(), updatedAt: new Date(),
  }];
  const menu = opts.menu ?? [];
  const enquiries: any[] = [];
  const messages: any[] = [];
  let seq = 0;
  const cmp = (where: any, r: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'listingId_seekerId') { const c = v as any; if (r.listingId !== c.listingId || r.seekerId !== c.seekerId) return false; continue; }
      if (v && typeof v === 'object' && 'in' in (v as any)) { if (!(v as any).in.includes(r[k])) return false; }
      else if (v && typeof v === 'object' && 'notIn' in (v as any)) { if ((v as any).notIn.includes(r[k])) return false; }
      else if (r[k] !== v) return false;
    }
    return true;
  };
  const prisma: any = {
    serviceListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      update: async ({ where, data }: any) => { const r = listings.find((l) => l.id === where.id); Object.assign(r, data); return r; },
    },
    serviceMenuItem: {
      findMany: async ({ where }: any) => menu.filter((m) => cmp(where, m)).sort((a, b) => a.sortOrder - b.sortOrder),
      findFirst: async ({ where }: any) => menu.find((m) => cmp(where, m)) ?? null,
      deleteMany: async ({ where }: any) => { const keep = menu.filter((m) => !cmp(where, m)); const n = menu.length - keep.length; menu.length = 0; menu.push(...keep); return { count: n }; },
      createMany: async ({ data }: any) => { for (const d of data) menu.push({ id: `M${++seq}`, description: null, section: null, priceInr: null, available: true, ...d }); return { count: data.length }; },
      create: async ({ data }: any) => { const r = { id: `M${++seq}`, description: null, section: null, priceInr: null, available: true, veg: null, spice: null, photoUrl: null, prepMinutes: null, variantsJson: null, addonsJson: null, ...data }; menu.push(r); return r; },
      update: async ({ where, data }: any) => { const r = menu.find((m) => m.id === where.id); Object.assign(r, data); return r; },
    },
    serviceEnquiry: {
      findUnique: async ({ where }: any) => enquiries.find((e) => cmp(where, e)) ?? null,
      count: async () => enquiries.length,
      create: async ({ data }: any) => { const r = { id: `E${++seq}`, lastMessageAt: new Date(), seekerUnread: 0, ownerUnread: 0, closed: false, createdAt: new Date(), ...data }; enquiries.push(r); return r; },
      update: async ({ where, data }: any) => { const r = enquiries.find((e) => e.id === where.id); for (const [k, v] of Object.entries(data)) { if (v && typeof v === 'object' && 'increment' in (v as any)) r[k] += (v as any).increment; else r[k] = v; } return r; },
    },
    serviceMessage: {
      create: async ({ data }: any) => { const r = { id: `S${++seq}`, createdAt: new Date(), ...data }; messages.push(r); return r; },
      findMany: async () => messages,
    },
  };
  /* The same two shapes the real client answers: an array of writes, or a
     callback handed the client itself. Nothing here is a transaction — these
     tests are about what is written, not about atomicity. */
  prisma.$transaction = async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma));
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async () => undefined };
  /* THE READER'S ANSWER IS A RESULT, NOT A MAYBE (23 Aug). It used to return
     the draft or `null`, and `null` stood for three unrelated things at once:
     no key on the server, a picture the model could not read, and the provider
     being unreachable. The fixtures pass the shape through so the tests below
     can hold each of the three to its own sentence and its own status code. */
  svc.ai = { extractMenu: async () => opts.extract ?? { ok: false, reason: 'failed' } };
  /* THE GATE, STUBBED OPEN. These tests are about who the business can see,
     not about how many new neighbours a day it is given, and the real rule has
     its own two suites (trust.spec.ts, trust-gate.spec.ts, verification.spec.ts).
     "Never hold, release nothing, no badge" is the behaviour of a verified
     listing, which is what every fixture here is standing in for. */
  svc.verification = {
    holdsNewThread: async () => false,
    releaseFor: async () => 0,
    badgeFor: async () => null,
    summariesFor: async () => new Map(),
  };
  return { svc, menu, messages, listings };
}

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(64);

describe('reading a menu proposes and stores nothing', () => {
  it('returns a draft, and the table stays empty', async () => {
    const { svc, menu } = harness({
      extract: { ok: true, items: [{ name: 'Idli', priceInr: 40 }, { name: 'Filter coffee', priceInr: 20 }], note: '' },
    });
    const out = await svc.scanMenu(OWNER, 'L1', IMG);
    expect(out.items).toHaveLength(2);
    // The whole point: nothing was written.
    expect(menu).toHaveLength(0);
  });

  it('the draft carries no ids, because nothing exists to have one', async () => {
    const { svc } = harness({ extract: { ok: true, items: [{ name: 'Idli', priceInr: 40 }], note: '' } });
    const out = await svc.scanMenu(OWNER, 'L1', IMG);
    expect(out.items[0].id).toBeUndefined();
    expect(out.review).toMatch(/check every price/i);
  });

  it('refuses anything that is not an image', async () => {
    const { svc } = harness({ extract: { ok: true, items: [], note: '' } });
    await expect(svc.scanMenu(OWNER, 'L1', 'https://example.com/menu.jpg')).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * ── THREE WAYS TO NOT READ A MENU, AND THEY ARE NOT THE SAME ─────────────
   *
   * One sentence used to cover all three — "the menu reader is unavailable
   * right now" — for a server with no API key, a photograph the model could
   * not make sense of, and a provider that could not be reached. Only one of
   * those is anything the shopkeeper can act on, and the message they got did
   * not say which they had.
   *
   * The status codes carry the same split, and that half is for whoever runs
   * the server: 400 is a picture that needs retaking, 503 is a feature that is
   * down. A monitor cannot tell those apart if both are 400.
   */
  it('tells a shopkeeper which kind of failure they have', async () => {
    const cases = [
      { reason: 'off', status: 503, says: /switched off on this server/i },
      { reason: 'failed', status: 503, says: /try that photograph again/i },
      { reason: 'unreadable', status: 400, says: /could not make sense of that photograph/i },
    ] as const;
    for (const c of cases) {
      const { svc } = harness({ extract: { ok: false, reason: c.reason } });
      const err = await svc.scanMenu(OWNER, 'L1', IMG).then(() => null, (e: any) => e);
      expect({ reason: c.reason, status: err?.getStatus?.() }).toEqual({ reason: c.reason, status: c.status });
      expect(err.message).toMatch(c.says);
      // Every one of them points at the way through that always works. A dead
      // end is what makes a shopkeeper close the page.
      expect(err.message).toMatch(/type the items in yourself/i);
    }
  });

  /* And a failure still writes nothing, which is the rule the whole file is
     about — there is no path from a failed read to the table. */
  it('writes nothing when the reader fails', async () => {
    const { svc, menu } = harness({ extract: { ok: false, reason: 'failed' } });
    await expect(svc.scanMenu(OWNER, 'L1', IMG)).rejects.toBeTruthy();
    expect(menu).toHaveLength(0);
  });

  it('is only scannable by the business it belongs to', async () => {
    const { svc } = harness({ extract: { ok: true, items: [], note: '' } });
    await expect(svc.scanMenu(SEEKER, 'L1', IMG)).rejects.toBeTruthy();
  });
});

describe('publishing the corrected menu', () => {
  it('stores exactly what the owner confirmed, in their order', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', {
      items: [
        { name: 'Idli', section: 'Tiffin', priceInr: 40 },
        { name: 'Special of the day', priceInr: null },
      ],
    });
    expect(menu).toHaveLength(2);
    expect(menu[0].sortOrder).toBe(0);
    // Null survives the round trip. It is "ask", and it is not free.
    expect(menu[1].priceInr).toBeNull();
  });

  it('replaces rather than appends — a menu is the current menu', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Old', priceInr: 10 }] });
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'New', priceInr: 20 }] });
    expect(menu.map((m: any) => m.name)).toEqual(['New']);
  });

  it('keeps the photograph so the typing can be checked against it', async () => {
    const { svc, listings } = harness();
    await svc.saveMenu(OWNER, 'L1', { scanUrl: 'https://cdn.example/menu.webp', items: [] });
    expect(listings[0].menuScanUrl).toBe('https://cdn.example/menu.webp');
  });

  it('groups by the menu’s own headings when it is read back', async () => {
    const { svc } = harness();
    await svc.saveMenu(OWNER, 'L1', {
      items: [
        { name: 'Idli', section: 'Tiffin', priceInr: 40 },
        { name: 'Vada', section: 'Tiffin', priceInr: 30 },
        { name: 'Coffee', section: 'Drinks', priceInr: 20 },
      ],
    });
    const page = await svc.menu('L1', SEEKER);
    expect(page.sections.map((s: any) => s.section)).toEqual(['Tiffin', 'Drinks']);
    expect(page.sections[0].items).toHaveLength(2);
  });

  it('hides the menu of a business the citizen cannot open, and shows it to its owner', async () => {
    // The menu hangs off the listing page and inherits its visibility. If it
    // did not, reading a menu would be the back door into a business still
    // waiting on moderation.
    const { svc, listings } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    listings[0].moderation = 'pending';
    await expect(svc.menu('L1', SEEKER)).rejects.toBeInstanceOf(NotFoundException);
    const own = await svc.menu('L1', OWNER);
    expect(own.count).toBe(1);
  });

  it('lets the owner retype the menu without another photograph', async () => {
    // Editing is the same door as publishing: the whole list is submitted and
    // replaces what was there. A price that changed on Monday should not need
    // the printed menu back out of the drawer.
    const { svc } = harness();
    await svc.saveMenu(OWNER, 'L1', {
      scanUrl: 'https://cdn.example/menu.webp',
      items: [{ name: 'Idli', priceInr: 40 }, { name: 'Vada', priceInr: 30 }],
    });
    await svc.saveMenu(OWNER, 'L1', {
      items: [{ name: 'Idli', priceInr: 45 }, { name: 'Pongal', priceInr: 55 }],
    });
    const page = await svc.menu('L1', OWNER);
    expect(page.sections[0].items.map((i: any) => [i.name, i.priceInr]))
      .toEqual([['Idli', 45], ['Pongal', 55]]);
    // The photograph survives an edit that did not mention it — omitted is not
    // the same as cleared, and losing the original would remove the only way to
    // check the transcription.
    expect(page.scanUrl).toBe('https://cdn.example/menu.webp');
  });
});

describe('a line that keeps its id keeps what the bulk editor cannot see', () => {
  it('an id-carrying edit preserves the sold-out switch; a recreated line would not', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    // The command centre turns it off for the evening…
    await svc.patchMenuItem(OWNER, 'L1', menu[0].id, { available: false });
    // …and a price correction through the bulk editor must not turn it back on.
    await svc.saveMenu(OWNER, 'L1', { items: [{ id: menu[0].id, name: 'Idli', priceInr: 45 }] });
    expect(menu).toHaveLength(1);
    expect(menu[0].priceInr).toBe(45);
    expect(menu[0].available).toBe(false);
  });

  it('a line sent without its id is a new line, and the old one is gone', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    const oldId = menu[0].id;
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    expect(menu).toHaveLength(1);
    expect(menu[0].id).not.toBe(oldId);
  });

  it('sold out is shown to citizens, not hidden — the row stays on the page', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    await svc.patchMenuItem(OWNER, 'L1', menu[0].id, { available: false });
    const page = await svc.menu('L1', SEEKER);
    expect(page.count).toBe(1);
    expect(page.sections[0].items[0].available).toBe(false);
  });

  it('the one-tap edit is the owner\u2019s alone', async () => {
    const { svc, menu } = harness();
    await svc.saveMenu(OWNER, 'L1', { items: [{ name: 'Idli', priceInr: 40 }] });
    await expect(svc.patchMenuItem(SEEKER, 'L1', menu[0].id, { available: false })).rejects.toBeTruthy();
  });
});

describe('asking about items is a message, not an order', () => {
  const withMenu = async () => {
    const h = harness();
    await h.svc.saveMenu(OWNER, 'L1', [
      { name: 'Idli', priceInr: 40 },
      { name: 'Special', priceInr: null },
    ].length ? { items: [{ name: 'Idli', priceInr: 40 }, { name: 'Special', priceInr: null }] } : { items: [] });
    return h;
  };

  it('writes the picked lines into the thread and says what it is', async () => {
    const { svc, menu, messages } = await withMenu();
    await svc.sendMenuItems(SEEKER, 'L1', [menu[0].id]);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toContain('Idli');
    // The sentence that stops a shopkeeper acting on an order nobody placed.
    expect(messages[0].body).toContain('a question, not an order');
  });

  it('totals only when every line has a price', async () => {
    const { svc, menu, messages } = await withMenu();
    await svc.sendMenuItems(SEEKER, 'L1', [menu[0].id]);
    expect(messages[0].body).toContain('₹40');

    const second = await withMenu();
    await second.svc.sendMenuItems(SEEKER, 'L1', [second.menu[0].id, second.menu[1].id]);
    // A total that quietly leaves out the unpriced line is a number the citizen
    // will hold the business to, and it is wrong in the direction that argues.
    expect(second.messages[0].body).not.toMatch(/comes to/);
    expect(second.messages[0].body).toContain('no listed price');
  });

  it('opens the thread if there was not one, so asking is never a dead end', async () => {
    const { svc, menu } = await withMenu();
    const out = await svc.sendMenuItems(SEEKER, 'L1', [menu[0].id]);
    expect(out.threadId).toBeTruthy();
  });

  it('refuses items that are no longer on the menu', async () => {
    const { svc } = await withMenu();
    await expect(svc.sendMenuItems(SEEKER, 'L1', ['00000000-0000-4000-8000-000000000000']))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
