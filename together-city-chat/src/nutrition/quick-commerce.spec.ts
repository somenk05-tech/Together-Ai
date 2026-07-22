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
    const a = quoteItem(QC_PROVIDERS[1], LIST[0]);
    const b = quoteItem(QC_PROVIDERS[1], LIST[0]);
    expect(a.priceInr).toBe(b.priceInr);
    const other = quoteItem(QC_PROVIDERS[4], LIST[0]);
    expect(a.priceInr).not.toBe(other.priceInr); // different price factor + jitter
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

  it('compareStores badges cheapest/fastest/recommended and sorts by total', () => {
    const quotes = compareStores(LIST);
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
