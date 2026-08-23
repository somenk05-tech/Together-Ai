import { useMemo } from 'react';
import {
  useBagActions, useBeautyRoutine, usePlaceBeautyOrder,
  type CategoryPlan, type ProductRoutineStep, type RoutinePick,
} from '@/features/beauty/api';
import { payError } from '@/features/financial/api';
import { SHOPS, shelfName } from '../shelves';
import type { PayMethodChoice, Shop, ShopItem } from './types';

/**
 * ── THE BEAUTY SHELF, AS A SHOP ─────────────────────────────────────────────
 *
 * The shortlist is `plan.face.picks` + hair + body — the products the planner
 * actually chose against the budget, and nothing else on the shelf. Upgrades,
 * left-outs and the steps the citizen said they already own are all deliberately
 * absent: this is the shop window for what was picked, not the catalogue.
 *
 * THE PICTURES COME FROM THE OTHER HALF OF THE SAME RESPONSE. `RoutinePick`
 * carries the money and the pack; `ProductRoutineStep` carries the photograph,
 * the brand and the step it belongs to, and the two are joined by `productId`.
 * A pick whose step is missing still ships — with the category mark instead of
 * a photograph, which is the beauty hub's own rule for a shot that will not
 * load, and a good deal better than dropping a product somebody is being
 * charged for.
 *
 * ONE BAG, AND IT IS THE ONE THE CITY ALREADY HAD. This does not open a second:
 * `useBagActions` is the beauty hub's server-held bag, so something added here
 * is in the bag on the routine page and at /beauty/orders, and paying here
 * empties all three. A shop with a bag of its own would be the two-bags bug
 * that `one-bag.test.ts` exists to prevent, rebuilt one floor up.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function itemsFrom(plans: CategoryPlan[], steps: Map<string, ProductRoutineStep>): ShopItem[] {
  const seen = new Set<string>();
  const out: ShopItem[] = [];
  for (const plan of plans) {
    if (plan.skipped) continue;
    for (const pick of plan.picks) {
      if (seen.has(pick.productId)) continue;
      seen.add(pick.productId);
      out.push(shopItem(pick, steps.get(pick.productId)));
    }
  }
  return out;
}

function shopItem(pick: RoutinePick, step?: ProductRoutineStep): ShopItem {
  return {
    id: pick.productId,
    name: pick.name,
    brand: step?.brand,
    category: step?.category ?? pick.role,
    priceInr: pick.priceInr,
    keepLabel: pick.monthlyInr > 0 ? `≈ ${rupees(pick.monthlyInr)}/month to keep` : undefined,
    packLabel: [pick.packLabel, pick.lastsLabel].filter(Boolean).join(' · ') || undefined,
    tier: pick.tier === 'high-value' ? 'High value' : pick.tier === 'essential' ? 'Essential' : 'Optional',
    role: pick.role,
    why: pick.reasons?.slice(0, 2),
    image: step?.image,
    imageAlt: step?.imageAlt,
  };
}

export function useBeautyShop(): Shop {
  const routine = useBeautyRoutine();
  const bagged = useBagActions();
  const place = usePlaceBeautyOrder();

  const items = useMemo(() => {
    const data = routine.data;
    if (!data?.plan) return [];
    const steps = new Map<string, ProductRoutineStep>();
    for (const band of data.routines) {
      for (const step of band.steps) if (!step.owned) steps.set(step.productId, step);
    }
    return itemsFrom([data.plan.face, data.plan.hair, data.plan.body], steps);
  }, [routine.data]);

  const bag = bagged.bag ?? null;

  return {
    key: 'beauty',
    screens: { shelf: SHOPS.beauty.shelf.path, bag: SHOPS.beauty.bag.path },
    back: { path: '/ecommerce/store', label: 'Personalized Store' },
    title: shelfName('beauty', '/beauty/routine'),
    line: 'The products your routine chose, and only those. Prices are the shelf’s own — nothing is charged until you pay.',
    from: { label: 'Skin & Hair Profile', path: '/beauty/profile' },
    hubName: 'Beauty Market',
    hubPath: '/beauty',

    items,
    isLoading: routine.isLoading || bagged.isLoading,
    isError: routine.isError,
    /* NOT "nothing found". The routine is not generated until a budget exists,
       and saying so is the difference between a shelf that looks broken and one
       that tells somebody the single thing they have to do. */
    emptyTitle: routine.data?.needsBudget ? 'Set a budget first' : 'No routine yet',
    emptyHint: routine.data?.needsBudget
      ? 'Your routine is built against what you are willing to spend, so nothing is chosen until you have said a number.'
      : 'Fill in your skin and hair profile and the routine builds itself from it.',
    /* TWO REASONS, TWO DESTINATIONS. The budget is set on the routine page and
       the profile is filled in the profile — sending both to one of them would
       be a button that is right half the time. */
    emptyTo: routine.data?.needsBudget
      ? { label: 'Set your budget', path: '/beauty/routine' }
      : { label: 'Fill in your Skin & Hair Profile', path: '/beauty/profile' },

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
