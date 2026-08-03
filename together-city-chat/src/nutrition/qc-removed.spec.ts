import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const HERE = __dirname;
const read = (...parts: string[]) => readFileSync(join(HERE, ...parts), 'utf8');

/** Comments explain what was removed BY NAME, so an absence check that reads
 *  them can never go green. Strip them first. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

const service = codeOnly(read('nutrition.service.ts'));
const serviceRaw = read('nutrition.service.ts');
const controller = codeOnly(read('nutrition.controller.ts'));
const engine = codeOnly(read('quick-commerce.ts'));
const schema = read(join('..', '..', 'prisma', 'schema.prisma'));

/**
 * The quick-commerce flow is gone (B.12), and nobody is quietly left holding an
 * order they paid for.
 *
 * Four endpoints — compare, search, order, track — quoted a citizen's grocery
 * list across Blinkit, Zepto, Instamart, BigBasket and JioMart BY NAME, and
 * every price, ETA and stock count came from a deterministic simulator in
 * quick-commerce.ts. No screen in the web app called any of them. POST
 * /nutrition/qc/order nevertheless charged the city wallet and wrote
 * NutritionOrder rows.
 *
 * That last fact is why this guard exists. Deleting the flow removes the only
 * code that knew those charges happened — the same way removing the events flow
 * nearly took the alarm about its own bookings with it. So three things are
 * pinned: the flow cannot come back by accident, the alarm survives, and the
 * evidence is not tidied away.
 */
describe('the quick-commerce flow', () => {
  it('has no endpoints left', () => {
    for (const route of ["qc/compare", "qc/search", "qc/order", "qc/orders/:id/track"]) {
      expect(controller).not.toContain(route);
    }
    expect(controller).not.toMatch(/qcCompare|qcSearch|qcOrder|qcTrack/);
  });

  it('cannot quote or place an order', () => {
    // The clearest single statement of the removal: nothing left can produce a
    // price under a retailer's name. Not "does not" — cannot.
    expect(service).not.toMatch(/compareStores|quoteStore|QC_PROVIDERS|buildQcMeta|QuickCommerceClient/);
    expect(engine).not.toMatch(/QC_PROVIDERS|export function quote|export function compareStores|export function buildQcMeta/);
    expect(existsSync(join(HERE, 'quick-commerce-client.ts'))).toBe(false);
  });

  it('keeps the grocery list, which was never the problem', () => {
    // This used to pin `async orders(` and `async cancelDelivery(` alongside
    // the list, because B.12's job was to remove the simulated retailer flow
    // WITHOUT taking the city-fulfilled one with it.
    //
    // B.18 then answered the question B.12 had left open, and the answer was
    // that the city-fulfilled flow had a different problem of its own: it
    // charged the wallet, wrote seven deliveries a week, and no screen in the
    // app rendered an order, a delivery or that refund. So `orders()`,
    // `cancelDelivery()`, `placeOrder()` and `lastDeliveryAddress()` are gone
    // on purpose, and `grocery-orders-removed.spec.ts` is the guard that says
    // so. Two decisions, not a regression — which is why this line changed
    // rather than the test being deleted.
    expect(serviceRaw).toContain('async groceryPlan(');
  });
});

describe('the refund alarm', () => {
  it('counts what citizens already paid for, and says so loudly', () => {
    expect(service).toMatch(/nutritionOrder\s*\n?\s*\.count\(|nutritionOrder\.count\(/);
    expect(service).toMatch(/qcJson/);
    expect(service).toMatch(/this\.logger\.error\(/);
    expect(serviceRaw).toMatch(/refunding by hand/);
  });

  it('does not delete the orders', () => {
    // They are the record that money moved.
    expect(service).not.toMatch(/nutritionOrder\.delete/);
    expect(service).not.toMatch(/nutritionOrder\.deleteMany/);
  });

  it('leaves a paid order interpretable, with nothing left to serve it', () => {
    // `shapeOrder` turned a row's stored qcJson back into a delivery story, and
    // it was the only caller of `trackFromMeta`. It went with the grocery
    // ordering flow in B.18, so NO ROUTE READS A PAID ORDER ANY MORE — the
    // service does not import from this engine at all.
    expect(service).not.toMatch(/from '\.\/quick-commerce'/);
    // The interpreter itself stays, and keeps its own test. The rows are still
    // in the table, they are still owed refunds, and whoever does that refund
    // by hand needs the code that says what each one was. Deleting it would
    // leave the evidence unreadable, which is the one thing B.12 removed the
    // flow in order not to do.
    expect(engine).toMatch(/export function trackFromMeta/);
    expect(existsSync(join(HERE, 'quick-commerce.spec.ts'))).toBe(true);
  });
});

describe('the table', () => {
  it('is still there, on purpose', () => {
    // Dropping a table this cannot verify is empty is not a thing to do from a
    // code change, and these rows hold the evidence a refund is owed. If
    // somebody later confirms production is clean, that is a migration with a
    // human behind it — and this test is the note saying so.
    expect(schema).toMatch(/model NutritionOrder \{/);
    expect(schema).toMatch(/qcJson/);
  });
});
