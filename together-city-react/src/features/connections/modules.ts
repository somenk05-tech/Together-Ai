import type { HubDef } from '@/api/connections.api';

/**
 * WHAT THE PEOPLE PAGE KNOWS ABOUT HUBS — which is now nothing, on purpose.
 *
 * This file used to hold a hand-written array: nine hubs, their labels, their
 * emoji, and MODULES_BY_RELATIONSHIP, an object saying which of them a Family
 * could hold and which a Friend could. The server has had a master registry all
 * along (`connections/hubs.registry.ts`), whose own doc comment says "the People
 * UI config derives from THIS list", served at GET /connections/hubs. Nothing
 * read it. `useHubs()` sat in connections.api.ts with no callers.
 *
 * So there were two lists, and they had already drifted: the server calls them
 * "Nutrition Family Hub", "Medical Hub" and "Financial Hub"; this page called
 * them "Nutrition", "Medical" and "Financial". Worse, MODULES_BY_RELATIONSHIP
 * was the ONLY place the family-only rule existed until it moved into the server
 * — a permission written as markup.
 *
 * Everything below is now a pure function OF the registry. Nothing here decides
 * what a hub is called or who may hold it; it reads what the server said and
 * arranges it. Adding a hub is a one-line change on the server, as intended.
 *
 * WHEN THE REGISTRY HASN'T ARRIVED, THIS FILE INVENTS NOTHING. `moduleDef` falls
 * back to the raw slug and a link icon — an honest "we know there's something
 * here and not what it's called" — rather than a guessed pretty name. Callers
 * that need the full list show a spinner or say plainly that it didn't load.
 */

export interface ModuleDef { key: string; label: string; emoji: string }

/** The relationships the People UI offers. The server also accepts partner,
 *  colleague and other; only 'family' unlocks the family-only hubs, and
 *  everything else is treated exactly like a friend. */
export const RELATIONSHIPS = [
  { key: 'family', label: 'Family', emoji: '\u{1F468}‍\u{1F469}‍\u{1F467}' },
  { key: 'friend', label: 'Friend', emoji: '\u{1F465}' },
] as const;

/** What a new connection starts with. Chat and Mail are added server-side. */
export const DEFAULT_MODULES = ['social'];

/** The hub as the registry described it — never a label written here. */
const fromRegistry = (h: HubDef): ModuleDef => ({ key: h.slug, label: h.name, emoji: h.icon });

/**
 * A hub the registry hasn't told us about — because it hasn't loaded, or because
 * a stored grant names a hub that has since been retired. The slug and a link
 * icon, which claim nothing.
 */
const unknownHub = (key: string): ModuleDef => ({ key, label: key, emoji: '\u{1F517}' });

export const moduleDef = (hubs: HubDef[] | undefined, key: string): ModuleDef => {
  const hub = hubs?.find((h) => h.slug === key);
  return hub ? fromRegistry(hub) : unknownHub(key);
};

/** Chat and Mail — on for every connection, never a toggle. */
export const universalHubs = (hubs: HubDef[] | undefined): ModuleDef[] =>
  (hubs ?? []).filter((h) => h.universal).map(fromRegistry);

/**
 * The optional hubs this relationship may hold.
 *
 * Derived from the registry's own `familyOnly` flag — the same field the server
 * enforces in `connections/hub-grants.ts`. The two cannot drift, because there
 * is only one of them now.
 */
export const allowedModules = (hubs: HubDef[] | undefined, relationship?: string | null): string[] =>
  (hubs ?? [])
    .filter((h) => !h.universal && (relationship === 'family' || !h.familyOnly))
    .map((h) => h.slug);

/**
 * Hubs worth showing as chips — the universal ones are implied, not listed.
 *
 * With no registry we cannot say which hubs are universal, so this returns
 * nothing rather than listing Chat and Mail as if they were choices somebody
 * made. A moment of "no chips" beats a moment of wrong ones.
 */
export const optionalOf = (hubs: HubDef[] | undefined, modules: string[]): string[] => {
  if (!hubs) return [];
  const universal = new Set(universalHubs(hubs).map((m) => m.key));
  return modules.filter((k) => !universal.has(k));
};
