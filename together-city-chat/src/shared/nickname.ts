/** Exported so the tests can assert a nickname is made of real words. */
export const NICK_ADJ = ['Cosmic', 'Wandering', 'Curious', 'Easy', 'Golden', 'Northern', 'Quiet', 'Bright', 'Wildflower', 'Midnight', 'Sunlit', 'Coastal'];
export const NICK_NOUN = ['Voyager', 'Stargazer', 'Explorer', 'Dreamer', 'Nomad', 'Spark', 'Compass', 'Comet', 'Willow', 'Harbor', 'Ember', 'Meadow'];

/**
 * Deterministic anonymous nickname for a user id (stable across the app).
 *
 * THE SHIFT IS UNSIGNED, AND THAT IS THE WHOLE FIX. This used `h >> 4`.
 *
 * `h` is accumulated with `>>> 0`, so it is an unsigned 32-bit value and
 * routinely exceeds 2^31. `>>` is the SIGNED right shift: JavaScript coerces its
 * operand to int32 first, so every hash with the high bit set went negative,
 * stayed negative through the shift, and `negative % 12` is negative in JS —
 * indexing NICK_NOUN out of bounds and yielding `undefined`.
 *
 * Roughly half of all ids, because half of uniform 32-bit values have the high
 * bit set. It is how somebody came to be sitting in a dating chat talking to
 * "Coastal undefined": not a missing profile or absent data, but the identity
 * generator itself, silently, for every second person.
 *
 * The adjective was always fine — `h % 12` on an unsigned h cannot go negative —
 * which is exactly why it read like a data problem rather than a bug. Half the
 * name was right.
 */
export function nickname(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${NICK_ADJ[h % NICK_ADJ.length]} ${NICK_NOUN[(h >>> 4) % NICK_NOUN.length]}`;
}
