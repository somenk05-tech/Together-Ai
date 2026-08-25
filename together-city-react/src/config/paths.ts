import type { HubKey } from '@/types';

/**
 * DESIGN YOUR PATHS — hubs that work together, switched together.
 *
 * A path is a NAMED SET OF DESIGNABLE HUBS, and that is all it is. There is
 * no pathsJson column, no endpoint, no stored path state anywhere: a path is
 * ON exactly when every hub in it is on, derived from the same hidden-hubs
 * answer everything else reads. Two sources of truth is how a path badge says
 * "on" over a hub the citizen hid an hour ago — so the second source does not
 * exist. (When Mira learns to read paths, she derives them the same way, from
 * the same column, on her side of the wire.)
 *
 * Switching a path ON opens every hub in it. Switching it OFF closes only the
 * hubs no OTHER fully-on path is standing on — "independently" cannot mean
 * that turning off Self Care quietly breaks the Healthy Lifestyle you left on.
 *
 * THE BRIEF'S PATHS, MAPPED ONTO THE CITY THAT EXISTS:
 * - "Food" is not a hub. Eating out — restaurants, cafés, menus, orders to
 *   the door — lives in Local Services (ServiceMenuItem, MenuView, the lot),
 *   so Perfect Date connects there. Cooking in lives in Nutrition.
 * - "Jewellery" is the Astrology Zone's gemstone marketplace, so Personal
 *   Style connects to Astrology.
 * - WEEKEND GETAWAY IS DELIBERATELY ABSENT. The brief builds it on Travel,
 *   and Travel is off the street (owner, 15 Aug) with no surface for a switch
 *   to govern. The path returns the day Travel does — adding it here is one
 *   entry, and the guard that refuses non-designable hubs will hold the door
 *   until then.
 *
 * Every hub named here must be designable; the-paths-connect-the-hubs.test.ts
 * refuses anything else, so a hub leaving the street breaks the build rather
 * than shipping a switch wired to nothing.
 */
export interface PathDef {
  key: string;
  name: string;
  /** What the path is FOR, in one line — the card's subtitle. */
  line: string;
  hubs: readonly HubKey[];
}

export const PATHS: readonly PathDef[] = [
  {
    key: 'healthy-lifestyle',
    name: 'Healthy Lifestyle',
    line: 'One body — your food, your training and your blood work reading each other.',
    hubs: ['fitness', 'nutrition', 'medical'],
  },
  {
    key: 'self-care',
    name: 'Self Care',
    line: 'The routine, the workout and the plate, built from the same profile.',
    hubs: ['beauty', 'fitness', 'nutrition'],
  },
  {
    key: 'perfect-date',
    name: 'Perfect Date',
    line: 'Someone to meet, something to watch, somewhere to eat.',
    hubs: ['dating', 'entertainment', 'services'],
  },
  {
    key: 'new-beginning',
    name: 'New Beginning',
    line: 'A new job, a new place, and the money that moves with both.',
    hubs: ['jobs', 'realestate', 'financial'],
  },
  {
    key: 'personal-style',
    name: 'Personal Style',
    line: 'Your look and your stones, shopped through one door.',
    hubs: ['beauty', 'astrology', 'ecommerce'],
  },
];
