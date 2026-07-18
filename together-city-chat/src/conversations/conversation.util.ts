/** Deterministic key for a DIRECT conversation between two users (sorted). */
export function directKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}
