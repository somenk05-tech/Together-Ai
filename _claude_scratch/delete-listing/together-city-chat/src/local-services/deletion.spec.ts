import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';

/**
 * DELETING A LISTING FOR GOOD.
 *
 * Two rules are worth a test and the cascade is the database's job. That the
 * irreversible act cannot be reached in one press from a live shopfront, and
 * that the people whose conversations are about to end are told before the rows
 * go — because "conversations already open stay open" is printed on the card
 * beside the close button, and this is the one operation that unprints it.
 */

const OWNER = 'U-owner';
const SEEKER_A = 'U-a';
const SEEKER_B = 'U-b';

function harness(moderation = 'removed', seekers: string[] = [SEEKER_A, SEEKER_B, SEEKER_A]) {
  const listing = { id: 'L1', ownerId: OWNER, businessName: 'Hair Salon', moderation };
  const notes: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];

  const prisma = {
    serviceListing: {
      findUnique: async ({ where }: any) =>
        (where.id === listing.id && !deleted.includes(listing.id) ? { ...listing } : null),
      delete: async ({ where }: any) => { deleted.push(where.id); return { ...listing }; },
    },
    serviceEnquiry: {
      findMany: async () => seekers.map((seekerId) => ({ seekerId })),
    },
  };

  // Same shape as every other harness in this folder: the class is built
  // without its constructor and handed only the collaborators these paths use.
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async (n: any) => { notes.push(n); } };

  return { svc, notes, deleted, listing };
}

describe('deleting a listing', () => {
  it('refuses while the listing is still live', async () => {
    // The whole safety of this feature: closing first is one extra press, and
    // it is the press that makes an irreversible decision a deliberate one.
    const h = harness('approved');
    await expect(h.svc.deleteForever(OWNER, 'L1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.svc.deleteForever(OWNER, 'L1')).rejects.toThrow(/Close the listing first/);
    expect(h.deleted).toEqual([]);
  });

  it('refuses somebody else’s listing, closed or not', async () => {
    const h = harness('removed');
    await expect(h.svc.deleteForever('U-stranger', 'L1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.deleted).toEqual([]);
  });

  it('deletes a closed listing', async () => {
    const h = harness('removed');
    await expect(h.svc.deleteForever(OWNER, 'L1')).resolves.toEqual({ ok: true, id: 'L1' });
    expect(h.deleted).toEqual(['L1']);
  });

  it('tells every neighbour once, before the rows go', async () => {
    const h = harness('removed', [SEEKER_A, SEEKER_B, SEEKER_A]);
    await h.svc.deleteForever(OWNER, 'L1');
    // Three threads, two people, two messages. Somebody with two rooms open
    // does not get told twice that the same shop has gone.
    expect(h.notes.map((n) => n.userId).sort()).toEqual([SEEKER_A, SEEKER_B]);
    expect(h.notes[0].title).toContain('Hair Salon');
  });

  it('never puts one neighbour in another neighbour’s message', async () => {
    // The hub's whole promise. A "your conversation has closed" notice that
    // named who else was in the room would be the leak arriving by push.
    const h = harness('removed');
    await h.svc.deleteForever(OWNER, 'L1');
    for (const n of h.notes) {
      const text = `${n.title} ${n.body}`;
      expect(text).not.toContain(SEEKER_A);
      expect(text).not.toContain(SEEKER_B);
      expect(text).not.toContain(OWNER);
      expect(text).not.toMatch(/Neighbour \d|#\d/);
    }
  });

  it('says nothing to anybody when there were no conversations', async () => {
    const h = harness('removed', []);
    await h.svc.deleteForever(OWNER, 'L1');
    expect(h.notes).toEqual([]);
    expect(h.deleted).toEqual(['L1']);
  });
});
