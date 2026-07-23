/**
 * MASTER HUBS REGISTRY — the single source of truth for what hubs exist in
 * Together City and how each behaves. Everything (DTO validation, permission
 * checks, the /connections/hubs API, the People UI config) derives from THIS
 * list. Adding a new hub is a one-line record here — no other backend code
 * changes. This is the code-level equivalent of a `hubs` table; it is seeded
 * into that shape and served verbatim by `GET /connections/hubs`.
 *
 * Removed hubs (grocery, shared pantry, shared calendar) are deliberately ABSENT:
 *  - Grocery / Weekly & Daily Planner / Shared Pantry / Orders all live INSIDE
 *    the Nutrition hub — they are not separately-permissioned.
 *  - The Calendar is a private per-user activity log, never a shared connection.
 */
export interface HubDef {
  /** Stable identifier — equals the slug; used as the permission key. */
  id: string;
  slug: string;
  name: string;
  icon: string;
  enabled: boolean;
  /** Universal hubs are on for EVERY connection and can never be toggled off. */
  universal: boolean;
  /** Family-only hubs may only be shared with a `family` relationship. */
  familyOnly: boolean;
}

const def = (slug: string, name: string, icon: string, opts: Partial<HubDef> = {}): HubDef => ({
  id: slug, slug, name, icon, enabled: true, universal: false, familyOnly: false, ...opts,
});

/** The complete hub catalogue. Order is the display order in the UI. */
export const HUBS: HubDef[] = [
  def('chat', 'Chat', '\u{1F4AC}', { universal: true }),
  def('mail', 'Mail', '✉️', { universal: true }),
  def('social', 'Social Life', '\u{1F389}'),
  def('travel', 'Travel', '✈️'),
  def('entertainment', 'Entertainment', '\u{1F3AC}'),
  def('fitness', 'Fitness', '\u{1F4AA}'),
  def('nutrition', 'Nutrition Family Hub', '\u{1F37D}️', { familyOnly: true }),
  def('medical', 'Medical Hub', '\u{1FA7A}', { familyOnly: true }),
  def('financial', 'Financial Hub', '\u{1F4B0}', { familyOnly: true }),
];

export const ENABLED_HUBS = (): HubDef[] => HUBS.filter((h) => h.enabled);

/** Every hub slug (enabled) — the only permission keys the system recognises. */
export const HUB_SLUGS: string[] = ENABLED_HUBS().map((h) => h.slug);

/** Universal hub slugs — always granted, never a toggle. */
export const UNIVERSAL_SLUGS: string[] = ENABLED_HUBS().filter((h) => h.universal).map((h) => h.slug);

/** Optional (permissioned) hub slugs — the ones a connection can toggle. */
export const PERMISSIONED_SLUGS: string[] = ENABLED_HUBS().filter((h) => !h.universal).map((h) => h.slug);

/** Family-only hub slugs. */
export const FAMILY_ONLY_SLUGS: string[] = ENABLED_HUBS().filter((h) => h.familyOnly).map((h) => h.slug);

export const isHub = (slug: string): boolean => HUB_SLUGS.includes(slug);
export const isUniversalHub = (slug: string): boolean => UNIVERSAL_SLUGS.includes(slug);
export const hubDef = (slug: string): HubDef | undefined => HUBS.find((h) => h.slug === slug && h.enabled);

/** Zod-friendly non-empty tuple of permissioned slugs (for enum validation). */
export const PERMISSIONED_TUPLE = PERMISSIONED_SLUGS as [string, ...string[]];
