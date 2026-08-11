import { MAKING_CHARGE, METAL_NAME, metalGrams, metalQuotes, metalRates } from './metal-pricing';

/**
 * WHAT THE METAL COSTS — the part of this hub that touches a live commodity
 * price, and therefore the part that goes wrong quietly.
 */
describe('metal pricing', () => {
  it('takes its rates from the environment before its own constants', () => {
    // A gold price hard-coded into a deployed file is a shop quoting last
    // quarter with total confidence. These can be corrected in a minute.
    const before = process.env.GOLD_22K_INR_PER_G;
    process.env.GOLD_22K_INR_PER_G = '12345';
    expect(metalRates().gold22).toBe(12345);
    if (before === undefined) delete process.env.GOLD_22K_INR_PER_G; else process.env.GOLD_22K_INR_PER_G = before;
  });

  it('ignores a rate that is not a positive number', () => {
    const before = process.env.SILVER_INR_PER_G;
    for (const junk of ['', 'free', '-40', '0']) {
      process.env.SILVER_INR_PER_G = junk;
      expect(metalRates().silver).toBeGreaterThan(0);
    }
    if (before === undefined) delete process.env.SILVER_INR_PER_G; else process.env.SILVER_INR_PER_G = before;
  });

  it('carries the date its rates are good for', () => {
    expect(metalRates().asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('weighs a bigger mount, a bigger finger and a bigger stone as more metal', () => {
    const plain = metalGrams('ring', 'solitaire', 12, 3);
    expect(metalGrams('ring', 'cluster', 12, 3)).toBeGreaterThan(plain);   // the mount
    expect(metalGrams('ring', 'solitaire', 22, 3)).toBeGreaterThan(plain); // the finger
    expect(metalGrams('ring', 'solitaire', 12, 9)).toBeGreaterThan(plain); // the stone
  });

  it('does not size a pendant to a finger', () => {
    expect(metalGrams('pendant', 'classic', 8, 4)).toBe(metalGrams('pendant', 'classic', 26, 4));
  });

  it('never returns a weightless ring, however small the finger', () => {
    expect(metalGrams('ring', 'solitaire', 1, 2)).toBeGreaterThan(1);
  });

  it('includes the making charge in the quoted price and never beside it', () => {
    /**
     * Fifteen per cent, inside the number. This is the assertion that stops
     * somebody later "fixing" the quote by adding a making charge on top of one
     * that already contains it — a mistake invisible in the code and obvious on
     * the invoice.
     */
    const [gold] = metalQuotes('ring', 'solitaire', 16, 5, 'sun');
    const bare = gold.grams * metalRates().gold22;
    expect(gold.priceInr).toBe(Math.round(bare * (1 + MAKING_CHARGE)));
    // And the quote carries no separate line anybody could add up twice.
    expect(Object.keys(gold).sort()).toEqual(['grams', 'key', 'name', 'priceInr', 'traditional']);
  });

  it('offers exactly the three metals, gold dearest', () => {
    const q = metalQuotes('ring', 'solitaire', 16, 5, 'sun');
    expect(q.map((m) => m.key)).toEqual(['gold22', 'silver', 'panchdhatu']);
    expect(q.map((m) => m.name)).toEqual([METAL_NAME.gold22, METAL_NAME.silver, METAL_NAME.panchdhatu]);
    expect(q[0].priceInr).toBeGreaterThan(q[1].priceInr);
  });

  it('marks the metal the tradition names for that planet, read from the one table', () => {
    // Sun is gold or panchdhatu; Moon is silver. Not guessed from the stone's
    // colour — taken from the wearing table every other surface reads.
    const sun = metalQuotes('ring', 'solitaire', 16, 4, 'sun');
    expect(sun.find((m) => m.key === 'gold22')?.traditional).toBe(true);
    expect(sun.find((m) => m.key === 'silver')?.traditional).toBe(false);
    const moon = metalQuotes('ring', 'solitaire', 16, 4, 'moon');
    expect(moon.find((m) => m.key === 'silver')?.traditional).toBe(true);
  });
});
