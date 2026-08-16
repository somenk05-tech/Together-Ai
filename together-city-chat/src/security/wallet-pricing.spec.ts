import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');

/**
 * The client says what it wants. The server says what it costs.
 *
 * Fourteen endpoints in this app charge the one city wallet. Thirteen of them
 * look the price up first — a dish out of the restaurant's menu, a tier off the
 * event row, `doctor.priceInr`, a rate-table lookup, a spread's constant, the
 * saved grocery cart. One did not: POST /beauty/orders summed `priceInr` out of
 * the request body and charged that. A request naming a ₹1,690 retinal at ₹1
 * would have been charged ₹1 and written an order that looked entirely normal
 * afterwards.
 *
 * It is an easy line to write. The client already has the price on screen, so
 * sending it back reads like passing data along rather than like handing the
 * buyer the till. Nothing about the shape looks careless, which is exactly why
 * it survived thirteen correct siblings.
 *
 * So this scans for the shape. For every charge, take the expression given as
 * `amountInr`, trace it back through the local `const`s it came from, and fail
 * if any link in that chain reads a money-shaped field off the request.
 *
 * WHAT THIS DOES NOT COVER, so nobody reads it as a proof: a price laundered
 * through a helper in another file; a request field not named like money
 * (`dto.items.reduce((s, i) => s + i.n, 0)` would pass); a quantity taken on
 * trust while the unit price is looked up correctly; and anything assembled
 * more than six hops back. It is a floor under one specific, repeatable
 * mistake.
 */

/** Where a request's values arrive under, by convention in this codebase. */
const ROOT = '(?:dto|input|body|req|request|query|params|payload)';
const MONEY = '(?:priceInr|amountInr|totalInr|subtotalInr|price|amount|total|fee|cost)';

/**
 * Money read straight off the request: `dto.amountInr`, `body.order.totalInr`.
 */
const DIRECT = new RegExp(`\\b${ROOT}\\b(?:\\.\\w+|\\[[^\\]]*\\])*\\.${MONEY}\\b`, 'i');

/**
 * Money read off something the request was iterated into — the beauty bug's
 * actual shape, `dto.items.reduce((s, i) => s + i.priceInr * i.qty, 0)`, where
 * the price is a property of the callback parameter rather than of `dto`.
 */
const ITERATED_ROOT = new RegExp(`\\b${ROOT}\\b[\\w.\\[\\]]*\\.(?:reduce|map|forEach|flatMap|filter)\\(`, 'i');
const MONEY_FIELD = new RegExp(`\\.\\s*${MONEY}\\b`, 'i');

/**
 * The two patterns, and why it is not simply "mentions the request AND mentions
 * a price". That looser rule fires on `tier.priceInr * dto.pax`, which is thirteen
 * of the fourteen charge sites doing exactly the right thing — the unit price
 * off the row, the quantity from the request. A guard that calls the correct
 * code wrong is a guard somebody switches off.
 */
function readsMoneyFromRequest(expr: string): boolean {
  if (DIRECT.test(expr)) return true;
  return ITERATED_ROOT.test(expr) && MONEY_FIELD.test(expr);
}

/** Charges that are safe for a reason a scanner cannot see. Each needs the
 *  reason, and "it is probably fine" is not one. */
const ALLOW: Array<{ file: string; line: number; why: string }> = [
  {
    file: 'financial/financial.service.ts',
    line: 0,
    why: 'The wallet primitive itself. chargeOn/paid have to take an amount from '
      + 'their caller — that is what they are for — and the guard\'s job is the '
      + 'thirteen hubs that call them, not the till. The one route that exposes '
      + 'this directly can only ever debit the caller\'s own wallet, so a forged '
      + 'amount spends the forger\'s money, and the balance floor still holds.',
  },
  {
    file: 'commerce/settlement.service.ts',
    line: 0,
    why: 'Not a wallet charge. The flagged line writes a NEGATIVE entry in a '
      + 'merchant\'s own book when that merchant refunds one of its customers — '
      + 'money leaving the business, not arriving from one. The amount reaches '
      + 'it already clamped: payments.service.refund loads the invoice scoped by '
      + 'ownerId, computes paidInr minus refundedInr, and throws before this is '
      + 'called if the request exceeds it, so the largest number a caller can '
      + 'push through is what their own customer actually paid them. The wallet '
      + 'side of the same refund is a credit, which this guard does not and '
      + 'should not care about — nobody defrauds themselves by being paid.',
  },
];

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** The text of the `amountInr:` expression, up to the comma that ends it. */
export function amountExpressions(src: string): Array<{ expr: string; index: number }> {
  const out: Array<{ expr: string; index: number }> = [];
  for (const m of src.matchAll(/amountInr\s*:/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      const c = src[j];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    out.push({ expr: src.slice(start, j).trim(), index: m.index ?? 0 });
  }
  return out;
}

/**
 * Does this expression, or anything it was built from, read money off the
 * request? `scope` is the whole file: a wider net than the enclosing function
 * and therefore only ever more cautious.
 */
export function pricedByTheCaller(scope: string, expr: string, hops = 6): boolean {
  if (readsMoneyFromRequest(expr)) return true;
  if (hops === 0) return false;
  for (const id of new Set(expr.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
    // `const totalInr = …` and `const { lines, totalInr } = …` both count.
    const direct = new RegExp(`\\b(?:const|let|var)\\s+${id}\\s*=([^;]*)`).exec(scope);
    const destructured = new RegExp(`\\b(?:const|let|var)\\s*\\{[^}]*\\b${id}\\b[^}]*\\}\\s*=([^;]*)`).exec(scope);
    for (const m of [direct, destructured]) {
      if (m && pricedByTheCaller(scope, m[1], hops - 1)) return true;
    }
  }
  return false;
}

describe('the scanner catches the shape it is looking for', () => {
  it('fires on the beauty order, as it was', () => {
    const scope = `
      async placeOrder(userId: string, dto: PlaceBeautyOrderDto) {
        const totalInr = dto.items.reduce((s, i) => s + i.priceInr * i.qty, 0);
        await this.financial.paid(userId, { amountInr: totalInr, method: dto.method }, fn);
      }`;
    expect(pricedByTheCaller(scope, 'totalInr')).toBe(true);
  });

  it('fires when the request amount is handed straight over', () => {
    expect(pricedByTheCaller('', 'dto.amountInr')).toBe(true);
  });

  it('is quiet on the beauty order as it is now', () => {
    const scope = `
      async placeOrder(userId: string, dto: PlaceBeautyOrderDto) {
        const priced = priceBeautyOrder(dto.items);
        const { lines, totalInr } = priced;
        await this.financial.paid(userId, { amountInr: totalInr, method: dto.method }, fn);
      }`;
    expect(pricedByTheCaller(scope, 'totalInr')).toBe(false);
  });

  it('is quiet when the price comes off a row', () => {
    const scope = `
      const dish = menu.find((d) => d.id === it.dishId);
      const subtotal = lines.reduce((s, l) => s + l.lineInr, 0);
      const totalInr = subtotal + packingInr + taxInr;`;
    expect(pricedByTheCaller(scope, 'totalInr')).toBe(false);
  });

  it('is quiet on a rate-table lookup', () => {
    const scope = "const amountInr = this.financial.rate('datingChatUnlock');";
    expect(pricedByTheCaller(scope, 'amountInr')).toBe(false);
  });

  it('is quiet when the unit price is a row and only the quantity is the request', () => {
    // This is what thirteen of the fourteen charge sites look like. The first
    // version of this scanner flagged all of them, which is how the two-pattern
    // rule above came to exist. A forged quantity is a real but separate
    // problem, and this guard does not pretend to cover it.
    const scope = 'const totalInr = tier.priceInr * dto.pax;';
    expect(pricedByTheCaller(scope, 'totalInr')).toBe(false);
  });

  it('fires when money is read off a member of the request', () => {
    expect(pricedByTheCaller('', 'body.order.totalInr')).toBe(true);
  });
});

describe('no endpoint charges the wallet what the caller asked to be charged', () => {
  it('holds across every source file', () => {
    const offences: string[] = [];
    for (const full of sourceFiles()) {
      const file = relative(SRC, full).split('\\').join('/');
      const src = readFileSync(full, 'utf8');
      if (!src.includes('amountInr')) continue;
      if (ALLOW.some((a) => a.file === file)) continue;
      for (const { expr, index } of amountExpressions(src)) {
        if (!pricedByTheCaller(src, expr)) continue;
        offences.push(`${file}:${src.slice(0, index).split('\n').length} — amountInr: ${expr}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
