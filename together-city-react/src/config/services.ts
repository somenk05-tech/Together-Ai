import type { HubKey } from '@/types';

/**
 * DESIGN YOUR SERVICES — the hubs a citizen may switch on or off.
 *
 * The list is every hub with a door on the street: the header tabs (NAV minus
 * Mail and Personal, which are the citizen's own doors rather than services),
 * plus Financial — off the header by the owner's call (22 Aug) but still
 * standing on the home map, the walk and the city grid, which is exactly the
 * street presence this section governs. Travel is absent because it has no
 * street surface anywhere; a toggle for a hub with no door would be a switch
 * wired to nothing. the-city-is-yours-to-design.test.ts holds this list to
 * that derivation, so a hub joining or leaving the street fails the build
 * until it is answered for here.
 *
 * THE RULE THE WHOLE FEATURE STANDS ON: switching a hub off hides its doors —
 * header tab, drawer entry, home surfaces, city grid. It deletes nothing. The
 * routes still answer, the citizen's data stays, Mira and the command palette
 * can still take them there, and the switch is one press to put back. Same
 * shape as Travel leaving the street: hidden is not deleted.
 *
 * Mirrors together-city-chat/src/profile/design-your-services.ts — the server
 * refuses any key outside its copy of this list, so the two cannot drift
 * without a save failing loudly.
 */
export const DESIGNABLE_HUBS: readonly HubKey[] = [
  'astrology', 'beauty', 'dating', 'ecommerce', 'entertainment', 'financial',
  'fitness', 'jobs', 'medical', 'nutrition', 'pets', 'realestate', 'services',
  'social',
];

const KNOWN = new Set<string>(DESIGNABLE_HUBS);

export function isDesignable(key: string): key is HubKey {
  return KNOWN.has(key);
}
