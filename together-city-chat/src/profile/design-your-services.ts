/**
 * DESIGN YOUR SERVICES — the citizen chooses their city.
 *
 * One column on User (`hiddenHubsJson`) holds the hubs a citizen has switched
 * OFF, as a JSON array of hub keys. Everything about that shape is a decision:
 *
 * - It is the OFF list, not the ON list, so a hub built next month is on for
 *   every citizen the day it opens — no backfill, no "why can't I see the new
 *   hub" support thread. Absence of a choice is not a choice.
 * - `null` and `'[]'` mean the same thing — the whole city — because a citizen
 *   who has never opened the section and a citizen who looked and kept
 *   everything have made the same city, even if not the same decision.
 * - Switching a hub off hides its doors. It deletes nothing: the routes still
 *   answer, the data stays, Mira and the command palette can still take you
 *   there. That rule lives in the frontend, but it is stated here because this
 *   file is the contract's home.
 *
 * The list below is the set of hubs a citizen may design — the ones with a
 * door on the street (header tab, home walk, city grid). Mail and Personal are
 * the citizen's own doors, not services, and are not listed; Travel has no
 * street surface at all while the owner keeps it off the map. A key outside
 * this list is refused at the controller and dropped by the parser, so a
 * renamed or retired hub can never brick a citizen's saved design.
 */
export const DESIGNABLE_HUBS = [
  'astrology', 'beauty', 'dating', 'ecommerce', 'entertainment', 'financial',
  'fitness', 'jobs', 'medical', 'nutrition', 'pets', 'realestate', 'services',
  'social',
] as const;

export type DesignableHub = (typeof DESIGNABLE_HUBS)[number];

const KNOWN = new Set<string>(DESIGNABLE_HUBS);

/** De-duplicate, drop unknown keys, and return in the one canonical order. */
export function normalizeHiddenHubs(keys: readonly string[]): DesignableHub[] {
  const chosen = new Set(keys.filter((k) => KNOWN.has(k)));
  // Canonical order comes from the list, not the wire: two citizens who hid
  // the same hubs store the same string, whatever order they clicked in.
  return DESIGNABLE_HUBS.filter((k) => chosen.has(k));
}

/**
 * Read the stored column back into a list. A column that predates this
 * feature (`null`), or that something has managed to corrupt, reads as the
 * whole city rather than as an error — the design is a convenience, and a
 * convenience must never be the reason a page cannot render.
 */
export function parseHiddenHubs(json: string | null | undefined): DesignableHub[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return normalizeHiddenHubs(parsed.filter((k): k is string => typeof k === 'string'));
  } catch {
    return [];
  }
}
