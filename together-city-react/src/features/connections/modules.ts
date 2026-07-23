/** Universal Connection Model — one People connection, per-module permissions.
 *  Chat + Mail are UNIVERSAL (every connection gets them automatically); the
 *  relationship (Family / Friend) scopes which optional hubs can be connected. */

export interface ModuleDef { key: string; label: string; emoji: string }

export const RELATIONSHIPS = [
  { key: 'family', label: 'Family', emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}' },
  { key: 'friend', label: 'Friend', emoji: '\u{1F465}' },
] as const;

export const UNIVERSAL_MODULES: ModuleDef[] = [
  { key: 'chat', label: 'Chat', emoji: '\u{1F4AC}' },
  { key: 'mail', label: 'Mail', emoji: '\u2709\uFE0F' },
];

// Real Together City hubs only. Nutrition already contains Grocery, Weekly &
// Daily Planner, Shared Pantry and Orders \u2014 so those are NOT separate toggles.
// Calendar is a private per-user activity log, never a shared connection.
export const MODULES: ModuleDef[] = [
  ...UNIVERSAL_MODULES,
  { key: 'social', label: 'Social Life', emoji: '\u{1F389}' },
  { key: 'travel', label: 'Travel', emoji: '\u2708\uFE0F' },
  { key: 'entertainment', label: 'Entertainment', emoji: '\u{1F3AC}' },
  { key: 'fitness', label: 'Fitness', emoji: '\u{1F4AA}' },
  { key: 'nutrition', label: 'Nutrition', emoji: '\u{1F37D}\uFE0F' },
  { key: 'medical', label: 'Medical', emoji: '\u{1FA7A}' },
  { key: 'financial', label: 'Financial', emoji: '\u{1F4B0}' },
];

export const moduleDef = (key: string): ModuleDef =>
  MODULES.find((m) => m.key === key) ?? { key, label: key, emoji: '\u{1F517}' };

/** OPTIONAL hubs each relationship may connect (universal ones excluded). */
export const MODULES_BY_RELATIONSHIP: Record<string, string[]> = {
  // Family + Friend share the everyday/social hubs; Nutrition, Medical and
  // Financial are Family-only (they expose household, health and money data).
  family: ['social', 'travel', 'entertainment', 'fitness', 'nutrition', 'medical', 'financial'],
  friend: ['social', 'travel', 'entertainment', 'fitness'],
};

export const DEFAULT_MODULES = ['chat', 'mail', 'social'];
export const UNIVERSAL_KEYS = UNIVERSAL_MODULES.map((m) => m.key);

/** Optional (toggleable) modules for a relationship. */
export const allowedModules = (relationship?: string | null): string[] =>
  MODULES_BY_RELATIONSHIP[relationship ?? ''] ?? MODULES.map((m) => m.key).filter((k) => !UNIVERSAL_KEYS.includes(k));

/** Hubs to show as "Connected" chips (universal ones are implied, not listed). */
export const optionalOf = (modules: string[]): string[] => modules.filter((k) => !UNIVERSAL_KEYS.includes(k));
