import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');

/**
 * A transaction is not a lock.
 *
 * Four defects of one shape landed in this codebase, in four different hubs,
 * and every one of them was written by somebody who had thought about
 * concurrency:
 *
 *   - the city wallet compared a balance it had already read, so two charges
 *     could both pass and the column could go negative;
 *   - a ticket booking re-read its tiers inside the transaction — which fixes a
 *     stale check and not a lost update — and could sell the last four seats
 *     twice;
 *   - a pantry draw had exactly the right unique index and did its work before
 *     the insert that the index guarded;
 *   - and the fix for that one, an hour old, still let two different meals read
 *     the same rice and write over each other.
 *
 * Postgres defaults to Read Committed. Inside a transaction, a SELECT sees a
 * consistent snapshot and an UPDATE does not stop anybody else's UPDATE — so
 * "read it, decide, write it back" is three statements, not one decision, and
 * wrapping them changes when they become visible rather than whether they
 * interleave. That is the whole misunderstanding, and it is a comfortable one:
 * the code looks careful.
 *
 * So this scans for the shape rather than for the bug. A $transaction block
 * containing a read, then something that looks like a decision, then a write,
 * has to say how it is serialised — today that means SELECT … FOR UPDATE, or a
 * conditional write whose WHERE carries the condition the decision was about.
 *
 * WHAT THIS DOES NOT COVER, so nobody reads it as more than it is: a
 * read-decide-write spread across two methods, one outside any transaction at
 * all, or a check in the service and a write in a helper. The wallet's bug
 * WOULD have been caught (it was inside $transaction); a version of it split
 * across two calls would not. This is a floor, not a proof.
 */

/**
 * `upsert` is in here as well as in WRITE, and that is not an oversight. The
 * wallet's balance came from `ensureWalletOn`, which is an upsert — a call that
 * writes and then hands you back a row you go on to make decisions about. A
 * scanner that only counted find* would have been quiet about the very defect
 * that prompted it, which the self-test below would have let through.
 */
const READ = /\b(?:await\s+)?[\w.]*\.(findFirst|findUnique|findMany|count|aggregate|upsert)\(/;
const WRITE = /\b[\w.]*\.(update|updateMany|create|createMany|upsert|delete|deleteMany)\(/;
/** Anything that makes the write depend on what was read. */
const DECISION = /\b(if|throw|Math\.min|Math\.max|===|!==|<=|>=|<|>|\.find\(|\.filter\(|\.length)/;

/** How a block may say it is serialised. */
const SERIALISED = [
  'FOR UPDATE',        // the row lock, taken before the read
  'increment:',        // a relative write needs no prior read to be correct
  'decrement:',
];

/**
 * Blocks that are safe for a reason a scanner cannot see. Each needs the
 * reason, and "it is probably fine" is not one.
 */
const ALLOW: Array<{ file: string; line: number; why: string }> = [];

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** The text between a `$transaction(` and its matching `)`. */
function transactionBlocks(src: string): Array<{ body: string; line: number }> {
  const out: Array<{ body: string; line: number }> = [];
  for (const m of src.matchAll(/\$transaction\(/g)) {
    let i = src.indexOf('(', (m.index ?? 0) + '$transaction'.length);
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) break; }
    }
    out.push({ body: src.slice(i, j), line: src.slice(0, m.index ?? 0).split('\n').length });
  }
  return out;
}

/** The check itself, over one block's text. */
function readsThenWritesUnprotected(body: string): boolean {
  if (SERIALISED.some((x) => body.includes(x))) return false;
  const lines = body.split('\n');
  const reads = lines.map((l, k) => (READ.test(l) ? k : -1)).filter((k) => k >= 0);
  const writes = lines.map((l, k) => (WRITE.test(l) ? k : -1)).filter((k) => k >= 0);
  return reads.some((r) => writes.some((w) => r < w && lines.slice(r, w + 1).some((l) => DECISION.test(l))));
}

/**
 * The scanner, checked against the four defects it exists because of, written
 * back out in miniature. A guard that has only ever returned "clean" has not
 * been shown to do anything, and this one runs over a codebase that is now
 * clean by construction.
 */
describe('the scanner catches the shape it is looking for', () => {
  it('fires on the wallet, as it was', () => {
    expect(readsThenWritesUnprotected(`
      const wallet = await db.cityWallet.upsert({ where: { userId } });
      if (wallet.balanceInr < amount) throw new BadRequestException('Insufficient');
      await db.cityWallet.update({ where: { userId }, data: { balanceInr: wallet.balanceInr - amount } });
    `)).toBe(true);
  });

  it('fires on the ticket tiers, as they were', () => {
    expect(readsThenWritesUnprotected(`
      const fresh = await tx.event.findUnique({ where: { id }, select: { tiersJson: true } });
      const seat = parseTiers(fresh.tiersJson).find((t) => t.name === tier);
      if (!seat || seat.available < qty) throw new BadRequestException('gone');
      await tx.event.update({ where: { id }, data: { tiersJson: JSON.stringify(tiers) } });
    `)).toBe(true);
  });

  it('fires on the pantry, as it was', () => {
    expect(readsThenWritesUnprotected(`
      const rows = await txPantry.findMany({ where: { ownerId } });
      const take = Math.min(row.grams, grams);
      await txPantry.update({ where: { id: row.id }, data: { grams: row.grams - take } });
    `)).toBe(true);
  });

  it('is quiet once a row lock is taken first', () => {
    expect(readsThenWritesUnprotected(`
      await tx.$queryRaw\`SELECT id FROM "Event" WHERE id = \${id} FOR UPDATE\`;
      const fresh = await tx.event.findUnique({ where: { id } });
      if (fresh.available < qty) throw new Error('gone');
      await tx.event.update({ where: { id }, data: { available: fresh.available - qty } });
    `)).toBe(false);
  });

  it('is quiet on a relative write, which needs no prior read', () => {
    expect(readsThenWritesUnprotected(`
      const n = await tx.like.count({ where: { postId } });
      if (n > 0) await tx.post.update({ where: { id }, data: { likes: { increment: 1 } } });
    `)).toBe(false);
  });

  it('is quiet when nothing is decided between the read and the write', () => {
    expect(readsThenWritesUnprotected(`
      const user = await tx.user.findUnique({ where: { id } });
      await tx.auditLog.create({ data: { userId: user.id, action: 'seen' } });
    `)).toBe(false);
  });
});

describe('every transaction that reads before it writes says how it is serialised', () => {
  it('finds transactions at all (guards the scanner itself)', () => {
    const total = sourceFiles().reduce((n, f) => n + transactionBlocks(readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(3);
  });

  it('leaves none unaccounted for', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const rel = relative(SRC, file).split('\\').join('/');
      for (const { body, line } of transactionBlocks(readFileSync(file, 'utf8'))) {
        if (ALLOW.some((a) => a.file === rel && a.line === line)) continue;

        if (readsThenWritesUnprotected(body)) offenders.push(`${rel}:${line}`);
      }
    }

    if (offenders.length) {
      throw new Error([
        'These transactions read a value, decide something from it, and write it back,',
        'with nothing saying how two of them at once are kept apart. A $transaction is',
        'not a lock — at Read Committed both copies read the same number and the second',
        'write erases the first.',
        '',
        'Take the row lock before the read (SELECT … FOR UPDATE), or make the write',
        'conditional so the database checks what you checked (updateMany with the',
        'condition in the WHERE), or use a relative increment/decrement. If it is safe',
        'for a reason this cannot see, add it to ALLOW here with that reason.',
        '',
        ...offenders.map((o) => `  - ${o}`),
      ].join('\n'));
    }
    expect(offenders).toEqual([]);
  });
});
