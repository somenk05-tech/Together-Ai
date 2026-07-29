import {
  QC_PROVIDERS, applyBadges, buildQcMeta, compareStores, quoteItem, quoteStore, refreshTotals, trackFromMeta,
} from './quick-commerce';

const LIST = [
  { name: 'Tomato', grams: 900, baseInr: 54 },
  { name: 'Basmati rice', grams: 2000, baseInr: 180 },
  { name: 'Milk', grams: 1000, baseInr: 90 },
  { name: 'Paneer', grams: 400, baseInr: 140 },
  { name: 'Onion', grams: 1200, baseInr: 72 },
];

describe('quick-commerce engine', () => {
  it('quotes are deterministic for the same day and differ across providers', () => {
    // Pinned day. This used to quote "today" and compare two named providers,
    // which passed on most dates and failed on the ones where that item's daily
    // jitter happened to land those two on the same rupee — a test that goes red
    // by calendar teaches people to re-run it rather than read it.
    const DAY = '2026-07-29';
    const a = quoteItem(QC_PROVIDERS[1], LIST[0], DAY);
    const b = quoteItem(QC_PROVIDERS[1], LIST[0], DAY);
    expect(a.priceInr).toBe(b.priceInr);

    // The real claim is that providers are priced independently, not that any
    // particular pair differs on any particular day.
    const spread = new Set(QC_PROVIDERS.map((p) => quoteItem(p, LIST[0], DAY).priceInr));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('prices the same basket differently at a cheap store and a dear one', () => {
    // Price factor has to actually move the total, which one item's jitter can
    // mask but a whole list cannot.
    const DAY = '2026-07-29';
    const total = (p: (typeof QC_PROVIDERS)[number]) =>
      LIST.reduce((s, it) => s + quoteItem(p, it, DAY).priceInr, 0);
    const cheapest = [...QC_PROVIDERS].sort((x, y) => x.priceFactor - y.priceFactor)[0];
    const dearest = [...QC_PROVIDERS].sort((x, y) => y.priceFactor - x.priceFactor)[0];
    expect(total(dearest)).toBeGreaterThan(total(cheapest));
  });

  it('own store (TC Express) always has full availability', () => {
    const q = quoteStore(QC_PROVIDERS[0], LIST);
    expect(q.availableCount).toBe(LIST.length);
    expect(q.unavailable).toHaveLength(0);
  });

  it('applies delivery fees, free-over thresholds and small-cart fees', () => {
    const p = QC_PROVIDERS.find((x) => x.key === 'blinkit')!;
    const big = quoteStore(p, LIST);                    // subtotal >> freeOver 199
    expect(big.deliveryFeeInr).toBe(0);
    const small = quoteStore(p, [{ name: 'Lemon', grams: 100, baseInr: 12 }]);
    if (small.availableCount > 0 && small.itemsTotalInr < p.smallCartUnderInr) {
      expect(small.deliveryFeeInr).toBeGreaterThanOrEqual(p.deliveryFeeInr);
    }
    expect(big.totalInr).toBe(big.itemsTotalInr + big.deliveryFeeInr + big.surgeInr);
  });

  /**
   * Named partner stores are quoted ONLY when a live provider is connected.
   * Without one, showing Zepto and Blinkit prices next to a real basket invents
   * a market that isn't there — the citizen would be comparing made-up numbers
   * against named companies. This spec asserted the pre-gating behaviour and
   * was left behind when that landed.
   */
  it('quotes only the own store until a live partner is connected', () => {
    const quotes = compareStores(LIST);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].provider.key).toBe('tc-express');
  });

  it('compareStores badges cheapest/fastest/recommended and sorts by total', () => {
    const quotes = compareStores(LIST, new Date(), true);
    expect(quotes).toHaveLength(QC_PROVIDERS.length);
    const all = quotes.flatMap((q) => q.badges);
    expect(all).toContain('cheapest');
    expect(all).toContain('fastest');
    expect(all).toContain('recommended');
    for (let i = 1; i < quotes.length; i++) expect(quotes[i].totalInr).toBeGreaterThanOrEqual(quotes[i - 1].totalInr);
  });

  it('refreshTotals recomputes fees after a live price overlay', () => {
    const q = quoteStore(QC_PROVIDERS.find((x) => x.key === 'zepto')!, LIST);
    q.items[0].priceInr = 999; q.items[0].available = true;
    refreshTotals(q);
    expect(q.itemsTotalInr).toBe(q.items.filter((i) => i.available).reduce((s, i) => s + i.priceInr, 0));
    expect(q.totalInr).toBe(q.itemsTotalInr + q.deliveryFeeInr + q.surgeInr);
    applyBadges([q]); // must not throw on a single quote
  });

  it('tracks an order from confirmed to delivered purely by elapsed time', () => {
    const quote = quoteStore(QC_PROVIDERS[0], LIST);
    const meta = buildQcMeta(quote, 'order-123');
    const placed = new Date(meta.placedAt);
    const early = trackFromMeta(meta, new Date(placed.getTime() + 30_000));
    expect(early.delivered).toBe(false);
    expect(early.stages[0].done).toBe(true);           // confirmed immediately
    expect(early.arrivingInMinutes).toBeGreaterThan(0);
    const late = trackFromMeta(meta, new Date(placed.getTime() + (meta.etaMinutes + 2) * 60_000));
    expect(late.delivered).toBe(true);
    expect(late.progressPct).toBe(100);
    expect(late.stages.every((s) => s.done)).toBe(true);
    // Same rider on every poll (deterministic from order id)
    expect(buildQcMeta(quote, 'order-123').rider.name).toBe(meta.rider.name);
  });
});
