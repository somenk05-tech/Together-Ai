/* eslint-disable @typescript-eslint/no-explicit-any */
import { MailService } from './mail.service';

/**
 * ── AN ADDRESS IS CLAIMED HERE, NEVER PROVED (fifth audit, 29 Aug) ─────────
 *
 * `POST /mail/primary` was two assignments and an update. It is the only
 * writer of `User.email` outside `verification-code.service.ts`, and it left
 * `emailVerified`, `emailVerifiedAt`, `phoneVerifiedAt` and `phoneE164`
 * exactly as it found them. Three consequences, none of which needed anything
 * but this one route:
 *
 *  · THE VERIFIED BADGE MOVED WITH NO PROOF. `verified.guard.ts` grants on
 *    `user.emailVerified` alone and is what gates the Dating hub — so a
 *    citizen verified at signup could point their primary at any address in
 *    the world and keep the badge on it. `writePendingTarget` two files away
 *    does the opposite and writes down why: "Anything else would leave a
 *    verified flag attached to an address the account no longer claims."
 *  · A STRANGER'S ADDRESS COULD BE SQUATTED. Recovery resolves by
 *    `findFirst({ where: { email } })`, and registration's uniqueness check
 *    was bypassed here.
 *  · AND A COLLISION WAS A 500 — the partial unique index, raw, out of Prisma.
 */
function build(users: any[]) {
  const prisma: any = {
    user: {
      findFirst: async ({ where }: any) => users.find((u) =>
        (!where.email || u.email === where.email)
        && (where.emailVerified === undefined || u.emailVerified === where.emailVerified)
        && (!where.NOT?.id || u.id !== where.NOT.id)) ?? null,
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
    },
    // account() reads a great deal that this test does not care about; it is
    // stubbed to the shape setPrimary returns through.
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app', quotaBytes: 1 }), upsert: async () => ({ userId: 'u1', address: 'somen@togethercity.app', quotaBytes: 1 }) },
    mailMessage: { count: async () => 0, aggregate: async () => ({ _sum: { sizeBytes: 0 } }), findMany: async () => [] },
    emailDelivery: { count: async () => 0 },
  };
  const svc: any = new MailService(prisma, {} as never);
  return { svc, users };
}

const me = () => ({ id: 'u1', email: 'old@example.com', emailVerified: true, emailVerifiedAt: new Date(), phone: null, phoneE164: null, phoneVerifiedAt: null });

describe('setting a primary address does not award the badge', () => {
  it('drops the verified stamp when the address changes', async () => {
    const { svc, users } = build([me()]);
    await svc.setPrimary('u1', { email: 'new@example.com' });
    expect(users[0]).toMatchObject({ email: 'new@example.com', emailVerified: false, emailVerifiedAt: null });
  });

  it('lowercases it, because every reader of that column compares lowercased', async () => {
    // Registration, recovery and the partial unique index all do.
    const { svc, users } = build([me()]);
    await svc.setPrimary('u1', { email: '  New.Person@Example.COM ' });
    expect(users[0].email).toBe('new.person@example.com');
  });

  it('refuses an address somebody else has PROVED', async () => {
    const { svc } = build([me(), { id: 'u2', email: 'taken@example.com', emailVerified: true }]);
    await expect(svc.setPrimary('u1', { email: 'taken@example.com' }))
      .rejects.toThrow(/already belongs to a verified account/);
  });

  it('but not one somebody else has merely typed', async () => {
    // Two people may claim the same address; only one of them can ever prove
    // it, and the verification flow is where that is decided.
    const { svc, users } = build([me(), { id: 'u2', email: 'shared@example.com', emailVerified: false }]);
    await svc.setPrimary('u1', { email: 'shared@example.com' });
    expect(users[0].email).toBe('shared@example.com');
  });

  it('can clear it, which the old `|| undefined` made a silent no-op', async () => {
    const { svc, users } = build([me()]);
    await svc.setPrimary('u1', { email: '' });
    expect(users[0].email).toBeNull();
  });
});

describe('and a phone number reaches the column that is compared', () => {
  it('writes phoneE164, not only the legacy column', async () => {
    // The schema calls phoneE164 "the one to compare against"; this method
    // wrote `phone` alone, so a number added here was invisible to everything
    // that matches on it.
    const { svc, users } = build([me()]);
    await svc.setPrimary('u1', { phone: '+91 98765 43210' });
    expect(users[0].phoneE164).toBe('+919876543210');
    expect(users[0].phoneVerifiedAt).toBeNull();
  });

  it('refuses a number that is not a number, rather than storing the typing', async () => {
    const { svc } = build([me()]);
    await expect(svc.setPrimary('u1', { phone: '12' })).rejects.toThrow();
  });

  it('and clearing it clears both columns and the stamp', async () => {
    const { svc, users } = build([{ ...me(), phone: '+919876543210', phoneE164: '+919876543210', phoneVerifiedAt: new Date() }]);
    await svc.setPrimary('u1', { phone: '' });
    expect(users[0]).toMatchObject({ phone: null, phoneE164: null, phoneVerifiedAt: null });
  });
});
