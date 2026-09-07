import { useMemo } from 'react';
import { useBag, usePlaceOrder, useSaveBag, useSetSupplementBudget, useStore, serverSaid, type StoreProduct } from '@/api/store.api';
import { SHOPS } from '../shelves';
import type { PayMethodChoice, Shop, ShopItem } from './types';

/**
 * ── THE SUPPLEMENT SHELF, AS A SHOP ─────────────────────────────────────────
 *
 * THE SHORTLIST IS THE SERVER'S VERDICT, NOT A FILTER WRITTEN HERE. Every
 * product on the fitness shelf carries `yours` — the engine's judgement for this
 * citizen, derived from their labs, medicines, diet and goal — and the store
 * shows the two buckets that mean "take this": priority and consider. `optional`
 * and `not-recommended` are left on the shelf in the hub where the reasoning
 * that produced them is also on the page.
 *
 * AND `personalised` DECIDES WHETHER THERE IS A SHORTLIST AT ALL. It is a
 * required field on the wire for one reason, written into store.api.ts: it says
 * whether a missing badge means "no opinion" or "we could not reach your health
 * data", and those two must never be allowed to look alike. When the shelf is
 * not personalised this store says so and sends nobody a ranked list, because a
 * general list presented as yours is the worst of the three outcomes.
 *
 * ONE THING IS NOT SHOWN AND IT IS DELIBERATE: `rx` products. A prescription
 * item is a conversation with a clinician, and the hub's own shelf carries the
 * reasoning, the upper limit and the "test first" flag beside it. A tile in a
 * shop with an Add button and none of that is the wrong surface for it.
 *
 * ── ONE PACK PER SUPPLEMENT, INSIDE A NUMBER THE CITIZEN SET (owner, 5 Sep) ──
 * "supplements show only one option for supplement based on budget — let user
 * set budget." This shelf drew every product under every shortlisted
 * supplement: ten omega-3 bottles for one triglyceride result. It draws the
 * server's KIT now — one pack per recommended supplement, the review's quality
 * tags first and price as the tie-break, filled priority-first inside ₹ a
 * month the citizen types here and saves on their Training Profile. What the
 * number cannot reach is NAMED under the control rather than quietly absent.
 * The arithmetic is kit.ts on the server; this file draws its answer and
 * sends the number back, nothing more.
 */

const SHORTLISTED = new Set(['priority', 'consider']);

function shopItem(p: StoreProduct): ShopItem {
  return {
    id: p.id,
    name: p.name,
    brand: [p.brand, p.retailer].filter(Boolean).join(' · '),
    category: p.supplementName ?? p.supplement,
    priceInr: p.priceInr ?? 0,
    packLabel: [p.strength, p.pack].filter(Boolean).join(' · ') || undefined,
    tier: p.yours?.bucket === 'priority' ? 'Priority' : 'Consider',
    role: p.supplementName ?? p.supplement,
    /* The engine's own sentence, not a summary of it. `why` is why this
       supplement is on the list and `gradeFor` is what the evidence is for —
       both come off the wire finished. */
    why: [p.yours?.why, p.gradeFor].filter((x): x is string => Boolean(x)).slice(0, 2),
    image: p.image,
  };
}

export function useFitnessShop(): Shop {
  const store = useStore();
  const bagQ = useBag();
  const save = useSaveBag();
  const place = usePlaceOrder();

  const setBudget = useSetSupplementBudget();

  const items = useMemo(() => {
    const data = store.data;
    if (!data?.personalised) return [];
    const sellable = data.items
      .filter((p) => p.yours && SHORTLISTED.has(p.yours.bucket))
      .filter((p) => p.sellable !== false && typeof p.priceInr === 'number' && !p.rx);
    /* THE KIT'S PICKS, IN THE KIT'S ORDER (priority first). An older API
       build sends no kit; then every shortlisted pack is drawn as before,
       because a shelf that guessed one pick per supplement here would be a
       second copy of kit.ts that drifts from the first. */
    const kit = data.kit;
    if (!kit) return sellable.map(shopItem);
    const byId = new Map(sellable.map((p) => [p.id, p]));
    return kit.picks.map((k) => byId.get(k.productId)).filter((p): p is StoreProduct => Boolean(p)).map(shopItem);
  }, [store.data]);

  const kit = store.data?.kit ?? null;
  const budget = store.data?.personalised && kit ? {
    label: 'Your supplement budget, a month',
    valueInr: kit.budgetInr,
    totalInr: kit.totalInr,
    dropped: kit.dropped.map((d) => (d.cheapestInr !== null
      ? `${d.name} — back in from ₹${d.cheapestInr.toLocaleString('en-IN')} more`
      : d.name)),
    note: kit.note,
    unsetHint: 'No number set — the best-quality pack of each is shown. Set one and the kit is fitted inside it.',
    saving: setBudget.isPending,
    onChange: (v: number | null) => setBudget.mutate(v),
  } : undefined;

  const lines = () => (bagQ.data?.lines ?? []).map((l) => ({ id: l.id, qty: l.qty }));
  const put = (next: { id: string; qty: number }[]) => save.mutate(next.filter((l) => l.qty > 0));

  const bagLines = (bagQ.data?.lines ?? [])
    .filter((l) => !l.gone)
    .map((l) => ({
      id: l.id,
      name: l.name ?? l.supplement ?? 'Supplement',
      priceInr: l.priceInr ?? 0,
      qty: l.qty,
      image: l.image,
      category: l.supplement ?? 'supplement',
    }));

  return {
    key: 'supplements',
    screens: { shelf: SHOPS.supplements.shelf.path, bag: SHOPS.supplements.bag.path },
    back: { path: '/ecommerce/store', label: 'Personalized Store' },
    title: 'Supplements',
    line: 'One pack for each supplement the engine matched to you — priority and consider, nothing below them — inside a monthly number you set. Every price is the shelf’s own.',
    from: { label: 'Training Profile', path: '/fitness/profile' },
    hubName: 'Fitness',
    hubPath: '/fitness',

    items,
    budget,
    countLabel: 'in your kit',
    isLoading: store.isLoading || bagQ.isLoading,
    isError: store.isError,
    emptyTitle: store.data && !store.data.personalised ? 'Not matched to you yet'
      : kit && kit.dropped.length > 0 ? 'Your number reaches nothing yet'
      : 'Nothing on the shortlist',
    emptyHint: store.data && !store.data.personalised
      ? 'Fill in your training profile and this shelf is matched to you.'
      : kit && kit.dropped.length > 0
        ? 'Every pack the engine matched costs more than the monthly number above. Raise it, or clear it, and the kit comes back.'
        : 'The engine has nothing at priority or consider for you right now. The full shelf is in the Fitness hub.',
    /* Not personalised yet → the profile that would personalise it. Empty with
       a profile on file → the full shelf, which is what the hint already
       points at and what somebody in that state actually wants. */
    emptyTo: store.data && !store.data.personalised
      ? { label: 'Fill in your Training Profile', path: '/fitness/profile' }
      : kit && kit.dropped.length > 0 ? undefined
      : { label: 'Open the Fitness shelf', path: '/fitness/store' },
    /* THE STORE TAKES NO CUT, and that sentence belongs to the hub that means
       it. Quoted rather than re-worded so the two cannot drift. */
    note: 'Verified in India · we take no cut. Prescription items live on the Fitness shelf.',

    bag: bagQ.data ? {
      lines: bagLines,
      count: bagLines.reduce((n, l) => n + l.qty, 0),
      totalInr: bagQ.data.totalInr,
      removed: bagQ.data.unsellable,
    } : null,
    isSaving: save.isPending,
    qtyOf: (id: string) => bagQ.data?.lines.find((l) => l.id === id)?.qty ?? 0,
    add: (id: string) => {
      const cur = lines();
      const at = cur.findIndex((l) => l.id === id);
      put(at === -1 ? [...cur, { id, qty: 1 }] : cur.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l)));
    },
    remove: (id: string) => put(lines().map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))),
    clear: () => put([]),

    /* THE METHOD IS ACCEPTED AND NOT USED, because POST /fitness/store/orders
       charges the city wallet and takes no method. Saying so here rather than
       silently dropping it is what lets the city cart hide the card option
       instead of offering one it cannot honour. */
    pay: (_method: PayMethodChoice, done: () => void) => place.mutate(
      { items: lines() },
      { onSuccess: done },
    ),
    payPending: place.isPending,
    payError: place.isError ? (serverSaid(place.error) ?? 'Payment failed.') : null,
  };
}
