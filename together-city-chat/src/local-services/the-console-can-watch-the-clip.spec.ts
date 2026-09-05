/* eslint-disable @typescript-eslint/no-explicit-any */
import { VerificationService } from './verification.service';

/**
 * ── THE CONSOLE CAN WATCH THE CLIP (launch gate, third reading, 4 Sep,
 *    blocker 4) ───────────────────────────────────────────────────────────
 *
 * On 2 Sep the verification video moved out of the public bucket into the
 * vault under `kyc/<ownerId>/`, and `videoUrl` became a key. The queue kept
 * returning the column verbatim, so the reviewer was handed a string nothing
 * can open — and the rung that exists because "a person looked" had nothing
 * for the person to look at. Businesses sat in `submitted` for good.
 *
 * The queue signs each key for ten minutes on the read. A key that cannot be
 * signed comes back null, never as the bare key: a string shaped like a link
 * that is not one is the defect this file exists to keep out.
 */

function serviceWith(rows: any[], storage?: { signKycVideo: (k: string) => Promise<string | null> }) {
  const prisma = {
    serviceVerification: { findMany: async () => rows },
    serviceListing: { findMany: async () => rows.map((r) => ({ id: r.listingId, businessName: 'Ravi Repairs', categoryKey: 'repairs', city: 'Mumbai', businessType: 'sole' })) },
  };
  return new VerificationService(prisma as never, { create: async () => undefined } as never, storage as never);
}

const row = (o: any) => ({
  id: 'v1', listingId: 'L1', entityKind: 'sole', docKind: 'udyam', docRef: 'UDYAM-MH-01', docUrl: null,
  docStatus: 'submitted', submittedAt: new Date('2026-09-01T00:00:00Z'),
  videoUrl: null, videoStatus: 'none', videoSubmittedAt: null, ...o,
});

describe('the console can watch the clip', () => {
  it('a kyc key in the queue comes back as a signed, short-lived link', async () => {
    const signed: string[] = [];
    const svc = serviceWith(
      [row({ videoUrl: 'kyc/U1/clip.mp4', videoStatus: 'submitted', videoSubmittedAt: new Date('2026-09-02T00:00:00Z') })],
      { signKycVideo: async (k) => { signed.push(k); return `https://vault.example/${k}?sig=abc`; } },
    );
    const { items } = await svc.queue();
    expect(signed).toEqual(['kyc/U1/clip.mp4']);
    expect(items[0].videoUrl).toBe('https://vault.example/kyc/U1/clip.mp4?sig=abc');
    expect(items[0].videoStatus).toBe('submitted');
  });

  it('a key that cannot be signed is null, never the bare key', async () => {
    const svc = serviceWith(
      [row({ videoUrl: 'kyc/U1/clip.mp4', videoStatus: 'submitted' })],
      { signKycVideo: async () => null },
    );
    const { items } = await svc.queue();
    expect(items[0].videoUrl).toBeNull();
  });

  it('with no storage wired the queue still answers, with no link', async () => {
    const svc = serviceWith([row({ videoUrl: 'kyc/U1/clip.mp4', videoStatus: 'submitted' })]);
    const { items } = await svc.queue();
    expect(items).toHaveLength(1);
    expect(items[0].videoUrl).toBeNull();
    expect(items[0].docRef).toBe('UDYAM-MH-01');
  });

  it('a row with no video signs nothing', async () => {
    const signed: string[] = [];
    const svc = serviceWith([row({})], { signKycVideo: async (k) => { signed.push(k); return 'x'; } });
    const { items } = await svc.queue();
    expect(signed).toEqual([]);
    expect(items[0].videoUrl).toBeNull();
  });
});
