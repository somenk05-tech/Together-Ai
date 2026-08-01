/**
 * Quick commerce — what is LEFT of it.
 *
 * The flow itself was removed on 2 August (B.12). It compared a grocery list
 * across Blinkit, Zepto, Instamart, BigBasket, JioMart and TC Express and let a
 * citizen order through the winner — but every price, ETA and stock count came
 * from a deterministic SIMULATION in this file, presented as live quotes under
 * those retailers' real names, and POST /nutrition/qc/order charged the city
 * wallet for them. The quoting engine, the provider table and buildQcMeta are
 * gone with the routes: nothing can produce a quote or place one of these
 * orders again.
 *
 * What survives is the READ side, and only because orders were already paid
 * for: NutritionOrder rows carry qcJson written while the flow existed, and
 * shapeOrder() still renders their tracking so the record of what was charged
 * stays legible. Nothing here writes.
 */

// ───────────────────────── Live order tracking ─────────────────────────

export interface QcMeta {
  providerKey: string; providerName: string; providerIcon: string;
  etaMinutes: number; deliveryFeeInr: number; surgeInr: number;
  placedAt: string; rider: { name: string; rating: number };
}

export interface QcTrackStage { key: string; label: string; atMin: number; done: boolean; current: boolean }
export interface QcTracking {
  provider: { key: string; name: string; icon: string };
  rider: { name: string; rating: number };
  etaMinutes: number;
  elapsedMinutes: number;
  arrivingInMinutes: number;
  progressPct: number;
  delivered: boolean;
  stages: QcTrackStage[];
}

/** Live tracking computed purely from elapsed time — no background jobs.
 *  The timeline is fixed at order time (proportions of the quoted ETA), so
 *  every poll returns a consistent, steadily-advancing state. */
export function trackFromMeta(meta: QcMeta, now = new Date()): QcTracking {
  const eta = Math.max(6, meta.etaMinutes);
  const elapsed = Math.max(0, (now.getTime() - new Date(meta.placedAt).getTime()) / 60000);
  const defs: Array<[string, string, number]> = [
    ['confirmed', 'Order confirmed', 0],
    ['packing', 'Store is packing your order', eta * 0.12],
    ['rider', `${meta.rider.name} assigned`, eta * 0.28],
    ['pickup', 'Order picked up', eta * 0.4],
    ['onway', 'On the way', eta * 0.55],
    ['arriving', 'Arriving at your door', eta * 0.88],
    ['delivered', 'Delivered', eta],
  ];
  let currentIdx = 0;
  for (let i = 0; i < defs.length; i++) if (elapsed >= defs[i][2]) currentIdx = i;
  const delivered = elapsed >= eta;
  return {
    provider: { key: meta.providerKey, name: meta.providerName, icon: meta.providerIcon },
    rider: meta.rider,
    etaMinutes: eta,
    elapsedMinutes: Math.round(elapsed),
    arrivingInMinutes: Math.max(0, Math.ceil(eta - elapsed)),
    progressPct: Math.min(100, Math.round((elapsed / eta) * 100)),
    delivered,
    stages: defs.map(([key, label, atMin], i) => ({
      key, label, atMin: Math.round(atMin),
      done: delivered || i < currentIdx || (i === currentIdx && key !== 'delivered'),
      current: !delivered && i === currentIdx,
    })),
  };
}
