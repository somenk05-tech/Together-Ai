import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A meal is drawn from the pantry once.
 *
 * The unique index on (ownerId, mealKey) was always there. What it could not do
 * was guard work that happened BEFORE the insert and was allowed to fail after
 * it — the old shape checked for a log, deducted, then inserted with
 * `.catch(() => undefined)` on the end, so a second caller drew the pantry down
 * a second time and had its duplicate insert quietly discarded.
 *
 * The ordering is the whole fix, and ordering is what a source scan can hold
 * honestly. Whether Postgres enforces the index is Postgres's business.
 */
const SRC = readFileSync(join(__dirname, 'nutrition.service.ts'), 'utf8');

const body = (() => {
  const at = SRC.indexOf('async markMealCooked(');
  expect(at).toBeGreaterThan(-1);
  return SRC.slice(at, SRC.indexOf('\n  }\n', at));
})();

describe('markMealCooked', () => {
  it('writes the claim before it takes anything', () => {
    const claim = body.indexOf('txLog.create(');
    const deduct = body.indexOf('txPantry.update(');
    expect(claim).toBeGreaterThan(-1);
    expect(deduct).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(deduct);
  });

  it('does the claim and the deductions in one transaction', () => {
    const tx = body.indexOf('this.prisma.$transaction');
    expect(tx).toBeGreaterThan(-1);
    expect(tx).toBeLessThan(body.indexOf('txLog.create('));
    // Both writes go through the transaction client, not the outer one.
    expect(body).toContain('txPantry.findMany');
    expect(body).toContain('txPantry.update');
    expect(body).not.toMatch(/await this\.pantry\.update\(/);
  });

  it('treats a duplicate as "already cooked" rather than swallowing it', () => {
    expect(body).toContain("'P2002'");
    expect(body).toContain('alreadyCooked: true');
    // The failure that used to be discarded.
    expect(body).not.toMatch(/log\.create\([\s\S]{0,200}?\.catch\(\(\) => undefined\)/);
  });

  it('locks the household pantry before reading it', () => {
    // The claim row makes one MEAL draw once. Two different meals settling at
    // the same moment still read the same rice and both write an absolute
    // amount, so the second erases the first. This is the part that stops that,
    // and its position — before the read — is the whole of it.
    const lock = body.indexOf('FOR UPDATE');
    const read = body.indexOf('txPantry.findMany');
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(read);
    expect(body).toContain('"PantryItem"');
  });

  it('never discards a pantry write', () => {
    // Any `.catch(() => undefined)` inside the transaction would put us back
    // where we started: a deduction that failed silently while the claim stood.
    const txStart = body.indexOf('this.prisma.$transaction');
    const txEnd = body.indexOf('} catch (e)');
    expect(body.slice(txStart, txEnd)).not.toContain('.catch(() => undefined)');
  });
});
