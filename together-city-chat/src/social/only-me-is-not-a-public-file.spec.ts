/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';
import { CreatePostSchema } from './dto/social.dto';

/**
 * ── "ONLY ME" IS NOT A LABEL ON A PUBLIC FILE (30 Aug audit, blocker 3) ──────
 *
 * Post media was presigned into the PUBLIC bucket and stored as
 * `${publicBase}/${key}` — a permanent, unauthenticated URL shipped to every
 * viewer. Anyone who could see a Family video once could copy the `<video src>`
 * and hand the string to anybody, forever, with no session; deleting the post
 * did not stop it, because nothing ever deleted the object. Health records and
 * dating photographs had used the private bucket with short signed GETs since
 * they were written. Social posts were on the other side of that line and
 * nothing in the code said so.
 *
 * Two other holes closed with it, both consequences of what the DTO accepted:
 *
 *  · `data:image/...` up to 15,000,000 characters meant photographs were never
 *    uploaded at all — they lived in Postgres and travelled in every feed page.
 *  · `https://` with no host restriction meant a post could point every
 *    viewer's browser at a server the author chose, and `setCover` would fetch
 *    it server-side, from inside the VPC.
 *
 * This file asserts the rules a citizen is relying on: the only thing a post
 * can carry is a key that is ours and theirs, the bucket is asked whether it is
 * really there and how big it really is, and what leaves on a read is a signed
 * URL rather than the key.
 */

const ME = 'me-0000';
const THEM = 'them-1111';

function svc(over: { exists?: boolean; size?: number | null } = {}) {
  const created: any[] = [];
  const prisma = {
    post: {
      create: async (args: any) => {
        created.push(args.data);
        return { ...args.data, id: 'p1', createdAt: new Date(), media: [{ id: 'm1', url: `social/${ME}/a.jpg`, kind: 'image', thumbUrl: null }], author: { id: ME, handle: 'me', name: 'Me' } };
      },
    },
    connection: { findMany: async () => [] },
    follow: { findMany: async () => [] },
  } as any;
  const storage = {
    isOwnPostKey: (u: string, k: string) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(k) && k.startsWith(`social/${u}/`),
    privateObjectExists: async () => over.exists ?? true,
    healthObjectSize: async () => (over.size === undefined ? 1024 : over.size),
    signPostMedia: async (values: Array<string | null>) => new Map(
      values.filter(Boolean).map((v) => [v as string, `https://signed.example/${v}?sig=abc`]),
    ),
  } as any;
  const blocking = { blockedWith: async () => new Set<string>() } as any;
  const gateway = { postNew: jest.fn() } as any;
  const notifications = { create: jest.fn(async () => undefined) } as any;
  return {
    svc: new SocialService(prisma, gateway, notifications, storage, {} as never, blocking, {} as never),
    created,
  };
}

const post = (media: any[]) => ({ text: 'hello', media } as any);

describe('a post can only carry media we issued, to the person posting it', () => {
  it('refuses somebody else’s key', async () => {
    const { svc: s, created } = svc();
    await expect(s.createPost(ME, post([{ url: `social/${THEM}/x.jpg`, kind: 'image' }])))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses a key whose object never arrived', async () => {
    const { svc: s } = svc({ exists: false });
    await expect(s.createPost(ME, post([{ url: `social/${ME}/x.jpg`, kind: 'image' }])))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a file whose REAL size is over the cap, whatever was declared', async () => {
    // The presign cap reads `sizeBytes` out of the request body and the signed
    // PUT carries no content-length-range, so declaring 1 KB and pushing 200 MB
    // worked. This is the check the bucket can actually make.
    const { svc: s } = svc({ size: 400 * 1024 * 1024 });
    await expect(s.createPost(ME, post([{ url: `social/${ME}/x.mp4`, kind: 'video' }])))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the poster frame as well as the video', async () => {
    const { svc: s } = svc();
    await expect(s.createPost(ME, post([{ url: `social/${ME}/x.mp4`, kind: 'video', thumbUrl: `social/${THEM}/y.jpg` }])))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores the key and hands back a signed URL, never the key itself', async () => {
    const { svc: s, created } = svc();
    const shaped: any = await s.createPost(ME, post([{ url: `social/${ME}/a.jpg`, kind: 'image' }]));
    expect(created[0].media.create[0].url).toBe(`social/${ME}/a.jpg`);
    expect(shaped.media[0].url).toMatch(/^https:\/\/signed\.example\//);
    expect(shaped.media[0].url).not.toBe(`social/${ME}/a.jpg`);
  });
});

describe('the DTO takes a key and nothing else', () => {
  const parse = (url: string) => CreatePostSchema.safeParse({ text: 'x', media: [{ url, kind: 'image' }] });

  it('accepts one of our keys', () => {
    expect(parse(`social/${ME}/a.jpg`).success).toBe(true);
  });

  it('refuses an inline data URL — a photograph is an upload, not a column', () => {
    expect(parse('data:image/jpeg;base64,AAAA').success).toBe(false);
  });

  it('refuses any host on the internet, which is what made setCover an SSRF', () => {
    expect(parse('https://mallory.example/pixel.png').success).toBe(false);
    expect(parse('https://cdn.togethercity.app/old.jpg').success).toBe(false);
  });

  it('refuses a key that climbs out of its own prefix', () => {
    expect(parse('social/me/../../etc/passwd').success).toBe(false);
    expect(parse('health/me-0000/scan.pdf').success).toBe(false);
  });
});
