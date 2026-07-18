/**
 * Connections are order-independent. We always store the lexicographically
 * smaller user id as userOneId so a pair maps to exactly one row per type.
 */
export function orderPair(a: string, b: string): { userOneId: string; userTwoId: string } {
  return a < b ? { userOneId: a, userTwoId: b } : { userOneId: b, userTwoId: a };
}
