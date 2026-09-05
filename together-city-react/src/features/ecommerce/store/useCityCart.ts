import { useState } from 'react';
import { useBagActions, usePlaceBeautyOrder } from '@/features/beauty/api';
import { useBag, usePlaceOrder, useSaveBag, serverSaid } from '@/api/store.api';
import { useGemCart, useGemQuote, useUnlockGem } from '@/features/astrology/hooks';
import { payError } from '@/features/financial/api';
import { SHOPS } from '../shelves';
import type { PayMethodChoice, ShopBagLine } from './types';

/**
 * ── ONE CART, THREE TILLS ───────────────────────────────────────────────────
 *
 * The owner's brief, 22 Aug: "a global cart system where people can add products
 * from multiple places and order once", and — asked directly — "keep individual
 * carts and also a cross-hub cart in e-commerce".
 *
 * SO NOTHING IS REPLACED AND NOTHING IS COPIED. This is a VIEW over the bags
 * the city already has: the Beauty bag, the Fitness store's bag and the gem
 * bench's locked commissions, each still held by the hub that owns it, each
 * still the same bag on its own checkout. Something added in the Beauty Market
 * appears here a moment later because it IS the Beauty bag — not a mirror of
 * it. A fourth copy of a bag is how a citizen ends up filling two and paying
 * for one, which is `one-bag.test.ts`'s lesson written across hubs instead of
 * within one.
 *
 * "ORDER ONCE" IS ONE AUTHORISATION AND THREE ORDERS, and this is the part that
 * has to be said out loud rather than smoothed over. There is no cross-hub order
 * in the API — each hub's checkout is its own endpoint with its own rules — so
 * pressing Pay here authorises the total once and then places each shop's order
 * in turn. THE ORDERS CAN DISAGREE: if the second fails, the first has already
 * been charged. The screen reports every shop by name with what happened to it,
 * and a shop that failed keeps its bag intact so it can be tried again. A single
 * "something went wrong" over three separate charges would be the worst
 * sentence in the application.
 *
 * WALLET ONLY, because that is what is true. `POST /fitness/store/orders`
 * charges the city wallet whatever method it is handed, so a card option on
 * this sheet would be a promise kept for two thirds of the total. Each hub's
 * own checkout still offers both where its endpoint does.
 *
 * TWO CARTS ARE DELIBERATELY ABSENT. The grocery list has no prices and no
 * order endpoint — it is a list, not a shop. The pet cart lives in the browser
 * and has no till behind it at all. Neither is shown here, because a line in a
 * cart with a Pay button above it is a promise to charge for it.
 */

export interface CartSection {
  key: string;
  title: string;
  hubName: string;
  shelfPath: string;
  lines: ShopBagLine[];
  count: number;
  totalInr: number;
  /** A commission is one of a kind — Remove, not ±. */
  fixedQty?: boolean;
  isSaving: boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
}

export interface PayOutcome { key: string; title: string; ok: boolean; message: string }

export interface CityCart {
  sections: CartSection[];
  count: number;
  totalInr: number;
  isLoading: boolean;
  paying: boolean;
  outcomes: PayOutcome[];
  payAll: (method: PayMethodChoice) => void;
}

export function useCityCart(): CityCart {
  const beauty = useBagActions();
  const beautyPlace = usePlaceBeautyOrder();

  const fitBag = useBag();
  const fitSave = useSaveBag();
  const fitPlace = usePlaceOrder();

  const gemCart = useGemCart();
  const gemUnlock = useUnlockGem();
  const gemQuote = useGemQuote();

  const [outcomes, setOutcomes] = useState<PayOutcome[]>([]);
  const [paying, setPaying] = useState(false);

  const fitLines = () => (fitBag.data?.lines ?? []).map((l) => ({ id: l.id, qty: l.qty }));
  const fitPut = (next: { id: string; qty: number }[]) => fitSave.mutate(next.filter((l) => l.qty > 0));

  const sections: CartSection[] = [];

  const bBag = beauty.bag;
  if (bBag && bBag.count > 0) {
    sections.push({
      key: 'beauty',
      title: 'Beauty',
      hubName: 'Beauty',
      shelfPath: SHOPS.beauty.shelf.path,
      lines: bBag.lines,
      count: bBag.count,
      totalInr: bBag.totalInr,
      isSaving: beauty.isSaving,
      add: beauty.add,
      remove: beauty.remove,
    });
  }

  const fLines = (fitBag.data?.lines ?? [])
    .filter((l) => !l.gone)
    .map((l) => ({
      id: l.id,
      name: l.name ?? l.supplement ?? 'Supplement',
      priceInr: l.priceInr ?? 0,
      qty: l.qty,
      image: l.image,
      category: l.supplement ?? 'supplement',
    }));
  if (fLines.length > 0) {
    sections.push({
      key: 'supplements',
      title: 'Supplements',
      hubName: 'Fitness',
      shelfPath: SHOPS.supplements.shelf.path,
      lines: fLines,
      count: fLines.reduce((n, l) => n + l.qty, 0),
      totalInr: fitBag.data?.totalInr ?? 0,
      isSaving: fitSave.isPending,
      add: (id: string) => {
        const cur = fitLines();
        const at = cur.findIndex((l) => l.id === id);
        fitPut(at === -1 ? [...cur, { id, qty: 1 }] : cur.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l)));
      },
      remove: (id: string) => fitPut(fitLines().map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))),
    });
  }

  const gLines = (gemCart.data?.lines ?? []).map((l) => ({
    id: l.gemId,
    name: `${l.name} · ${l.spec}`,
    priceInr: l.totalInr,
    qty: 1,
    image: l.image,
    imageAlt: l.imageAlt,
    category: 'gemstone',
  }));
  if (gLines.length > 0) {
    sections.push({
      key: 'gemstones',
      title: 'Gemstones',
      hubName: 'Astrology',
      shelfPath: SHOPS.gemstones.shelf.path,
      lines: gLines,
      count: gemCart.data?.count ?? gLines.length,
      totalInr: gemCart.data?.totalInr ?? 0,
      fixedQty: true,
      isSaving: gemUnlock.isPending,
      add: () => undefined,
      remove: (id: string) => gemUnlock.mutate(id),
    });
  }

  const payAll = (method: PayMethodChoice) => {
    setPaying(true);
    setOutcomes([]);
    /* SEQUENTIAL, NOT PARALLEL, and the reason is the wallet. Three charges
       fired at once against one balance is three reads of the same number, and
       the third can be authorised against money the first two have spent. In a
       row, each one sees what the last one left. */
    const run = async () => {
      const out: PayOutcome[] = [];
      for (const section of sections) {
        try {
          if (section.key === 'beauty') {
            await beautyPlace.mutateAsync({
              items: section.lines.map((l) => ({ id: l.id, name: l.name, priceInr: l.priceInr, qty: l.qty })),
              method,
            });
          } else if (section.key === 'supplements') {
            await fitPlace.mutateAsync({ items: section.lines.map((l) => ({ id: l.id, qty: l.qty })) });
          } else {
            // Gemstones are quoted, not charged (owner, 5 Sep).
            await gemQuote.mutateAsync();
          }
          out.push({ key: section.key, title: section.title, ok: true, message: section.key === 'gemstones' ? 'Quote requested — nothing charged.' : 'Ordered.' });
        } catch (err) {
          out.push({
            key: section.key,
            title: section.title,
            ok: false,
            message: serverSaid(err) ?? payError(err),
          });
        }
      }
      setOutcomes(out);
      setPaying(false);
    };
    void run();
  };

  return {
    sections,
    count: sections.reduce((n, s) => n + s.count, 0),
    totalInr: sections.reduce((n, s) => n + s.totalInr, 0),
    isLoading: beauty.isLoading || fitBag.isLoading || gemCart.isLoading,
    paying,
    outcomes,
    payAll,
  };
}
