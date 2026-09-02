/**
 * MOVE THE CVs AND VERIFICATION VIDEOS THAT ARE ALREADY IN THE PUBLIC BUCKET
 * INTO THE VAULT. One-off, for launch blocker 3 (2 Sep). Run once against
 * production, after the deploy that makes the columns hold keys:
 *
 *   railway run npx ts-node scripts/move-private-files-to-vault.ts          # dry run: lists
 *   railway run npx ts-node scripts/move-private-files-to-vault.ts --apply  # moves
 *
 * ORDER OF OPERATIONS IS THE WHOLE SCRIPT. For each row: copy the object into
 * the vault under the new prefix, write the key to the row, and ONLY THEN
 * delete the public object. A crash between any two steps leaves a state the
 * next run recognises and finishes: a vault copy with no row is re-copied
 * (idempotent PUT), a row already holding a key is skipped, and a public
 * object whose row now names a key is deleted on the next pass. Nothing is
 * ever deleted before its replacement is confirmed to exist.
 *
 * It reads the same env the API reads, so it moves whatever the running
 * deployment would serve — the pre-2 Sep rows are exactly those whose column
 * starts with MEDIA_PUBLIC_BASE_URL.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client, CopyObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const APPLY = process.argv.includes('--apply');
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set — run this through \`railway run\` (or with the API's env) so it moves what production serves.`);
  return v;
};

const PUBLIC_BUCKET = env('MEDIA_BUCKET');
const PRIVATE_BUCKET = env('MEDIA_PRIVATE_BUCKET');
const PUBLIC_BASE = env('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '');
if (PUBLIC_BUCKET === PRIVATE_BUCKET) throw new Error('MEDIA_BUCKET and MEDIA_PRIVATE_BUCKET are the same bucket; there is no vault to move into.');

const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: env('S3_ENDPOINT'),
  credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
  forcePathStyle: true,
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env('DATABASE_URL') }) });

const keyFromUrl = (url: string): string | null => (url.startsWith(PUBLIC_BASE + '/') ? url.slice(PUBLIC_BASE.length + 1).split('?')[0] : null);
const extOf = (key: string): string => (key.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ?? 'bin');

async function exists(bucket: string, key: string): Promise<boolean> {
  try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; } catch { return false; }
}

/** Copy public→vault, confirm, write the row, delete the public copy. */
async function move(label: string, publicUrl: string, newKey: string, write: (key: string) => Promise<void>): Promise<'moved' | 'missing' | 'dry'> {
  const src = keyFromUrl(publicUrl);
  if (!src) { console.log(`  ${label}: not under ${PUBLIC_BASE}, left alone: ${publicUrl}`); return 'missing'; }
  if (!(await exists(PUBLIC_BUCKET, src))) { console.log(`  ${label}: public object is already gone (${src}); clearing the row's address`); if (APPLY) await write(''); return 'missing'; }
  console.log(`  ${label}: ${src} → vault ${newKey}`);
  if (!APPLY) return 'dry';
  await s3.send(new CopyObjectCommand({ Bucket: PRIVATE_BUCKET, Key: newKey, CopySource: `/${PUBLIC_BUCKET}/${encodeURIComponent(src).replace(/%2F/g, '/')}` }));
  if (!(await exists(PRIVATE_BUCKET, newKey))) throw new Error(`copy of ${src} did not land at ${newKey}; stopping before anything is deleted`);
  await write(newKey);
  await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: src }));
  return 'moved';
}

async function main() {
  console.log(APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to move)');
  let moved = 0, dry = 0, missing = 0;

  // ── CVs ──
  const cvs = await prisma.jobProfile.findMany({
    where: { resumeUrl: { startsWith: PUBLIC_BASE } }, select: { userId: true, resumeUrl: true },
  });
  console.log(`\n${cvs.length} CV(s) in the public bucket`);
  for (const p of cvs) {
    const r = await move(`cv of ${p.userId}`, p.resumeUrl!, `cv/${p.userId}/${randomUUID()}.${extOf(keyFromUrl(p.resumeUrl!) ?? '')}`,
      (key) => prisma.jobProfile.update({ where: { userId: p.userId }, data: { resumeUrl: key || null } }).then(() => undefined));
    if (r === 'moved') moved++; else if (r === 'dry') dry++; else missing++;
  }

  // ── verification videos (and any docUrl a client ever set) ──
  const vers = await prisma.serviceVerification.findMany({
    where: { OR: [{ videoUrl: { startsWith: PUBLIC_BASE } }, { docUrl: { startsWith: PUBLIC_BASE } }] },
    select: { id: true, listingId: true, videoUrl: true, docUrl: true, listing: { select: { ownerId: true } } },
  });
  console.log(`\n${vers.length} verification row(s) with a public object`);
  for (const v of vers) {
    const owner = v.listing.ownerId;
    if (v.videoUrl?.startsWith(PUBLIC_BASE)) {
      const r = await move(`video for listing ${v.listingId}`, v.videoUrl, `kyc/${owner}/${randomUUID()}.${extOf(keyFromUrl(v.videoUrl) ?? '')}`,
        (key) => prisma.serviceVerification.update({ where: { id: v.id }, data: { videoUrl: key || null } }).then(() => undefined));
      if (r === 'moved') moved++; else if (r === 'dry') dry++; else missing++;
    }
    if (v.docUrl?.startsWith(PUBLIC_BASE)) {
      const r = await move(`document for listing ${v.listingId}`, v.docUrl, `kyc/${owner}/${randomUUID()}.${extOf(keyFromUrl(v.docUrl) ?? '')}`,
        (key) => prisma.serviceVerification.update({ where: { id: v.id }, data: { docUrl: key || null } }).then(() => undefined));
      if (r === 'moved') moved++; else if (r === 'dry') dry++; else missing++;
    }
  }

  console.log(`\nmoved ${moved} · would move ${dry} · already gone or not ours ${missing}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
