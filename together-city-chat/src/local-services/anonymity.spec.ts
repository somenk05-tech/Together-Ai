import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';
import { mintAlias, ALIAS_WORD } from './alias';

/**
 * THE ONE PROMISE THIS HUB MAKES.
 *
 * A citizen browsing local businesses can message one without telling it who
 * they are. That is the owner's rule, and it is the kind of rule that does not
 * break loudly — it breaks the day somebody adds `include: { seeker: true }` to
 * a query for a perfectly good reason, and a plumber sees a real name.
 *
 * So the test is not "does the current code hide the name". It is: does any
 * object that reaches the business side contain ANYTHING that identifies the
 * person — an id, a handle, a name, a city, a join date, a message row with a
 * sender on it. The assertions walk the whole returned object rather than
 * checking known fields, because the failure mode is a field nobody thought of.
 *
 * The second rule is that these threads live in this hub and nowhere else. They
 * are their own tables for exactly that reason; a spec that only checked the
 * shape would pass just as well if somebody quietly started writing them into
 * Conversation too, so the notification hrefs are checked as well — a link into
 * /chats is the first symptom of that drift.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const SEEKER = 'user-seeker-1';
const OWNER = 'user-owner-1';

function harness(opts: { listings?: any[]; enquiries?: any[]; messages?: any[] } = {}) {
  const listings = opts.listings ?? [{
    id: 'L1', ownerId: OWNER, businessName: 'Sharma Plumbing', categoryKey: 'plumber',
    about: 'Taps, leaks, geysers', city: 'Mumbai', areas: 'Bandra, Khar',
    phone: '+919999999999', priceFrom: 300, photosJson: '[]', moderation: 'approved',
    createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-01T00:00:00Z'),
  }];
  const enquiries = opts.enquiries ?? [];
  const messages = opts.messages ?? [];
  const notes: any[] = [];
  let seq = 0;

  const match = (where: any, r: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'listingId_seekerId') {
        const c = v as any;
        if (r.listingId !== c.listingId || r.seekerId !== c.seekerId) return false;
        continue;
      }
      if (k === 'OR') continue;
      if (v && typeof v === 'object' && 'in' in (v as any)) {
        if (!(v as any).in.includes(r[k])) return false;
      } else if (v && typeof v === 'object' && 'not' in (v as any)) {
        if (r[k] === (v as any).not) return false;
      } else if (r[k] !== v) return false;
    }
    return true;
  };

  const prisma: any = {
    serviceListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      findMany: async ({ where }: any) => listings.filter((l) => match(where, l)),
      count: async ({ where }: any) => listings.filter((l) => match(where, l)).length,
      create: async ({ data }: any) => { const r = { id: `L${++seq}`, photosJson: '[]', moderation: 'approved', createdAt: new Date(), updatedAt: new Date(), ...data }; listings.push(r); return r; },
      update: async ({ where, data }: any) => { const r = listings.find((l) => l.id === where.id); Object.assign(r, data); return r; },
      groupBy: async () => [],
    },
    serviceEnquiry: {
      findUnique: async ({ where }: any) => enquiries.find((e) => match(where, e)) ?? null,
      findMany: async ({ where }: any) => enquiries.filter((e) => match(where, e)),
      count: async ({ where }: any) => enquiries.filter((e) => match(where, e)).length,
      create: async ({ data }: any) => {
        const r = { id: `E${++seq}`, lastMessageAt: new Date('2026-08-05T10:00:00Z'), seekerUnread: 0, ownerUnread: 0, closed: false, createdAt: new Date('2026-08-05T10:00:00Z'), ...data };
        enquiries.push(r); return r;
      },
      update: async ({ where, data }: any) => {
        const r = enquiries.find((e) => e.id === where.id);
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as any)) r[k] += (v as any).increment;
          else r[k] = v;
        }
        return r;
      },
    },
    // browse() now reads a rating per card. The harness has to answer, or a
    // spec about anonymity fails for a reason that has nothing to do with it.
    serviceReview: {
      groupBy: async () => [],
      findMany: async () => [],
      findUnique: async () => null,
      count: async () => 0,
    },
    serviceMessage: {
      findMany: async ({ where }: any) => messages.filter((m) => m.enquiryId === where.enquiryId),
      create: async ({ data }: any) => { const r = { id: `M${++seq}`, createdAt: new Date('2026-08-05T10:05:00Z'), ...data }; messages.push(r); return r; },
    },
  };
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async (n: any) => { notes.push(n); } };
  return { svc, listings, enquiries, messages, notes };
}

/** Every string anywhere in a returned object, however deep. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out); }
  }
  return out;
}

describe('the person asking stays anonymous', () => {
  it('gives the business an alias and no identity of any kind', async () => {
    const { svc } = harness();
    await svc.enquire(SEEKER, 'L1', 'Do you fix geysers?');
    const inbox = await svc.inbox(OWNER);

    expect(inbox.receiving).toHaveLength(1);
    const seen = inbox.receiving[0];
    expect(seen.alias).toBe(`${ALIAS_WORD} 1`);

    // Not "the name is absent" — nothing that IS the person is anywhere in here.
    expect(allStrings(seen)).not.toContain(SEEKER);
    expect(allKeys(seen)).not.toContain('seekerId');
    expect(allKeys(seen)).not.toContain('seeker');
    expect(allKeys(seen)).not.toContain('user');
    expect(allKeys(seen)).not.toContain('handle');
  });

  it('and the message rows the business reads carry a side, not a sender', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'Do you fix geysers?');
    const room = await svc.messages(OWNER, enquiries[0].id);

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0].mine).toBe(false); // written by the other side
    expect(allKeys(room.messages[0])).not.toContain('senderSide');
    expect(allKeys(room.messages[0])).not.toContain('senderId');
    expect(allStrings(room)).not.toContain(SEEKER);
  });

  it('names the business to the seeker — a directory that hides both sides is not a directory', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    const room = await svc.messages(SEEKER, enquiries[0].id);
    expect(room.business.businessName).toBe('Sharma Plumbing');
  });

  it('never puts the business phone number in a public card', async () => {
    const { svc } = harness();
    const page = await svc.browse({});
    expect(allKeys(page.items[0])).not.toContain('phone');
    expect(allStrings(page)).not.toContain('+919999999999');
    // The owner does get it back — it is their own number.
    expect((await svc.mine(OWNER))[0].phone).toBe('+919999999999');
  });

  it('numbers aliases per business, so two businesses cannot compare notes', () => {
    // A hash of the user id would be stable across every business they contact.
    // A count of that listing's own threads is meaningless anywhere else.
    expect(mintAlias(0)).toBe(`${ALIAS_WORD} 1`);
    expect(mintAlias(7)).toBe(`${ALIAS_WORD} 8`);
  });
});

describe('the thread belongs to this hub and stays in it', () => {
  it('links notifications into /services, never into /chats', async () => {
    const { svc, notes, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    await svc.post(OWNER, enquiries[0].id, 'yes we do');
    expect(notes).toHaveLength(2);
    for (const n of notes) {
      expect(n.href).toMatch(/^\/services\//);
      expect(n.href).not.toMatch(/\/chats/);
    }
    // And the one that went to the business does not name the person.
    expect(notes[0].title).toContain(ALIAS_WORD);
    expect(allStrings(notes[0])).not.toContain(SEEKER);
  });

  it('writes nothing to the chat hub tables', async () => {
    const { svc } = harness();
    // The harness has no `conversation` or `message` client at all. If the
    // service ever reaches for one, this call throws rather than silently
    // starting to co-write the chat hub.
    await expect(svc.enquire(SEEKER, 'L1', 'hello')).resolves.toBeDefined();
  });
});

describe('one thread per person per business', () => {
  it('returns to the same room instead of minting a second alias', async () => {
    const { svc, enquiries } = harness();
    const a = await svc.enquire(SEEKER, 'L1', 'first');
    const b = await svc.enquire(SEEKER, 'L1', 'second');
    expect(enquiries).toHaveLength(1);
    expect(b.id).toBe(a.id);
    expect(b.alias).toBe(a.alias);
  });

  it('refuses a business messaging itself', async () => {
    const { svc } = harness();
    await expect(svc.enquire(OWNER, 'L1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats a thread you are not in as one that does not exist', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    // 404 and not 403 — a 403 confirms the id was real.
    await expect(svc.messages('someone-else', enquiries[0].id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('closing a business does not close the conversations in it', () => {
  it('removes the listing from the directory but leaves the thread readable', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    await svc.close(OWNER, 'L1');

    expect((await svc.browse({})).items).toHaveLength(0);
    await expect(svc.detail('L1')).rejects.toBeInstanceOf(NotFoundException);
    // Somebody mid-conversation about a job keeps the conversation.
    await expect(svc.messages(SEEKER, enquiries[0].id)).resolves.toBeDefined();
  });
});

/**
 * A NUMBER GIVEN UNDER ONE PROMISE, PUBLISHED ONLY UNDER ANOTHER.
 *
 * The listing form said, in as many words, "Only you ever see this. It is not
 * shown on your listing." Then citizens asked to be able to ring a shop. Both
 * are reasonable and they cannot both be true of the same stored value, so the
 * owner decides per listing — and the default is off, because the alternative
 * is publishing a phone number on the strength of a promise the application
 * made and then quietly withdrew.
 *
 * The field is ABSENT from a public card rather than blanked. A present-but-
 * empty field invites the next person to fill it in.
 */
describe('a business phone is published only when its owner published it', () => {
  const row = (phonePublic: boolean) => ({
    id: 'L9', ownerId: 'u1', businessName: 'Anna Idli', categoryKey: 'restaurants',
    about: null, city: 'Chennai', areas: '', phone: '+919000000000', priceFrom: null,
    photosJson: '[]', lat: null, lng: null, radiusKm: null, phonePublic,
    moderation: 'approved', createdAt: new Date(), updatedAt: new Date(),
  });
  // The private method is the one every public shape is built from, so it is
  // the right place to hold the line.
  const cardOf = (r: unknown) =>
    (LocalServicesService.prototype as unknown as { card(l: unknown): Record<string, unknown> }).card(r);

  it('withholds it by default, and withholds the key as well as the value', () => {
    const c = cardOf(row(false));
    expect('phone' in c).toBe(false);
  });

  it('publishes it once, and only once, the owner has said so', () => {
    expect(cardOf(row(true)).phone).toBe('+919000000000');
  });

  it('publishes nothing when there is nothing to publish, whatever the flag says', () => {
    const c = cardOf({ ...row(true), phone: null });
    expect('phone' in c).toBe(false);
  });
});
