/**
 * ── THE AISLES, AND WHAT EACH ONE IS HONEST ABOUT ───────────────────────────
 *
 * Seven aisles, in the order a parent walks them: the things bought weekly
 * first, the things bought once last. Not alphabetical — an alphabet is the
 * right order for thirteen tabs a stranger has to scan, and the wrong one for
 * seven aisles where "what do I run out of" beats "what letter is it".
 *
 * The `note` on an aisle is what that aisle cannot promise, and it is printed
 * at the head of the aisle rather than kept in a document nobody opens.
 */

import type { Aisle } from './types';

export interface AisleMeta {
  key: Aisle;
  label: string;
  line: string;
  /** What this aisle is not able to tell you. Printed, not filed. */
  note: string | null;
}

export const AISLES: readonly AisleMeta[] = [
  {
    key: 'diapering',
    label: 'Diapering & changing',
    line: 'Disposables, cloth, wipes and rash creams',
    note: 'Indian diaper packs are sized by weight, not age. Where a pack printed only a '
      + 'weight, this shelf shows the weight and no age band — converting one to the other '
      + 'would be us guessing at your child.',
  },
  {
    key: 'feeding',
    label: 'Feeding',
    line: 'Bottles, formula, first foods, cups and chairs',
    note: 'Part of this aisle is governed by India’s IMS Act 1992. Formula, infant food, '
      + 'bottles and teats for under-twos are listed with their price and never ranked, '
      + 'badged, discounted or recommended — see Safety & the law.',
  },
  {
    key: 'bath',
    label: 'Bath, skin & hair',
    line: 'Washes, lotions, oils, sunscreen and teeth',
    note: 'Most Indian brand pages print no age at all for these. Where a page said nothing, '
      + 'this shelf says nothing.',
  },
  {
    key: 'health',
    label: 'Health & first aid',
    line: 'Thermometers, teethers, colic, mosquitoes',
    note: 'Some rows here are medicines or notified medical devices, not toiletries. They are '
      + 'marked, and nothing in this hub tells you a dose.',
  },
  {
    key: 'safety',
    label: 'Safety & baby-proofing',
    line: 'Gates, guards, locks and car seats',
    note: 'Car seats here carry ECE R44/04 because their own pages state it. None claims a BIS '
      + 'mark, because none of them claimed one.',
  },
  {
    key: 'gear',
    label: 'Gear, sleep & mobility',
    line: 'Strollers, carriers, cots, cycles',
    note: 'Sit-in walkers are sold here because they are sold in India. Canada bans their sale '
      + 'outright and the US CPSC and the American Academy of Pediatrics advise against use; '
      + 'no Indian regulator has taken a position we could find. Push walkers are the usual '
      + 'substitute.',
  },
  {
    key: 'play',
    label: 'Play & learning',
    line: 'Toys, books, ride-ons and craft',
    note: 'India’s Toys (Quality Control) Order 2020 makes an ISI mark compulsory on toys for '
      + 'under-14s — which is why this shelf shows a certification only where the product’s own '
      + 'page printed one, rather than assuming every toy on sale complies.',
  },
];

const BY_KEY = new Map(AISLES.map((a) => [a.key, a]));

export function aisleMeta(key: Aisle): AisleMeta {
  const m = BY_KEY.get(key);
  // Every Aisle in the union has an entry above; this is the compiler's belt.
  if (!m) throw new Error(`no aisle meta for ${key}`);
  return m;
}
