/**
 * A CV IS NOT A PUBLIC FILE — and neither is a verification video.
 *
 * Launch blocker 3 (audits of 1 and 2 Sep). `mediaApi.upload` put both into
 * the PUBLIC bucket: a permanent, unauthenticated address for somebody's
 * career history, and for a clip of a business owner saying their own name in
 * their own shop. The row could be deleted; the object stayed reachable by
 * anyone who had ever seen the string.
 *
 * Both are vault keys now, each under a prefix that names its owner, and this
 * file holds the five things that make that true rather than decorative:
 *
 *   1. the DTOs take a KEY of the right shape and refuse a URL;
 *   2. the services refuse a key minted for somebody else;
 *   3. the CV comes back only as a signed link to its owner, and never for a
 *      key that is not theirs;
 *   4. deleting a CV deletes from the vault when the column holds a key, and
 *      from the public bucket when it still holds a pre-2 Sep URL;
 *   5. the purge and the storage registry both know the column's new shape,
 *      AND its old one, because both are in the table until the migration
 *      has run.
 */
import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JobsService } from './jobs.service';
import { UploadResumeSchema, ResumePresignSchema } from './dto/jobs.dto';
import { SubmitVideoSchema, SubmitVerificationSchema } from '../local-services/dto/verification.dto';
import { VerificationService } from '../local-services/verification.service';
import { StorageProvider } from '../media/storage.provider';
import { deletions } from '../privacy/purge-plan';

const OWN = 'cv/u1/8d2e6c1a-1b2c-4d3e-9f10-abcdef012345.pdf';
const THEIRS = 'cv/u2/8d2e6c1a-1b2c-4d3e-9f10-abcdef012345.pdf';
const PUBLIC = 'https://media.togethercity.tech/uploads/u1/old.pdf';

function jobs(resumeUrl: string | null) {
  const calls: Record<string, unknown[]> = { vault: [], public: [], signed: [], updated: [] };
  const prisma = {
    jobProfile: {
      findUnique: async () => ({ resumeUrl, resumeName: 'Ananya Rao.pdf' }),
      updateMany: async (args: unknown) => { calls.updated.push(args); return { count: 1 }; },
      upsert: async (args: unknown) => { calls.updated.push(args); return { id: 'p1' }; },
    },
    cvEntry: { findMany: async () => [], createMany: async () => ({ count: 0 }) },
  };
  const storage = {
    deletePrivateObject: async (k: string) => { calls.vault.push(k); return true; },
    deleteObject: async (k: string) => { calls.public.push(k); return true; },
    keyFromUrl: (u: string) => (u.startsWith('https://media.togethercity.tech/') ? u.slice('https://media.togethercity.tech/'.length) : ''),
    presignHealthDownload: async (k: string, o: unknown) => { calls.signed.push([k, o]); return `https://vault.example/${k}?sig`; },
    presignResumeUpload: async (u: string, m: string, e: string) => ({ uploadUrl: `put://${u}`, key: `cv/${u}/x.${e}`, expiresInSec: 60, m }),
  };
  const svc = new JobsService(
    prisma as never,
    { get: async () => null, syncShared: async () => undefined } as never,
    { now: () => new Date('2026-09-02T00:00:00Z'), timezoneFor: async () => 'Asia/Kolkata', dayIn: () => '2026-09-02' } as never,
    { readCv: async () => null } as never,
    storage as never,
  );
  return { svc, calls };
}

describe('1 · the door takes a key, not a URL', () => {
  it('a CV upload names a cv/ key', () => {
    expect(UploadResumeSchema.safeParse({ resumeText: 'x', fileKey: OWN }).success).toBe(true);
    expect(UploadResumeSchema.safeParse({ resumeText: 'x', fileKey: PUBLIC }).success).toBe(false);
    expect(UploadResumeSchema.safeParse({ resumeText: 'x', fileKey: 'health/u1/x.pdf' }).success).toBe(false);
    // The field that used to carry the public address is not read any more.
    expect(UploadResumeSchema.parse({ resumeText: 'x', fileUrl: PUBLIC })).not.toHaveProperty('fileUrl');
  });

  it('a verification video names a kyc/ key, and the document URL field is gone', () => {
    expect(SubmitVideoSchema.safeParse({ videoKey: 'kyc/u1/abc.mp4' }).success).toBe(true);
    expect(SubmitVideoSchema.safeParse({ videoKey: 'https://media.togethercity.tech/uploads/u1/clip.mp4' }).success).toBe(false);
    expect(SubmitVideoSchema.safeParse({ videoUrl: 'https://media.togethercity.tech/uploads/u1/clip.mp4' }).success).toBe(false);
    const doc = SubmitVerificationSchema.parse({ entityKind: 'company', docKind: 'gstin', docRef: '27AAAAA0000A1Z5', docUrl: PUBLIC });
    expect(doc).not.toHaveProperty('docUrl');
  });

  it('a CV presign takes only what the reader parses', () => {
    expect(ResumePresignSchema.safeParse({ mimeType: 'application/pdf', sizeBytes: 100 }).success).toBe(true);
    expect(ResumePresignSchema.safeParse({ mimeType: 'text/html', sizeBytes: 100 }).success).toBe(false);
    expect(ResumePresignSchema.safeParse({ mimeType: 'application/pdf', sizeBytes: 20_000_001 }).success).toBe(false);
  });
});

describe('2 · a key minted for somebody else is refused', () => {
  it('the CV', async () => {
    const { svc } = jobs(null);
    await expect(svc.uploadResume('u1', { resumeText: 'Ananya Rao', fileKey: THEIRS })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the video', async () => {
    const prisma = {
      serviceListing: { findUnique: async () => ({ id: 'L1', ownerId: 'U1', businessType: null, createdAt: new Date() }) },
      serviceVerification: { findUnique: async () => null, upsert: async () => ({}) },
    };
    const svc = new VerificationService(prisma as never, { create: async () => undefined } as never);
    await expect(svc.submitVideo('U1', 'L1', 'kyc/U2/clip.mp4')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the prefix helpers agree with the DTO regexes', () => {
    expect(StorageProvider.isOwnResumeKey('u1', OWN)).toBe(true);
    expect(StorageProvider.isOwnResumeKey('u1', THEIRS)).toBe(false);
    expect(StorageProvider.isOwnKycKey('U1', 'kyc/U1/a.mp4')).toBe(true);
    expect(StorageProvider.isOwnKycKey('U1', 'cv/U1/a.mp4')).toBe(false);
    expect(StorageProvider.isCvOrKycKey(PUBLIC)).toBe(false);
  });
});

describe('3 · the CV comes back only as a signed link, to its owner', () => {
  it('signs the owner\'s key as a download', async () => {
    const { svc, calls } = jobs(OWN);
    const out = await svc.resumeLink('u1');
    expect(out.url).toMatch(/\?sig$/);
    expect(calls.signed[0]).toEqual([OWN, { asAttachment: true, filename: 'Ananya Rao.pdf' }]);
  });

  it('signs nothing for a key that is not theirs', async () => {
    const { svc, calls } = jobs(THEIRS);
    expect((await svc.resumeLink('u1')).url).toBeNull();
    expect(calls.signed).toEqual([]);
  });

  it('hands a pre-migration public URL back as it is', async () => {
    const { svc } = jobs(PUBLIC);
    expect((await svc.resumeLink('u1')).url).toBe(PUBLIC);
  });
});

describe('4 · deleting a CV deletes from where it actually is', () => {
  it('the vault, for a key', async () => {
    const { svc, calls } = jobs(OWN);
    await svc.deleteResume('u1');
    expect(calls.vault).toEqual([OWN]);
    expect(calls.public).toEqual([]);
  });

  it('the public bucket, for a URL from before', async () => {
    const { svc, calls } = jobs(PUBLIC);
    await svc.deleteResume('u1');
    expect(calls.public).toEqual(['uploads/u1/old.pdf']);
    expect(calls.vault).toEqual([]);
  });
});

describe('5 · the purge knows both shapes', () => {
  it('names resumeUrl under storageKeys AND storageUrls', () => {
    const rule = deletions().find((r) => r.model === 'JobProfile')!;
    expect(rule.storageKeys).toContain('resumeUrl');
    expect(rule.storageUrls).toContain('resumeUrl');
  });

  it('the listing purge sends a kyc/ key to the vault', () => {
    const src = readFileSync(join(__dirname, '../local-services/local-services.service.ts'), 'utf8');
    const purge = src.slice(src.indexOf('purgeListingObjects'));
    expect(purge.indexOf('StorageProvider.isCvOrKycKey(url)')).toBeGreaterThan(-1);
    expect(purge.indexOf('StorageProvider.isCvOrKycKey(url)')).toBeLessThan(purge.indexOf('storage.keyFromUrl(url)'));
  });

  it('no client path PUTs a CV or a verification clip through the public door', () => {
    const web = join(__dirname, '../../../together-city-react/src/features');
    const profile = readFileSync(join(web, 'jobs/pages/Profile.tsx'), 'utf8');
    const verify = readFileSync(join(web, 'services/Verification.tsx'), 'utf8');
    expect(profile).not.toMatch(/mediaApi\.upload\(/);
    expect(verify).not.toMatch(/mediaApi\.upload\(/);
    expect(profile).toMatch(/mediaApi\.uploadResume\(/);
    expect(verify).toMatch(/mediaApi\.uploadVerificationVideo\(/);
  });
});
