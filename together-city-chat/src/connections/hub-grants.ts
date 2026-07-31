import {
  FAMILY_ONLY_SLUGS,
  PERMISSIONED_SLUGS,
  UNIVERSAL_SLUGS,
  hubDef,
  isHub,
  isUniversalHub,
} from './hubs.registry';

/**
 * WHO MAY HOLD WHICH HUB.
 *
 * The hubs registry has always declared `familyOnly: true` on Nutrition, Medical
 * and Financial, and its own spec asserts that the flag has the right value. No
 * code read it. The only thing standing between a citizen's blood results and a
 * connection marked "friend" was a hand-written array in the browser
 * (`features/connections/modules.ts`, MODULES_BY_RELATIONSHIP) that decided which
 * checkboxes to draw.
 *
 * A rule that lives only in the markup is not a rule. `PATCH /connections/:id/modules`
 * with `{ modules: ['medical'], relationship: 'friend' }` was accepted, stored, and
 * `canAccessHub()` then answered true for medical — because it asked the module
 * list and never asked who this person is. The same is true of
 * `POST /connections/request`, where the person *sending* the request picks the
 * hubs the connection opens.
 *
 * This module is the rule, in one place, with no database in it. Every write path
 * routes through `resolveGrants`; the read gate routes through `mayReadHub`.
 *
 * WHY THE TWO ARE NOT THE SAME FUNCTION. On the write side an unset relationship
 * is not family — a new grant has to say what it is. On the read side an unset
 * relationship is left alone: rows written before this rule existed carry
 * `relationship: null` with a real, wanted grant behind them, and a family
 * sharing their nutrition hub today should not lose it because an older screen
 * never asked them to name the relationship. Those rows are correct until they
 * are next written, and the next write settles them. That is a deliberate,
 * bounded gap and it is written down rather than papered over.
 */

/** The one relationship that unlocks the family-only hubs. */
export const FAMILY_RELATIONSHIP = 'family';

export const isFamily = (relationship: string | null | undefined): boolean =>
  relationship === FAMILY_RELATIONSHIP;

/** True when the relationship is stated AND is not family. `null` is "not stated". */
export const isStatedNonFamily = (relationship: string | null | undefined): boolean =>
  relationship !== null && relationship !== undefined && relationship !== '' && !isFamily(relationship);

export const isFamilyOnlyHub = (slug: string): boolean => FAMILY_ONLY_SLUGS.includes(slug);

/**
 * The permissioned hubs this relationship may hold. Universal hubs (Chat, Mail)
 * are absent on purpose: they are always on and are never a grant, so they are
 * not something a relationship can be allowed or refused.
 */
export function allowedHubsFor(relationship: string | null | undefined): string[] {
  return isFamily(relationship)
    ? [...PERMISSIONED_SLUGS]
    : PERMISSIONED_SLUGS.filter((slug) => !isFamilyOnlyHub(slug));
}

export interface Grants {
  /** What will be stored. Universal hubs are always included. */
  modules: string[];
  /**
   * Family-only hubs that were asked for and not given, because the relationship
   * on this connection may not hold them. Never silently empty — the caller is
   * expected to say so.
   */
  withheld: string[];
}

/**
 * The single decision behind every write. Takes what was asked for and the
 * relationship it is being asked for under; returns what is actually stored and
 * what was held back.
 *
 * Unknown or retired hub slugs (grocery, pantry, calendar) fall out here the same
 * way `withUniversal` used to drop them, so a legacy row can never resurface a
 * deleted hub. They are not reported as withheld — nothing was refused, the hub
 * does not exist.
 */
export function resolveGrants(
  requested: readonly string[] | null | undefined,
  relationship: string | null | undefined,
): Grants {
  const allowed = new Set(allowedHubsFor(relationship));
  const kept: string[] = [];
  const withheld: string[] = [];
  for (const slug of new Set(requested ?? [])) {
    if (!isHub(slug)) continue;
    if (isUniversalHub(slug)) continue;
    if (allowed.has(slug)) kept.push(slug);
    else withheld.push(slug);
  }
  return { modules: [...new Set([...UNIVERSAL_SLUGS, ...kept])], withheld };
}

/**
 * The read gate's half of the rule. Answers whether a stored grant on this
 * connection may still be honoured.
 *
 * `relationship == null` returns true — see the note at the top of this file.
 */
export function mayReadHub(slug: string, relationship: string | null | undefined): boolean {
  if (!isFamilyOnlyHub(slug)) return true;
  return !isStatedNonFamily(relationship);
}

/** The registry's own name for a hub, so a message never invents one. */
export const hubName = (slug: string): string => hubDef(slug)?.name ?? slug;

/**
 * What to say when a grant was held back. Plain language, no slugs, and it names
 * the way out instead of only refusing — someone who ticked Medical for a friend
 * meant to share something with somebody, and the answer they need is "mark them
 * as family first", not "400".
 */
export function withheldMessage(withheld: readonly string[]): string {
  if (withheld.length === 0) return '';
  const names = withheld.map(hubName);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const one = names.length === 1;
  return (
    `${list} ${one ? 'is' : 'are'} shared with family only, and this connection isn't ` +
    `marked as family — so ${one ? 'it' : 'they'} stayed off. If you meant to share ` +
    `${one ? 'it' : 'them'}, change the relationship to Family first.`
  );
}
