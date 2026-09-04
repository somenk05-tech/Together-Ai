import { useMemo } from 'react';
import { useBagActions, useBeautyProducts, usePlaceBeautyOrder, type RecommendedProduct } from '@/features/beauty/api';
import { useBag, usePlaceOrder, useSaveBag, useStore, serverSaid, type StoreProduct } from '@/api/store.api';
import { useCatalogue } from '@/features/pets/api';
import { payError } from '@/features/financial/api';
import { AISLES } from '../shelves';
import type { PayMethodChoice, Shop, ShopItem } from './types';

/**
 * ── THE OPEN MARKET'S AISLES: EVERYTHING, NOT A SHORTLIST ───────────────────
 *
 * Owner, 22 Aug: "create a separate store for open market where each category
 * has all the products for the user to see."
 *
 * So these are the same storefront as the Personalized Store's shops and the
 * opposite selection. The shortlist shops answer "what should I buy" with five
 * things; these answer "what is there" with the whole shelf — 100-odd beauty
 * products, the fitness catalogue, 184 pet rows — and nothing is ranked,
 * because the card that opens them promises exactly that.
 *
 * WHICH IS WHY THEY ARE GROUPED. A wall of 184 tiles is a catalogue somebody
 * scrolls past, not a shop they browse, so each aisle carries the shelf's own
 * grouping — the beauty sheet's Skincare / Hair Care / Body Care, the fitness
 * store's own aisles, the pet catalogue's categories — and the chips filter on
 * it. The grouping is never invented here; it is a field on the row.
 *
 * ── THE ONE THING THIS FILE IS CAREFUL ABOUT ────────────────────────────────
 *
 * A VERDICT MUST NOT BECOME AN ABSENCE. `store.api.ts` is emphatic that a
 * missing `yours` badge means one of two things and they must never look alike:
 * "no opinion" or "we could not reach your health data". On the SHORTLIST that
 * cannot bite, because everything shown is something the engine chose. On an
 * open shelf it can: a product the engine refused FOR THIS CITIZEN, shown on a
 * plain tile with an Add button and nothing else, reads as approval.
 *
 * So the supplement aisle carries the verdict on every tile that has one —
 * including "Not for you" — with the engine's own sentence under it, and
 * prescription rows stay out of a self-service shop entirely. The full
 * reasoning, the upper limits and the "test first" flags live on the Fitness
 * shelf, and every tile here says which room that is.
 *
 * THE PET AISLE HAS NO TILL, and that is not an oversight. The pet cart lives
 * in the browser and there is no order endpoint behind it, so these tiles open
 * the product's own page in Pet Care rather than pretending to a bag. A shop
 * that takes an order it cannot place is worse than a shelf that says so.
 */

/** Aisle counts from the items themselves — never a second list to drift. */
function groupsOf(items: ShopItem[], labels: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const i of items) if (i.group) counts.set(i.group, (counts.get(i.group) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }));
}

/* ── SKIN & HAIR ─────────────────────────────────────────────────────────── */

function beautyItem(p: RecommendedProduct): ShopItem {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    priceInr: p.priceInr,
    tier: p.matched ? 'Matched to you' : undefined,
    role: p.category,
    /* The shelf's own sentence about the product, then the shelf's own
       sentence about why it matched. Both arrive finished. */
    why: [p.keyIngredient, p.primaryReasons[0]].filter(Boolean).slice(0, 2),
    image: p.image,
    imageAlt: p.imageAlt,
    group: p.group,
  };
}

export function useBeautyMarketShop(): Shop {
  const products = useBeautyProducts();
  const bagged = useBagActions();
  const place = usePlaceBeautyOrder();

  const items = useMemo(() => (products.data?.products ?? []).map(beautyItem), [products.data]);
  const bag = bagged.bag ?? null;

  return {
    key: 'skin-hair',
    screens: { shelf: AISLES['skin-hair'].shelf.path, bag: AISLES['skin-hair'].bag.path },
    back: { path: '/ecommerce/market', label: 'Open Market' },
    title: 'Skin & Hair',
    line: 'Every product on the Beauty shelf, nothing ranked. What matched your profile is marked; the rest is simply here.',
    hubName: 'Beauty',
    hubPath: '/beauty',

    items,
    groups: groupsOf(items, new Map()),
    countLabel: 'on this shelf',
    isLoading: products.isLoading || bagged.isLoading,
    isError: products.isError,
    emptyTitle: 'The shelf is empty',
    emptyHint: 'Nothing is listed in Beauty at the moment.',
    /* THE SHELF'S OWN NOTICES, and they are the reason this line exists: the
       sensitivity rule and a health condition can each take products OFF this
       shelf, and a shorter shelf with no explanation reads as a smaller shop. */
    note: [products.data?.allergyNotice?.sentence, products.data?.conditionNotice?.sentence]
      .filter(Boolean).join(' ') || undefined,

    bag: bag ? { lines: bag.lines, count: bag.count, totalInr: bag.totalInr, removed: bag.removed } : null,
    isSaving: bagged.isSaving,
    qtyOf: bagged.qtyOf,
    add: bagged.add,
    remove: bagged.remove,
    clear: bagged.clear,
    pay: (method: PayMethodChoice, done: () => void) => place.mutate(
      {
        items: (bag?.lines ?? []).map((l) => ({ id: l.id, name: l.name, priceInr: l.priceInr, qty: l.qty })),
        method,
      },
      { onSuccess: done },
    ),
    payPending: place.isPending,
    payError: place.isError ? payError(place.error) : null,
  };
}

/* ── SUPPLEMENTS ─────────────────────────────────────────────────────────── */

const VERDICT: Record<string, string> = {
  priority: 'Priority for you',
  consider: 'Consider',
  optional: 'Optional',
  'not-recommended': 'Not for you',
};

function supplementItem(p: StoreProduct, aisleOf: Map<string, string>): ShopItem {
  return {
    id: p.id,
    name: p.name,
    brand: [p.brand, p.retailer].filter(Boolean).join(' · '),
    category: p.supplementName ?? p.supplement,
    priceInr: p.priceInr ?? 0,
    packLabel: [p.strength, p.pack].filter(Boolean).join(' · ') || undefined,
    /* THE VERDICT, WHERE THERE IS ONE. Absent is absent — see the note at the
       top of this file for why that distinction is the careful part. */
    tier: p.yours ? VERDICT[p.yours.bucket] : undefined,
    role: p.supplementName ?? p.supplement,
    why: [p.yours?.why, p.gradeFor].filter((x): x is string => Boolean(x)).slice(0, 2),
    image: p.image,
    group: aisleOf.get(p.supplement) ?? 'Other',
  };
}

export function useSupplementsMarketShop(): Shop {
  const store = useStore();
  const bagQ = useBag();
  const save = useSaveBag();
  const place = usePlaceOrder();

  const items = useMemo(() => {
    const data = store.data;
    if (!data) return [];
    /* The store's own aisles, inverted: supplement id → the aisle it stands in.
       A row whose supplement is in no aisle lands in "Other" rather than
       disappearing, because a product nobody can find is worse than one filed
       loosely. */
    const aisleOf = new Map<string, string>();
    for (const aisle of data.aisles ?? []) {
      for (const supp of aisle.supplements ?? []) aisleOf.set(supp, aisle.title);
    }
    return data.items
      .filter((p) => p.sellable !== false && typeof p.priceInr === 'number' && !p.rx)
      .map((p) => supplementItem(p, aisleOf));
  }, [store.data]);

  const lines = () => (bagQ.data?.lines ?? []).map((l) => ({ id: l.id, qty: l.qty }));
  const put = (next: { id: string; qty: number }[]) => save.mutate(next.filter((l) => l.qty > 0));
  const bagLines = (bagQ.data?.lines ?? []).filter((l) => !l.gone).map((l) => ({
    id: l.id,
    name: l.name ?? l.supplement ?? 'Supplement',
    priceInr: l.priceInr ?? 0,
    qty: l.qty,
    image: l.image,
    category: l.supplement ?? 'supplement',
  }));

  return {
    key: 'supplements-market',
    screens: { shelf: AISLES.supplements.shelf.path, bag: AISLES.supplements.bag.path },
    back: { path: '/ecommerce/market', label: 'Open Market' },
    title: 'Supplements',
    line: 'The whole fitness shelf, nothing ranked. Where the engine has a verdict for you it is on the tile — including when the verdict is no.',
    hubName: 'Fitness',
    hubPath: '/fitness',

    items,
    groups: groupsOf(items, new Map()),
    countLabel: 'on this shelf',
    isLoading: store.isLoading || bagQ.isLoading,
    isError: store.isError,
    emptyTitle: 'The shelf is empty',
    emptyHint: 'Nothing is listed in the fitness store at the moment.',
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
    pay: (_method: PayMethodChoice, done: () => void) => place.mutate({ items: lines() }, { onSuccess: done }),
    payPending: place.isPending,
    payError: place.isError ? (serverSaid(place.error) ?? 'Payment failed.') : null,
  };
}

/* ── PETS ────────────────────────────────────────────────────────────────── */

const PET_AISLE: Record<string, string> = {
  food: 'Food', 'vet-diet': 'Vet diets', treats: 'Treats', litter: 'Litter',
  walk: 'Walking', toys: 'Toys', grooming: 'Grooming', home: 'Home',
  wellness: 'Wellness', training: 'Training', cleaning: 'Cleaning', fashion: 'Coats & collars',
};

export function usePetMarketShop(): Shop {
  const catalogue = useCatalogue({ species: 'both', sort: 'relevance' });

  const items = useMemo<ShopItem[]>(() => (catalogue.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: [p.brand, p.retailer].filter(Boolean).join(' · '),
    category: p.category,
    /* Null is a real answer on this catalogue — a row whose price nobody has
       verified prints no price rather than a guess. */
    priceInr: p.priceFrom ?? 0,
    packLabel: p.packSizes[0] ?? undefined,
    tier: p.vetGuidance ? 'Ask your vet' : undefined,
    role: PET_AISLE[p.category] ?? p.category,
    why: [p.keyIngredients, p.specs].filter((x): x is string => Boolean(x)).slice(0, 1),
    image: p.imageUrl ?? undefined,
    group: PET_AISLE[p.category] ?? 'Other',
    /* NO ADD BUTTON: the pet cart lives in the browser and has no order
       endpoint behind it, so the tile opens the product's own page in Pet Care
       where the cart it belongs to actually is. */
    design: { label: 'Open in Pets', path: `/pets/shop/${p.id}` },
  })), [catalogue.data]);

  return {
    key: 'pets',
    screens: { shelf: AISLES.pets.shelf.path, bag: AISLES.pets.shelf.path },
    back: { path: '/ecommerce/market', label: 'Open Market' },
    title: 'Pet shop',
    line: 'The whole pet catalogue — food, treats, litter, walking, grooming and the rest, exactly as Pets lists it.',
    hubName: 'Pets',
    hubPath: '/pets',

    items,
    groups: groupsOf(items, new Map()),
    countLabel: 'on this shelf',
    /* The pet catalogue is a bundled JSON file rather than a request — it is
       already in the chunk by the time this renders, so there is nothing to
       wait for and nothing that can be refused. `loading`/`error` are read
       anyway, because the day it becomes a fetch this screen should not be the
       one that has to be remembered. */
    isLoading: catalogue.loading,
    isError: Boolean(catalogue.error),
    emptyTitle: 'The catalogue is empty',
    emptyHint: 'Nothing is listed in Pets at the moment.',
    /* NO TILL, SAID OUT LOUD. The bag being null is what hides the Bag link and
       the checkout bar; this sentence is what explains the absence. */
    blocked: 'This aisle is for looking — every tile opens the product in Pets, where the basket lives.',

    bag: null,
    isSaving: false,
    qtyOf: () => 0,
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
    pay: (_m: PayMethodChoice, done: () => void) => done(),
    payPending: false,
    payError: null,
  };
}
