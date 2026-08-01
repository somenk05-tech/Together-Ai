import { trackFromMeta, type QcMeta } from './quick-commerce';

/**
 * The quoting engine this file used to exercise went with the quick-commerce
 * flow (B.12). What is left is the read side, and the only reason it is left is
 * that citizens were charged: orders placed while the flow existed still carry
 * qcJson, and shapeOrder() renders their tracking from it.
 *
 * So the metadata below is written by hand rather than by buildQcMeta — the
 * shape a stored row holds, not a shape this codebase can still produce.
 */
const STORED: QcMeta = {
  providerKey: 'blinkit', providerName: 'Blinkit', providerIcon: '🛒',
  etaMinutes: 24, deliveryFeeInr: 25, surgeInr: 0,
  placedAt: '2026-07-30T09:15:00.000Z',
  rider: { name: 'Ramesh K', rating: 4.7 },
};

describe('quick-commerce order tracking (read-only remains)', () => {
  it('tracks a stored order from confirmed to delivered purely by elapsed time', () => {
    const placed = new Date(STORED.placedAt);
    const early = trackFromMeta(STORED, new Date(placed.getTime() + 30_000));
    expect(early.delivered).toBe(false);
    expect(early.stages[0].done).toBe(true);           // confirmed immediately
    expect(early.arrivingInMinutes).toBeGreaterThan(0);
    const late = trackFromMeta(STORED, new Date(placed.getTime() + (STORED.etaMinutes + 2) * 60_000));
    expect(late.delivered).toBe(true);
    expect(late.progressPct).toBe(100);
    expect(late.stages.every((s) => s.done)).toBe(true);
  });

  it('reads the rider and the store off the stored row rather than inventing them', () => {
    const t = trackFromMeta(STORED, new Date(STORED.placedAt));
    expect(t.rider.name).toBe('Ramesh K');
    expect(t.provider.name).toBe('Blinkit');
    expect(t.etaMinutes).toBe(24);
  });
});
