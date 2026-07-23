/** Universal Connection Model — one People connection, per-module permissions.
 *  The relationship chosen first (Family / Friend) scopes which hubs can be
 *  connected; every hub then simply reads this one record. */

export interface ModuleDef { key: string; label: string; emoji: string }

export const RELATIONSHIPS = [
  { key: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { key: 'friend', label: 'Friend', emoji: '👥' },
] as const;

export const MODULES: ModuleDef[] = [
  { key: 'chat', label: 'Chat', emoji: '💬' },
  { key: 'mail', label: 'Mail', emoji: '✉️' },
  { key: 'social', label: 'Social Life', emoji: '🎉' },
  { key: 'nutrition', label: 'Nutrition Family Hub', emoji: '🥗' },
  { key: 'grocery', label: 'Grocery', emoji: '🛒' },
  { key: 'pantry', label: 'Shared Pantry', emoji: '🫙' },
  { key: 'medical', label: 'Medical Hub', emoji: '🏥' },
  { key: 'financial', label: 'Financial', emoji: '💰' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { key: 'fitness', label: 'Fitness', emoji: '💪' },
];

export const moduleDef = (key: string): ModuleDef =>
  MODULES.find((m) => m.key === key) ?? { key, label: key, emoji: '🔗' };

/** Which hubs each relationship may connect (spec). */
export const MODULES_BY_RELATIONSHIP: Record<string, string[]> = {
  family: ['chat', 'mail', 'social', 'nutrition', 'grocery', 'pantry', 'medical', 'financial', 'travel'],
  friend: ['chat', 'mail', 'social', 'travel', 'entertainment', 'fitness'],
};

export const DEFAULT_MODULES = ['chat', 'mail', 'social'];

export const allowedModules = (relationship?: string | null): string[] =>
  MODULES_BY_RELATIONSHIP[relationship ?? ''] ?? MODULES.map((m) => m.key);
