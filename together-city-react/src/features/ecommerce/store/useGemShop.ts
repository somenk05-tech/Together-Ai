import { useMemo } from 'react';
import { useAstroGemstones, useGemCart, useGemCheckout, useUnlockGem } from '@/features/astrology/hooks';
import type { GemRecommendation } from '@/features/astrology/api';
import { payError } from '@/features/financial/api';
import { SHOPS } from '../shelves';
import type { PayMethodChoice, Shop, ShopItem } from './types';

/**
 * ── THE GEM BENCH, AS A SHOP ────────────────────────────────────────────────
 *
 * THE ONE SHELF WHERE BUYING IS A DECISION RATHER THAN A TAP. A stone has no
 * price until three things are known: the carat weight, which comes off body
 * weight; the metal, which is priced by the gram; and whether it is a ring, a
 * pendant or loose. So no tile here carries Add to bag — each carries "Design &
 * lock", which opens that stone's studio, and the commission joins the cart at
 * the price the studio settled.
 *
 * WHAT A PRICE MEANS ON THIS SHELF. `fromInr`/`toInr` is the range for the
 * stone AT the citizen's own carat weight — the only figure anybody can act on
 * — and it is NULL when no body weight is on file. Null is shown as no price,
 * never as an average: the difference between a ₹50,000 stone and a ₹90,000 one
 * is exactly the thing an average would hide.
 *
 * ONE OF A KIND, so the cart shows Remove rather than ±. Two of a commission is
 * a second commission, at a second price, from a second decision.
 */

function shopItem(rec: GemRecommendation): ShopItem {
  const from = rec.fromInr;
  return {
    id: rec.gem.id,
    name: rec.gem.name,
    brand: `${rec.gem.planet} · ${rec.role}`,
    category: 'gemstone',
    /* Zero is the honest rendering of "no figure yet": the tile prints the
       range where there is one and nothing at all where there is not, and
       `design` is what the citizen presses either way. */
    priceInr: from ?? 0,
    keepLabel: from && rec.toInr && rec.toInr !== from ? `to ${`₹${rec.toInr.toLocaleString('en-IN')}`}` : undefined,
    packLabel: rec.weight ? `${rec.weight.carats} carats · ${rec.weight.ratti} ratti` : 'Carat weight needs your body weight',
    tier: rec.priority === 'must-have' ? 'Wear first' : rec.priority === 'strong' ? 'Strong' : 'Optional',
    role: rec.rank === 1 ? 'First stone' : rec.role,
    why: rec.reasons.slice(0, 2),
    image: rec.gem.image,
    imageAlt: rec.gem.imageAlt,
    design: { label: 'Design & lock', path: `/astrology/gemstones/${rec.gem.id}/design` },
  };
}

export function useGemShop(): Shop {
  const gems = useAstroGemstones();
  const cart = useGemCart();
  const unlock = useUnlockGem();
  const checkout = useGemCheckout();

  const items = useMemo(
    () => (gems.data?.needsProfile ? [] : (gems.data?.recommendations ?? []).map(shopItem)),
    [gems.data],
  );

  const lines = (cart.data?.lines ?? []).map((l) => ({
    id: l.gemId,
    name: `${l.name} · ${l.spec}`,
    priceInr: l.totalInr,
    qty: 1,
    image: l.image,
    imageAlt: l.imageAlt,
    category: 'gemstone',
  }));

  return {
    key: 'gemstones',
    screens: { shelf: SHOPS.gemstones.shelf.path, bag: SHOPS.gemstones.bag.path },
    back: { path: '/ecommerce/store', label: 'Personalized Store' },
    title: 'Gemstones',
    line: 'The stones your chart asks for, in the order it asks for them. Each one is cut and set to order, so the price is settled in the studio rather than on the shelf.',
    from: { label: 'Astrology Profile', path: '/profile/astrology' },
    hubName: 'Astrology Zone',
    hubPath: '/astrology',

    items,
    isLoading: gems.isLoading || cart.isLoading,
    isError: gems.isError,
    emptyTitle: gems.data?.needsProfile ? 'Your birth details first' : 'No stones yet',
    emptyHint: gems.data?.needsProfile
      ? 'A stone is read off a chart, and there is no chart until the birth date, time and place are on file.'
      : 'Nothing is recommended for your chart at the moment.',
    /* Only when the chart is the thing missing. "Nothing recommended for your
       chart" is the city's answer to a chart it HAS read, and a button to the
       profile there would be telling somebody to fix something that is not
       broken. */
    emptyTo: gems.data?.needsProfile
      ? { label: 'Add your birth details', path: '/profile/astrology' }
      : undefined,
    /* THE SHELF'S OWN DISCLAIMER, quoted from the server rather than written
       here — an astrological claim is the one sentence this district may not
       paraphrase. The weight caveat is added only when it is true. */
    note: [
      gems.data?.disclaimer,
      gems.data?.weightUnknown ? 'No body weight on file, so no carat weight and no price yet — the studio asks for it.' : null,
    ].filter(Boolean).join(' ') || undefined,

    bag: cart.data ? {
      lines,
      count: cart.data.count,
      totalInr: cart.data.totalInr,
      removed: cart.data.dropped,
    } : null,
    fixedQty: true,
    isSaving: unlock.isPending,
    qtyOf: (id: string) => (lines.some((l) => l.id === id) ? 1 : 0),
    /* Locking happens in the studio, which is the only place the three
       decisions a price needs are actually made. */
    add: () => undefined,
    remove: (id: string) => unlock.mutate(id),
    clear: () => { for (const l of lines) unlock.mutate(l.id); },

    pay: (method: PayMethodChoice, done: () => void) => checkout.mutate(method, { onSuccess: done }),
    payPending: checkout.isPending,
    payError: checkout.isError ? payError(checkout.error) : null,
  };
}
