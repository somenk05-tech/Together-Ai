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

export const MODULES: ModuleDef[] = [
  ...UNIVERSAL_MODULES,
  { key: 'nutrition', label: 'Nutrition Family Hub', emoji: '\u{1F37D}\uFE0F' },
  { key: 'medical', label: 'Medical Hub', emoji: '\u{1FA7A}' },
  { key: 'financial', label: 'Financial Hub', emoji: '\u{1F4B0}' },
  { key: 'grocery', label: 'Grocery', emoji: '\u{1F6D2}' },
  { key: 'pantry', label: 'Shared Pantry', emoji: '\u{1F3E0}' },
  { key: 'travel', label: 'Travel', emoji: '\u2708\uFE0F' },
  { key: 'calendar', label: 'Shared Calendar', emoji: '\u{1F4C5}' },
  { key: 'fitness', label: 'Fitness', emoji: '\u{1F4AA}' },
  { key: 'social', label: 'Social Life', emoji: '\u{1F389}' },
  { key: 'entertainment', label: 'Entertainment', emoji: '\u{1F3AC}' },
];

export const moduleDef = (key: string): ModuleDef =>
  MODULES.find((m) => m.key === key) ?? { key, label: key, emoji: '\u{1F517}' };

/** OPTIONAL hubs each relationship may connect (universal ones excluded). */
export const MODULES_BY_RELATIONSHIP: Record<string, string[]> = {
  family: ['nutrition', 'medical', 'financial', 'grocery', 'pantry', 'travel', 'calendar', 'fitness', 'social', 'entertainment'],
  friend: ['travel', 'social', 'entertainment', 'fitness'],
};

export const DEFAULT_MODULES = ['chat', 'mail', 'social'];
export const UNIVERSAL_KEYS = UNIVERSAL_MODULES.map((m) => m.key);

/** Optional (toggleable) modules for a relationship. */
export const allowedModules = (relationship?: string | null): string[] =>
  MODULES_BY_RELATIONSHIP[relationship ?? ''] ?? MODULES.map((m) => m.key).filter((k) => !UNIVERSAL_KEYS.includes(k));

/** Hubs to show as "Connected" chips (universal ones are implied, not listed). */
export const optionalOf = (modules: string[]): string[] => modules.filter((k) => !UNIVERSAL_KEYS.includes(k));
