import { useMemo, useState } from 'react';
import { useGemCatalog, useGemCart, useGemCheckout, useLockGem, useUnlockGem } from '@/features/astrology/hooks';
import type { CounterStone } from '@/features/astrology/api';
import { payError } from '@/features/financial/api';
import { AISLES } from '../shelves';
import type { PayMethodChoice, Shop, ShopItem } from './types';

/**
 * ── THE GEM COUNTER, ON THE OPEN MARKET FLOOR ───────────────────────────────
 *
 * Owner, 22 Aug: "create a gemstone store with all the gemstones in the
 * database … prices move based on carats chosen by the user."
 *
 * THIS IS THE OPPOSITE SHELF FROM `useGemShop`, AND THE DIFFERENCE IS THE WHOLE
 * DESIGN. That one is a prescription: five stones read off a chart, each at the
 * weight the tradition works out from this body, and no price at all until a
 * body weight is on file. This one is a counter: thirty stones in the
 * catalogue's own order, nothing ranked, no chart consulted, and the weight
 * chosen by the person buying. Which is exactly what the two floors of this
 * district already promise — "the shelves that read your profiles" against
 * "every category, nothing ranked for you".
 *
 * ── WHAT THE CITIZEN MAY CHOOSE, AND WHAT THEY MAY NOT ──────────────────────
 *
 * The carats, inside the range the stone is customarily worn at. Not outside
 * it: the server's weight model is explicit that the range "is the constraint,
 * and it is never overridden", and it says so because the naive version — one
 * body-weight rule for all thirty stones — once prescribed a NINE-CARAT BLUE
 * SAPPHIRE, which is the classic warning in every account of that stone. The
 * slider spans `fromCt` to `toCt` and the server holds anything outside them at
 * the nearest end whatever this file sends.
 *
 * And the grade, which is what the spread between the stone's two per-carat
 * prices actually IS — ruby runs ₹8,000 to ₹25,000 a carat, and that is one
 * stone at two qualities rather than two stones.
 *
 * ── THE NUMBER ON THE TILE IS A QUOTE, NOT THE CHARGE ───────────────────────
 *
 * Carats times the per-carat rate, interpolated by grade — the same two lines
 * the studio has always run to move its own price with its own slider, and the
 * same arithmetic `priceAtWeight` runs on the server. It has to be computed
 * here because it changes as a slider moves and a round trip per pixel is not a
 * shop. It is never what anybody pays: the till reprices every line from the
 * catalogue at read time, which is the rule the gem cart was built on because
 * gold moves daily. `the-counter-prices-what-it-sells.test.ts` asserts the two
 * formulas are the same one.
 *
 * ── LOOSE, UNSET ────────────────────────────────────────────────────────────
 *
 * A counter sells the stone. Metal, mount, cut and finger are four more
 * decisions and they belong in the studio, which already asks them one at a
 * time and judges each against this stone's planet. So every line locked here
 * is `worn: 'loose'`, and the note says where a mounting is chosen.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The studio's own ladder, in words. A tile has no room for two end prices. */
const GRADE_WORD = (g: number): string =>
  g <= 20 ? 'Everyday' : g <= 45 ? 'Good' : g <= 70 ? 'Fine' : g <= 90 ? 'Very fine' : 'The finest we source';

/** What the citizen has set on one stone. Nothing is stored until they buy. */
interface Tuning { carats: number; grade: number }

/**
 * The stone's price at this weight and this quality.
 *
 * TWO PER-CARAT RATES ARE THE QUALITY AXIS, so the grade interpolates BETWEEN
 * them rather than scaling one — which is what the studio does and what the
 * server does at lock time. Rounded once, at the end.
 */
export function quoteInr(stone: CounterStone, t: Tuning): number {
  const from = t.carats * stone.gem.perCaratMinInr;
  const to = t.carats * stone.gem.perCaratMaxInr;
  return Math.round(from + ((to - from) * t.grade) / 100);
}

export function useGemCounterShop(): Shop {
  const catalog = useGemCatalog();
  const cart = useGemCart();
  const lock = useLockGem();
  const unlock = useUnlockGem();
  const checkout = useGemCheckout();

  /* ONE MAP FOR THIRTY TILES rather than state per card. A tile that has not
     been touched is not in it, and reads its own opening weight off the shelf —
     so nothing here has to be seeded when the catalogue lands. */
  const [tuned, setTuned] = useState<Record<string, Tuning>>({});
  const set = (id: string, patch: Partial<Tuning>, base: Tuning) =>
    setTuned((prev) => ({ ...prev, [id]: { ...base, ...patch } }));

  const inBag = useMemo(
    () => new Map((cart.data?.lines ?? []).map((l) => [l.gemId, l])),
    [cart.data],
  );

  /* READ INLINE RATHER THAN THROUGH A HELPER, and that is the lint rule being
     right rather than being appeased. A `tuning(s)` closure is rebuilt every
     render, so naming it in the dependency array would rebuild thirty tiles on
     every keystroke anywhere on the page and leaving it out would be a memo
     that lies about what it depends on. The two things it actually reads are
     the catalogue and the map. */
  const items = useMemo<ShopItem[]>(() => (catalog.data?.stones ?? []).map((s) => {
    const t: Tuning = tuned[s.gem.id] ?? { carats: s.defaultCt, grade: 35 };
    const line = inBag.get(s.gem.id);
    return {
      id: s.gem.id,
      name: s.gem.name,
      brand: s.gem.traits.slice(0, 3).join(' · '),
      category: 'gemstone',
      priceInr: quoteInr(s, t),
      packLabel: `Worn at ${s.fromCt}–${s.toCt} ct · ${s.fromRatti}–${s.toRatti} ratti`,
      /* The stone's own kind, in the catalogue's words. An upratna is not a
         cheaper sapphire; it is a different stone carrying the same planet, and
         a tile that did not say so would be selling the wrong thing quietly. */
      tier: s.gem.kind === 'primary' ? 'Navaratna' : s.gem.kind === 'substitute' ? 'Substitute' : 'Wellness',
      role: s.gem.substituteFor ? `Stands in for ${s.gem.substituteFor}` : s.gem.planet,
      why: s.gem.traits.length > 0 ? [s.gem.description.split('.')[0] + '.'] : undefined,
      image: s.gem.image,
      imageAlt: s.gem.imageAlt,
      group: s.gem.kind,
      /* WHAT IS ALREADY LOCKED, AT THE WEIGHT IT WAS LOCKED AT — read off the
         cart rather than off the sliders, because the two differ the moment
         somebody moves one and that difference is the thing worth saying. */
      priceNote: line ? `In your bag at ${line.carats} ct · ${rupees(line.totalInr)}` : undefined,
      addLabel: line ? 'Update the bag' : 'Add to bag',
      dials: [
        {
          key: 'carats',
          label: 'Carats',
          value: t.carats,
          min: s.fromCt,
          max: s.toCt,
          /* Quarter carats, because that is what a jeweller cuts and what the
             server rounds to. A slider offering 6.37 ct would be offering a
             stone nobody can make. */
          step: 0.25,
          format: (v: number) => `${v} ct`,
          minLabel: `${s.fromCt} ct`,
          maxLabel: `${s.toCt} ct`,
          onChange: (v: number) => set(s.gem.id, { carats: v }, t),
        },
        {
          key: 'grade',
          label: 'Quality',
          value: t.grade,
          min: 0,
          max: 100,
          step: 5,
          format: GRADE_WORD,
          minLabel: rupees(Math.round(t.carats * s.gem.perCaratMinInr)),
          maxLabel: rupees(Math.round(t.carats * s.gem.perCaratMaxInr)),
          onChange: (v: number) => set(s.gem.id, { grade: v }, t),
        },
      ],
    };
  }), [catalog.data, tuned, inBag]);

  const bagLines = (cart.data?.lines ?? []).map((l) => ({
    id: l.gemId,
    name: `${l.name} · ${l.spec}`,
    priceInr: l.totalInr,
    qty: 1,
    image: l.image,
    imageAlt: l.imageAlt,
    category: 'gemstone',
  }));

  const stoneOf = (id: string) => (catalog.data?.stones ?? []).find((s) => s.gem.id === id) ?? null;

  return {
    key: 'gem-counter',
    screens: { shelf: AISLES.gemstones.shelf.path, bag: AISLES.gemstones.bag.path },
    back: { path: '/ecommerce/market', label: 'Open Market' },
    title: 'Gemstones',
    line: 'Every stone the city sells, at the weight you choose. Nothing here is read off a chart — move the carats and the price moves with them.',
    hubName: 'Astrology Zone',
    hubPath: '/astrology',

    items,
    groups: (catalog.data?.aisles ?? []).map((a) => ({ key: a.key, label: a.label, count: a.count })),
    countLabel: 'in the catalogue',
    isLoading: catalog.isLoading || cart.isLoading,
    isError: catalog.isError,
    emptyTitle: 'The counter is empty',
    emptyHint: 'No stones came back from the catalogue. That is a fault on our side rather than something you have to fix.',
    /* THE DISCLAIMER IS THE SERVER'S, quoted whole — an astrological claim is
       the one sentence this district may not paraphrase. The rest says what
       this shelf is NOT, because a counter standing beside a prescription had
       better be clear which one somebody is looking at. */
    note: [
      catalog.data?.disclaimer,
      'Sold loose and unset — the Astrology Zone studio handles mounting. Nothing here is a recommendation: the stones your own chart calls for are in the Personalized Store.',
    ].filter(Boolean).join(' '),

    bag: cart.data ? {
      lines: bagLines,
      count: cart.data.count,
      totalInr: cart.data.totalInr,
      removed: cart.data.dropped,
    } : null,
    /* A stone is one of a kind. Two of it is a second commission at a second
       weight, which is a second decision — so the bag shows Remove, and the
       shelf's button updates the line rather than adding to a count. */
    fixedQty: true,
    isSaving: lock.isPending || unlock.isPending,
    qtyOf: () => 0,
    add: (id: string) => {
      const s = stoneOf(id);
      if (!s) return;
      const t: Tuning = tuned[s.gem.id] ?? { carats: s.defaultCt, grade: 35 };
      lock.mutate({ gemId: id, worn: 'loose', shape: 'oval', grade: t.grade, carats: t.carats });
    },
    remove: (id: string) => unlock.mutate(id),
    clear: () => { for (const l of bagLines) unlock.mutate(l.id); },

    pay: (method: PayMethodChoice, done: () => void) => checkout.mutate(method, { onSuccess: done }),
    payPending: checkout.isPending,
    payError: checkout.isError ? payError(checkout.error) : null,
  };
}
