import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const HERE = __dirname;
const read = (...parts: string[]) => readFileSync(join(HERE, ...parts), 'utf8');

/** Comments explain what was removed BY NAME, so an absence check that reads
 *  them can never go green. Strip them first. Trap 8, and this repo has paid
 *  for it five times. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

const service = codeOnly(read('nutrition.service.ts'));
const serviceRaw = read('nutrition.service.ts');
const controller = codeOnly(read('nutrition.controller.ts'));
const checkout = codeOnly(read(join('..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'pages', 'Checkout.tsx')));
const webApi = codeOnly(read(join('..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'api.ts')));
const webHooks = codeOnly(read(join('..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'hooks.ts')));
const schema = read(join('..', '..', 'prisma', 'schema.prisma'));

/**
 * B.18 — the grocery ordering flow is gone, and the citizens it charged are not.
 *
 * `placeOrder` debited the city wallet, wrote a NutritionOrder, and created
 * SEVEN FreshDelivery rows across the following week. `cancelDelivery` refunded
 * one day of it. Nothing in the web app rendered an order, a delivery or that
 * refund — so a citizen paid and then had nowhere to see, track or cancel what
 * they had bought. Three paragraphs above the Pay button, the same screen said
 * "We are not delivering yet."
 *
 * The screen was right. The checkout stops at the shopping list now.
 *
 * This file exists because the gate that checked all of it ran once, inside a
 * landing script, and then was gone. Everything below is a property that has to
 * keep holding.
 */
describe('the grocery ordering flow', () => {
  it('cannot charge anybody', () => {
    // Not "does not" — cannot. Scoped to the nutrition hub on purpose:
    // restaurants and beauty have their own placeOrder, which are different
    // flows with their own decisions behind them.
    expect(service).not.toMatch(/placeOrder|cancelDelivery|lastDeliveryAddress/);
    expect(controller).not.toMatch(/placeOrder|cancelDelivery|lastDeliveryAddress/);
    expect(webApi).not.toMatch(/placeOrder|cancelDelivery/);
    expect(webHooks).not.toMatch(/usePlaceOrder|useCancelDelivery/);
  });

  it('has no endpoints left', () => {
    for (const route of ["'orders'", "'orders/last-address'", 'deliveries/:deliveryId/cancel']) {
      expect(controller).not.toContain(route);
    }
  });

  it('does not ask a citizen where they live for a van that is not coming', () => {
    // The address was collected at this checkout and nowhere else. It now has
    // no writer anywhere in the hub; existing values are the citizens' own
    // answers and are left alone.
    expect(checkout).not.toMatch(/deliveryAddress|address/i);
    expect(service).not.toMatch(/masterProfile[\s\S]{0,120}address/);
  });

  /**
   * THIS ASSERTION USED TO READ A COMMENT, AND WAS RED FOR A MONTH.
   *
   * It was `expect(schema).toMatch(/NO WRITER TODAY/)` — a marker phrase in
   * the schema, standing in for the fact that nothing writes
   * `MasterProfile.address`. On 24 Aug Local Services ordering landed, someone
   * reworded that comment to say the order checkout "writes it here ONLY when
   * the citizen ticks save this as my address", and this test began failing.
   *
   * Both halves of that were wrong. The comment was wrong — the tick writes a
   * SavedAddress row, not this column — and the test was wrong to be reading
   * prose in the first place. A marker phrase is a statement that cannot be
   * wrong out loud: it fails when somebody edits the sentence, and it passes
   * when somebody adds a writer while leaving the sentence alone. Exactly
   * backwards.
   *
   * So the fact is now checked where it lives. `MasterProfile.address` may be
   * READ (the address book falls back to it as "home" when empty) and may be
   * set to NULL (forgetAddress). Nothing may put a value into it.
   */
  it('has nothing anywhere in the city that writes an address into the legacy column', () => {
    const writes: string[] = [];
    for (const f of walk(join(HERE, '..'))) {
      if (f.endsWith('.spec.ts')) continue;
      const src = codeOnly(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/masterProfile[\s\S]{0,400}?data:\s*\{([\s\S]{0,200}?)\}/g)) {
        const data = m[1];
        const addr = /\baddress\s*:\s*([^,}]+)/.exec(data);
        // `address: null` is the forget path and is allowed; anything else is
        // a writer, and there is not supposed to be one.
        if (addr && addr[1].trim() !== 'null') writes.push(`${f.split('/src/')[1]} — address: ${addr[1].trim()}`);
      }
    }
    expect(writes).toEqual([]);
  });

  it('takes no payment and invents no discount', () => {
    expect(checkout).not.toMatch(/Savings|Delivery FREE|wallet|Pay\b/);
  });
});

describe('the refund alarm', () => {
  it('counts what citizens already paid for, and says so loudly', () => {
    expect(service).toMatch(/warnAboutGroceryOrderCharges/);
    expect(service).toMatch(/nutritionOrder\s*\n?\s*\.count\(|nutritionOrder\.count\(/);
    expect(service).toMatch(/this\.logger\.error\(/);
    expect(serviceRaw).toMatch(/refunding by hand/);
    // Fires at boot, not on a request: nobody has to visit a screen for the
    // city to be told it owes money. Sliced rather than matched across a
    // distance — onModuleInit's body is long and full of its own name, and a
    // proximity regex over it would go green on the wrong occurrence.
    const body = service.slice(service.indexOf('async onModuleInit('));
    const call = body.indexOf('void this.warnAboutGroceryOrderCharges();');
    const end = body.indexOf('\n  }');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(end);
  });

  it('does not delete the evidence', () => {
    expect(service).not.toMatch(/nutritionOrder\.delete|nutritionOrder\.deleteMany/);
    expect(service).not.toMatch(/freshDelivery\.delete|freshDelivery\.deleteMany/);
  });
});

describe('the tables', () => {
  it('are still there, on purpose', () => {
    // Deleting them would delete the record that money moved. If somebody later
    // confirms production is clean, that is a migration with a human behind it
    // — and this test is the note saying so.
    expect(schema).toMatch(/model NutritionOrder \{/);
    expect(schema).toMatch(/model FreshDelivery \{/);
  });
});
