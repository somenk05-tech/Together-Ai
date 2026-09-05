/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { LocalServicesService } from '../local-services/local-services.service';
import { JobsService } from '../jobs/jobs.service';
import { DriveService } from '../drive/drive.service';
import { PostMediaGuard } from '../social/post-media-guard';

/**
 * ── A PICTURE THE CITY SEES IS SCREENED (launch gate, third reading, 5 Sep) ─
 *
 * Three doors wrote a picture to a row with nothing looking at it: a listing's
 * photographs and logo, a job profile's photo — both `z.string().url()`, any
 * address on the internet — and the drive, which charged the quota with the
 * size the client declared rather than the size the bucket holds. And the
 * public presign refused a declared size over 50 MB, then signed a PUT that
 * took any size at all.
 */

function guard(verdict: { ok: boolean; retryable?: boolean }, key = 'uploads/u1/x.jpg') {
  const g: any = Object.create(PostMediaGuard.prototype);
  g.storage = { keyFromUrl: (u: string) => (u.startsWith('https://media.togethercity.app/') ? key : '') };
  g.screenOne = async () => (verdict.ok ? { ok: true } : { ok: false, retryable: !!verdict.retryable, reason: 'no' });
  return g as PostMediaGuard;
}

describe('screenPublicUrl', () => {
  it('a link to another site is refused before any byte is read', async () => {
    const g: any = guard({ ok: true });
    let read = 0; g.screenOne = async () => { read += 1; return { ok: true }; };
    const out = await g.screenPublicUrl('u1', 'https://elsewhere.example/pic.jpg', 'listing photo', 'so it was not saved');
    expect(out.ok).toBe(false);
    expect(read).toBe(0);
  });
  it('a URL under our public base resolves to its key and is screened on the public shelf', async () => {
    const g: any = guard({ ok: true });
    const seen: unknown[] = []; g.screenOne = async (...a: unknown[]) => { seen.push(a); return { ok: true }; };
    await g.screenPublicUrl('u1', 'https://media.togethercity.app/uploads/u1/x.jpg', 'listing photo', 'c');
    expect(seen[0]).toEqual(['uploads/u1/x.jpg', 'u1', { noun: 'listing photo', consequence: 'c', appMade: false }, 'public']);
  });
});

function listings(screening: PostMediaGuard | undefined, existing?: Record<string, unknown>) {
  const created: unknown[] = [];
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = {
    serviceListing: {
      count: async () => 0,
      create: async ({ data }: any) => { created.push(data); return { id: 'l1', ...data, photosJson: data.photosJson, createdAt: new Date() }; },
      findUnique: async () => existing ?? null,
      update: async ({ data }: any) => ({ id: 'l1', ...existing, ...data }),
    },
  };
  svc.screening = screening;
  svc.slugForNew = async () => 'slug';
  svc.ownerCard = (r: unknown) => r;
  return { svc, created };
}
const OURS = 'https://media.togethercity.app/uploads/u1/a.jpg';

describe('a listing’s pictures', () => {
  it('a refused photo refuses the listing', async () => {
    const { svc, created } = listings(guard({ ok: false }));
    await expect(svc.create('u1', { businessName: 'B', categoryKey: 'salon', city: 'Pune', photoUrls: [OURS] }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(created).toEqual([]);
  });
  it('an outage refuses with 503 so the owner tries again', async () => {
    const { svc } = listings(guard({ ok: false, retryable: true }));
    await expect(svc.create('u1', { businessName: 'B', categoryKey: 'salon', city: 'Pune', logoUrl: OURS }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('no guard wired is an outage, not a pass', async () => {
    const { svc } = listings(undefined);
    await expect(svc.create('u1', { businessName: 'B', categoryKey: 'salon', city: 'Pune', photoUrls: [OURS] }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('a listing with no pictures needs no guard', async () => {
    const { svc, created } = listings(undefined);
    await svc.create('u1', { businessName: 'B', categoryKey: 'salon', city: 'Pune' });
    expect(created).toHaveLength(1);
  });
  it('an edit screens only the pictures the row does not already carry', async () => {
    const g: any = guard({ ok: true });
    const asked: string[] = [];
    g.screenPublicUrl = async (_u: string, url: string) => { asked.push(url); return { ok: true }; };
    const { svc } = listings(g, { id: 'l1', ownerId: 'u1', photosJson: JSON.stringify([{ url: OURS }]), logoUrl: null });
    await svc.update('u1', 'l1', { photoUrls: [OURS, 'https://media.togethercity.app/uploads/u1/b.jpg'] });
    expect(asked).toEqual(['https://media.togethercity.app/uploads/u1/b.jpg']);
  });
});

describe('a job profile’s photo', () => {
  function jobs(screening?: PostMediaGuard, existing: Record<string, unknown> | null = null) {
    const svc: any = Object.create(JobsService.prototype);
    svc.prisma = { jobProfile: { findUnique: async () => existing } };
    svc.screening = screening;
    svc.persistProfile = async () => undefined;
    svc.getProfile = async () => ({ ok: true });
    return svc;
  }
  const dto = { headline: 'h', skills: [], experienceYears: 3, photoUrl: OURS };
  it('a refused photo refuses the save', async () => {
    await expect(jobs(guard({ ok: false })).saveProfile('u1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('the photo already on the row is not screened again', async () => {
    await expect(jobs(undefined, { photoUrl: OURS }).saveProfile('u1', dto)).resolves.toEqual({ ok: true });
  });
  it('a passing photo saves', async () => {
    await expect(jobs(guard({ ok: true })).saveProfile('u1', dto)).resolves.toEqual({ ok: true });
  });
});

describe('the drive charges the size the bucket holds', () => {
  function drive(actual: number | null, used = 0) {
    const svc: any = Object.create(DriveService.prototype);
    svc.logger = { warn: () => undefined };
    const rows: unknown[] = []; const removed: string[] = [];
    svc.prisma = {
      driveFolder: { findFirst: async () => null },
      driveFile: { create: async ({ data }: any) => { rows.push(data); return { id: 'f1', ...data, createdAt: new Date(), updatedAt: new Date() }; }, aggregate: async () => ({ _sum: { sizeBytes: used } }) },
      mailMessage: { findMany: async () => [] },
      medicalRecord: { findMany: async () => [] },
    };
    svc.storage = { healthObjectSize: async () => actual, deleteHealthObject: async (k: string) => { removed.push(k); return true; } };
    svc.shapeFile = (r: unknown) => r;
    return { svc, rows, removed };
  }
  const input = { storageKey: 'drive/u1/x.bin', name: 'x.bin', sizeBytes: 1_000 };
  it('the row carries the bucket’s size, not the declared one', async () => {
    const { svc, rows } = drive(5_000_000);
    await svc.confirm('u1', input);
    expect((rows[0] as { sizeBytes: number }).sizeBytes).toBe(5_000_000);
  });
  it('an object over the quota is deleted and refused, whatever was declared', async () => {
    const { svc, rows, removed } = drive(2_000, 10 * 1024 * 1024 * 1024 - 1_000);
    await expect(svc.confirm('u1', input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(removed).toEqual(['drive/u1/x.bin']);
    expect(rows).toEqual([]);
  });
  it('an object that cannot be sized is an unfinished upload', async () => {
    const { svc } = drive(null);
    await expect(svc.confirm('u1', input)).rejects.toBeInstanceOf(BadRequestException);
  });
});
