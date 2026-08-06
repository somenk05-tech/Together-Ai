/**
 * KILL SWITCHES, AND THE FOUR RULES THAT KEEP THEM FROM BEING A FOOT-GUN.
 *
 * A flag that only hides a link is not a switch — anybody with the URL walks
 * straight in, and the person who flipped it believes the hub is off. So a flag
 * here turns off the API prefixes that hub is built on, and the web app hides
 * the door as a courtesy on top of that.
 *
 * 1. THE KEYS ARE A FIXED LIST. Flags are not free-form rows. A typo cannot
 *    invent `datng`, and nothing can flag a prefix that is not named below.
 *
 * 2. MISSING MEANS ON, AND SO DOES AN ERROR. A flag with no row is on. A
 *    database read that fails is on. The alternative — fail closed — means a
 *    momentary Postgres blip takes the whole application down, which is a
 *    strictly worse outage than the one the switch exists to cause on purpose.
 *
 * 3. SOME THINGS CANNOT BE FLAGGED, AND THEY ARE ABSENT RATHER THAN EXCLUDED.
 *    There is no flag for auth, health, or the console. A switch that can lock
 *    everybody out including the person holding the switch is not a safety
 *    feature. The way to be sure is that no entry below names those prefixes —
 *    and the guard reads only these entries.
 *
 * 4. TURNING SOMETHING OFF IS AN ACTION WITH A REASON. It goes through the
 *    console's act(), so it is recorded with who and why like every other
 *    change. "Dating has been off since Tuesday" should never be a mystery.
 */

export interface FlagDef {
  key: string;
  label: string;
  /** What a citizen loses, said plainly — this is what the toggle's confirm
   *  shows, and vague copy is how somebody turns off the wrong hub. */
  turnsOff: string;
  /**
   * API path prefixes this flag gates, WITHOUT the /api root.
   *
   * Matched as a path segment prefix, so 'dating' matches /api/dating and
   * /api/dating/matches and never /api/datingsomethingelse.
   */
  prefixes: string[];
  /** The web route the hub lives at, so the app can close the door too. */
  hubPath: string;
}

export const FLAGS: FlagDef[] = [
  { key: 'dating', label: 'Dating', turnsOff: 'Matches, dating chats and the dating profile. Existing matches are not deleted.', prefixes: ['dating'], hubPath: '/dating' },
  { key: 'services', label: 'Local Services', turnsOff: 'The business directory, listing a business, and the anonymous enquiry threads.', prefixes: ['services'], hubPath: '/services' },
  { key: 'realestate', label: 'Real Estate', turnsOff: 'Property listings, selling, and enquiries.', prefixes: ['realestate'], hubPath: '/realestate' },
  { key: 'jobs', label: 'Jobs', turnsOff: 'Job postings, applications and the jobs profile.', prefixes: ['jobs'], hubPath: '/jobs' },
  { key: 'travel', label: 'Travel', turnsOff: 'Flights, packages and bookings.', prefixes: ['travel', 'flights'], hubPath: '/travel' },
  { key: 'entertainment', label: 'Entertainment', turnsOff: 'The film and television catalogue and the watchlist.', prefixes: ['entertainment'], hubPath: '/entertainment' },
  { key: 'astrology', label: 'Astrology', turnsOff: 'Charts, tarot and paid consultations.', prefixes: ['astrology'], hubPath: '/astrology' },
  { key: 'beauty', label: 'Beauty', turnsOff: 'Photo analysis, routines and the beauty profile.', prefixes: ['beauty'], hubPath: '/beauty' },
  { key: 'fitness', label: 'Fitness', turnsOff: 'Workouts, body goals and sleep.', prefixes: ['fitness'], hubPath: '/fitness' },
  { key: 'financial', label: 'Financial', turnsOff: 'The wallet and everything in the financial hub.', prefixes: ['financial', 'wallet'], hubPath: '/financial' },
  { key: 'social', label: 'Social Life', turnsOff: 'The feed, posting, and social profiles. Chat and Mail are NOT affected.', prefixes: ['social'], hubPath: '/social' },
  { key: 'ai', label: 'AI features', turnsOff: 'Every AI call across the app — meal planning, blood reading, beauty analysis, CV parsing. The hubs stay open; the AI parts of them stop.', prefixes: ['ai'], hubPath: '/hubs' },
];

export const FLAG_KEYS = FLAGS.map((f) => f.key);
export const isFlagKey = (k: string): boolean => FLAG_KEYS.includes(k);

/**
 * The prefixes that may never be flagged, written down so the guard below can
 * prove it rather than so the guard can consult it.
 *
 * Nothing reads this list at runtime — FLAGS is the only input to the gate. It
 * is here for the test, which asserts no entry above names any of them. A
 * switch that can lock out the person holding it is not a safety feature.
 */
export const NEVER_FLAGGABLE = ['auth', 'health', 'admin', 'dev', 'users', 'chat', 'messages', 'mail', 'medical'];

/**
 * Which flag, if any, gates this request path.
 *
 * Takes the path WITHOUT the /api root (Nest gives the controller prefix, and
 * the raw url carries it — the caller strips it once, here, rather than every
 * entry above carrying an /api nobody can forget consistently).
 */
export function flagForPath(path: string): FlagDef | null {
  const clean = path.replace(/^\/+/, '').replace(/^api\//, '');
  const head = clean.split(/[/?]/)[0]?.toLowerCase() ?? '';
  if (!head) return null;
  return FLAGS.find((f) => f.prefixes.includes(head)) ?? null;
}
