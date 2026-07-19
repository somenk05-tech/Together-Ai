const NICK_ADJ = ['Cosmic', 'Wandering', 'Curious', 'Easy', 'Golden', 'Northern', 'Quiet', 'Bright', 'Wildflower', 'Midnight', 'Sunlit', 'Coastal'];
const NICK_NOUN = ['Voyager', 'Stargazer', 'Explorer', 'Dreamer', 'Nomad', 'Spark', 'Compass', 'Comet', 'Willow', 'Harbor', 'Ember', 'Meadow'];

/** Deterministic anonymous nickname for a user id (stable across the app). */
export function nickname(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${NICK_ADJ[h % NICK_ADJ.length]} ${NICK_NOUN[(h >> 4) % NICK_NOUN.length]}`;
}
