import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';
import { customerLabel, mintAlias } from './alias';

/**
 * THE ONE PROMISE THIS HUB MAKES — and the one door in it, added 16 Aug.
 *
 * A citizen browsing local businesses can message one without telling it who
 * they are. That is still the default and still the rule; what changed is that
 * the CITIZEN may open it, per business, and the business sees a customer
 * number until they do. So the promise is now two claims and both are tested
 * here: nothing identifying reaches the business side by default, and the only
 * thing that can change that is the asker's own switch.
 *
 * It is the kind of rule that does not break loudly — it breaks the day
 * somebody adds `include: { seeker: true }` to a query for a perfectly good
 * reason, and a plumber sees a real name.
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
const NAMES: Record<string, string> = { [SEEKER]: 'Priya Nair' };

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
  const userQueries: any[] = [];
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
        // `revealName: false` is the COLUMN's default, and the harness carries it
        // for the same reason it carries `closed: false` — a fake that omits a
        // default tests a row shape the database will never produce.
        const r = { id: `E${++seq}`, lastMessageAt: new Date('2026-08-05T10:00:00Z'), seekerUnread: 0, ownerUnread: 0, closed: false, revealName: false, createdAt: new Date('2026-08-05T10:00:00Z'), ...data };
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
    // The only place a citizen's name can be read from — and the spec below
    // asserts it is asked for ONLY when that citizen opened the door.
    user: {
      findMany: async ({ where, select }: any) => {
        userQueries.push({ ids: where?.id?.in ?? [], select });
        return (where?.id?.in ?? []).map((id: string) => ({ id, name: NAMES[id] ?? 'Someone' }));
      },
    },
    serviceMessage: {
      findMany: async ({ where }: any) => messages.filter((m) => m.enquiryId === where.enquiryId),
      create: async ({ data }: any) => { const r = { id: `M${++seq}`, createdAt: new Date('2026-08-05T10:05:00Z'), ...data }; messages.push(r); return r; },
    },
  };
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async (n: any) => { notes.push(n); } };
  /* THE GATE, STUBBED OPEN. These tests are about who the business can see,
     not about how many new neighbours a day it is given, and the real rule has
     its own two suites (trust.spec.ts, trust-gate.spec.ts, verification.spec.ts).
     "Never hold, release nothing, no badge" is the behaviour of a verified
     listing, which is what every fixture here is standing in for. */
  svc.verification = {
    holdsNewThread: async () => false,
    releaseFor: async () => 0,
    badgeFor: async () => null,
  };
  return { svc, listings, enquiries, messages, notes, userQueries };
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

describe('the person asking stays anonymous until they say otherwise', () => {
  it('gives the business a customer number and no identity of any kind', async () => {
    const { svc, userQueries } = harness();
    await svc.enquire(SEEKER, 'L1', 'Do you fix geysers?');
    const inbox = await svc.inbox(OWNER);

    expect(inbox.receiving).toHaveLength(1);
    const seen = inbox.receiving[0];
    expect(seen.alias).toBe('#1');
    // The name is ABSENT, not null — a present-but-empty field invites the
    // next person to fill it in.
    expect('name' in seen).toBe(false);
    expect(seen.revealName).toBe(false);
    // And the citizen's row was never asked for. An anonymous thread's
    // seekerId does not reach the user table at all, so there is nothing
    // sitting in scope to leak by accident later.
    expect(userQueries).toHaveLength(0);

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
    expect(mintAlias(0)).toBe('#1');
    expect(mintAlias(7)).toBe('#8');
  });

  it('prints a thread minted under the old word as the same number', () => {
    // "Neighbour 3" rows are not rewritten — a review's signature is the one it
    // was posted under. The number is read out at the edge instead.
    expect(customerLabel('Neighbour 3')).toBe('#3');
    expect(customerLabel('#3')).toBe('#3');
  });
});

/**
 * THE DOOR, AND WHO HOLDS THE HANDLE.
 *
 * Owner, 16 Aug: businesses should be able to see who is asking, and the asker
 * decides. Everything below is about the second half of that sentence — the
 * decision belongs to one side of the thread, it is off until taken, and it is
 * reversible.
 */
describe('a name is the asker\'s to give', () => {
  it('stays a number until the asker opens the door', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    expect(enquiries[0].revealName).toBe(false); // the default, and the migration's default

    const before = await svc.inbox(OWNER);
    expect('name' in before.receiving[0]).toBe(false);

    await svc.setReveal(SEEKER, enquiries[0].id, true);
    const after = await svc.inbox(OWNER);
    expect(after.receiving[0].name).toBe('Priya Nair');
    expect(after.receiving[0].alias).toBe('#1'); // the number stays beside it
  });

  it('gives the business the NAME and nothing else — no id, no handle, no photo', async () => {
    const { svc, enquiries, userQueries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    await svc.setReveal(SEEKER, enquiries[0].id, true);
    const seen = (await svc.inbox(OWNER)).receiving[0];

    expect(allStrings(seen)).not.toContain(SEEKER);
    for (const k of ['seekerId', 'seeker', 'user', 'handle', 'profileImage', 'email', 'phone', 'city']) {
      expect(allKeys(seen)).not.toContain(k);
    }
    // Even the read that fetched the name asked for one column.
    expect(userQueries[0].select).toEqual({ id: true, name: true });
  });

  it('is the asker\'s switch and not the business\'s', async () => {
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    // 404 rather than 403: from the owner's side, for this purpose, the thread
    // does not exist — and a 403 would confirm that it does.
    await expect(svc.setReveal(OWNER, enquiries[0].id, true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.setReveal('a-stranger', enquiries[0].id, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(enquiries[0].revealName).toBe(false);
  });

  it('takes the name back down again', async () => {
    // A name shown cannot be unseen; a name shown to somebody unpleasant should
    // still stop being on their screen.
    const { svc, enquiries } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');
    await svc.setReveal(SEEKER, enquiries[0].id, true);
    await svc.setReveal(SEEKER, enquiries[0].id, false);
    const seen = (await svc.inbox(OWNER)).receiving[0];
    expect('name' in seen).toBe(false);
    expect(seen.alias).toBe('#1');
  });

  it('keeps the alert in step with the inbox, in both directions', async () => {
    const { svc, enquiries, notes } = harness();
    await svc.enquire(SEEKER, 'L1', 'hello');            // note 0 — anonymous
    await svc.setReveal(SEEKER, enquiries[0].id, true);
    await svc.post(SEEKER, enquiries[0].id, 'still there?'); // note 1 — named

    expect(notes[0].title).toContain('#1');
    expect(allStrings(notes[0])).not.toContain('Priya Nair');
    expect(notes[1].title).toContain('Priya Nair');
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
    expect(notes[0].title).toContain('#1');
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
