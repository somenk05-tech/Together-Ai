/**
 * Quick Commerce API — find the grocery list across online stores.
 *
 * Provider-adapter design: every store ("app") implements the same quote
 * surface — item pricing, availability, delivery fee and ETA — so the grocery
 * app can compare the SAME list across Blinkit, Zepto, Instamart, BigBasket,
 * JioMart and Together City's own TC Express, then order through the best one.
 *
 * Today each adapter is a deterministic simulation (seeded per provider, item
 * and day — stable all day, refreshed daily, realistic spreads). When a real
 * integration becomes available (e.g. an ONDC buyer-app connection), one
 * adapter is replaced and the whole grocery experience upgrades in place —
 * the API contract and frontend never change.
 */

export interface QcProvider {
  key: string; name: string; icon: string; tagline: string;
  priceFactor: number;          // vs the city baseline price
  etaMin: number; etaMax: number;
  deliveryFeeInr: number; freeOverInr: number;
  smallCartUnderInr: number; smallCartFeeInr: number;
  peakSurgeInr: number;         // added at lunch/dinner peaks
  availability: number;         // base in-stock probability
}

export const QC_PROVIDERS: QcProvider[] = [
  { key: 'tc-express', name: 'TC Express', icon: '🏙️', tagline: 'Together City fulfilment · always in stock', priceFactor: 1.0, etaMin: 11, etaMax: 18, deliveryFeeInr: 19, freeOverInr: 249, smallCartUnderInr: 149, smallCartFeeInr: 15, peakSurgeInr: 0, availability: 1.0 },
  { key: 'blinkit', name: 'Blinkit', icon: '⚡', tagline: 'Fastest doorstep delivery', priceFactor: 1.06, etaMin: 8, etaMax: 14, deliveryFeeInr: 25, freeOverInr: 199, smallCartUnderInr: 99, smallCartFeeInr: 20, peakSurgeInr: 15, availability: 0.93 },
  { key: 'zepto', name: 'Zepto', icon: '🟣', tagline: '10-minute groceries', priceFactor: 1.04, etaMin: 9, etaMax: 15, deliveryFeeInr: 21, freeOverInr: 149, smallCartUnderInr: 99, smallCartFeeInr: 18, peakSurgeInr: 12, availability: 0.92 },
  { key: 'instamart', name: 'Swiggy Instamart', icon: '🟠', tagline: 'Groceries in minutes', priceFactor: 1.08, etaMin: 12, etaMax: 20, deliveryFeeInr: 29, freeOverInr: 199, smallCartUnderInr: 129, smallCartFeeInr: 20, peakSurgeInr: 18, availability: 0.9 },
  { key: 'bigbasket', name: 'BigBasket Now', icon: '🧺', tagline: 'Wide range, honest prices', priceFactor: 0.97, etaMin: 18, etaMax: 32, deliveryFeeInr: 15, freeOverInr: 299, smallCartUnderInr: 199, smallCartFeeInr: 10, peakSurgeInr: 0, availability: 0.95 },
  { key: 'jiomart', name: 'JioMart Express', icon: '🔵', tagline: 'Lowest prices, relaxed delivery', priceFactor: 0.93, etaMin: 26, etaMax: 45, deliveryFeeInr: 0, freeOverInr: 0, smallCartUnderInr: 249, smallCartFeeInr: 25, peakSurgeInr: 0, availability: 0.88 },
];

export interface QcListItem { name: string; grams: number; baseInr: number }
export interface QcItemQuote { name: string; grams: number; priceInr: number; available: boolean; note: string | null }
export interface QcStoreQuote {
  provider: { key: string; name: string; icon: string; tagline: string };
  etaMinutes: number;
  itemsTotalInr: number;
  deliveryFeeInr: number;
  surgeInr: number;
  availableCount: number;
  itemCount: number;
  unavailable: string[];
  totalInr: number;
  freeDeliveryOverInr: number;
  badges: string[];
  items: QcItemQuote[];
}

const hash32 = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
/** Deterministic 0..1 from a seed string — stable for the whole day. */
const roll = (seed: string): number => hash32(seed) / 4294967296;

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Is now a delivery peak (lunch/dinner rush, IST)? Drives ETA + surge. */
export function isPeakNow(now = new Date()): boolean {
  const istHour = (now.getUTCHours() + 5.5 + 24) % 24;
  return (istHour >= 12 && istHour < 14) || (istHour >= 19 && istHour < 22);
}

/** Quote ONE item at ONE provider (price jitter ±6%, availability seeded per day). */
export function quoteItem(p: QcProvider, item: QcListItem, day = todayKey()): QcItemQuote {
  const jitter = 0.94 + roll(`${p.key}|${item.name.toLowerCase()}|${day}|price`) * 0.12;
  const priceInr = Math.max(5, Math.round(item.baseInr * p.priceFactor * jitter));
  const availRoll = roll(`${p.key}|${item.name.toLowerCase()}|${day}|stock`);
  const available = availRoll < p.availability;
  const low = available && availRoll > p.availability - 0.08;
  return { name: item.name, grams: item.grams, priceInr, available, note: !available ? 'out of stock' : low ? 'low stock' : null };
}

/** Quote the WHOLE list at one provider. */
export function quoteStore(p: QcProvider, items: QcListItem[], now = new Date()): QcStoreQuote {
  const day = todayKey();
  const quotes = items.map((it) => quoteItem(p, it, day));
  const availableQuotes = quotes.filter((q) => q.available);
  const itemsTotalInr = availableQuotes.reduce((s, q) => s + q.priceInr, 0);
  const peak = isPeakNow(now);
  const surgeInr = peak ? p.peakSurgeInr : 0;
  let deliveryFeeInr = p.freeOverInr > 0 && itemsTotalInr >= p.freeOverInr ? 0 : p.deliveryFeeInr;
  if (itemsTotalInr > 0 && itemsTotalInr < p.smallCartUnderInr) deliveryFeeInr += p.smallCartFeeInr;
  const etaJitter = roll(`${p.key}|${day}|eta`);
  let etaMinutes = Math.round(p.etaMin + (p.etaMax - p.etaMin) * etaJitter);
  if (peak) etaMinutes = Math.round(etaMinutes * 1.3);
  return {
    provider: { key: p.key, name: p.name, icon: p.icon, tagline: p.tagline },
    etaMinutes,
    itemsTotalInr,
    deliveryFeeInr,
    surgeInr,
    availableCount: availableQuotes.length,
    itemCount: items.length,
    unavailable: quotes.filter((q) => !q.available).map((q) => q.name),
    totalInr: itemsTotalInr + deliveryFeeInr + surgeInr,
    freeDeliveryOverInr: p.freeOverInr,
    badges: [],
    items: quotes,
  };
}

/** Badge cheapest/fastest/best-stocked/recommended (also used after live overlay). */
export function applyBadges(quotes: QcStoreQuote[]): QcStoreQuote[] {
  if (!quotes.length) return quotes;
  for (const q of quotes) q.badges = [];
  const priced = quotes.filter((q) => q.availableCount > 0);
  if (!priced.length) return quotes;
  priced.reduce((a, b) => (b.totalInr < a.totalInr ? b : a)).badges.push('cheapest');
  priced.reduce((a, b) => (b.etaMinutes < a.etaMinutes ? b : a)).badges.push('fastest');
  priced.reduce((a, b) => (b.availableCount > a.availableCount ? b : a)).badges.push('best availability');
  // Recommended = best value per available item with sane ETA.
  const scored = priced.map((q) => ({
    q, score: (q.totalInr / Math.max(1, q.availableCount)) + q.etaMinutes * 0.6 + (q.itemCount - q.availableCount) * 8,
  }));
  scored.sort((a, b) => a.score - b.score)[0].q.badges.unshift('recommended');
  return quotes.sort((a, b) => a.totalInr - b.totalInr);
}

/** Compare the list across every store; badge cheapest/fastest/best-stocked. */
export function compareStores(items: QcListItem[], now = new Date()): QcStoreQuote[] {
  const quotes = QC_PROVIDERS.map((p) => quoteStore(p, items, now));
  if (!items.length) return quotes;
  return applyBadges(quotes);
}

/** Recompute a quote's fees + total after item prices change (live overlay). */
export function refreshTotals(q: QcStoreQuote): void {
  const p = QC_PROVIDERS.find((x) => x.key === q.provider.key)!;
  const avail = q.items.filter((i) => i.available);
  q.availableCount = avail.length;
  q.unavailable = q.items.filter((i) => !i.available).map((i) => i.name);
  q.itemsTotalInr = avail.reduce((s, i) => s + i.priceInr, 0);
  let fee = p.freeOverInr > 0 && q.itemsTotalInr >= p.freeOverInr ? 0 : p.deliveryFeeInr;
  if (q.itemsTotalInr > 0 && q.itemsTotalInr < p.smallCartUnderInr) fee += p.smallCartFeeInr;
  q.deliveryFeeInr = fee;
  q.totalInr = q.itemsTotalInr + q.deliveryFeeInr + q.surgeInr;
}

// ───────────────────────── Live order tracking ─────────────────────────

export interface QcMeta {
  providerKey: string; providerName: string; providerIcon: string;
  etaMinutes: number; deliveryFeeInr: number; surgeInr: number;
  placedAt: string; rider: { name: string; rating: number };
}

const RIDERS = ['Ramesh K', 'Suresh P', 'Amit V', 'Deepak S', 'Vijay R', 'Manoj T', 'Arjun M', 'Sandeep G', 'Rahul D', 'Kiran B'];

export function buildQcMeta(provider: QcStoreQuote, orderId: string): QcMeta {
  const r = hash32(orderId);
  return {
    providerKey: provider.provider.key, providerName: provider.provider.name, providerIcon: provider.provider.icon,
    etaMinutes: provider.etaMinutes, deliveryFeeInr: provider.deliveryFeeInr, surgeInr: provider.surgeInr,
    placedAt: new Date().toISOString(),
    rider: { name: RIDERS[r % RIDERS.length], rating: Math.round((4.3 + (r % 60) / 100) * 10) / 10 },
  };
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
