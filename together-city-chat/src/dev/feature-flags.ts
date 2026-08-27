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
  { key: 'nutrition', label: 'Nutrition', turnsOff: 'Meal plans, the food journal, grocery lists and the nutrition profile. Family Nutrition goes with it.', prefixes: ['nutrition'], hubPath: '/nutrition' },
  { key: 'pets', label: 'Pet Care', turnsOff: 'Pet profiles, the pet shelf and everything in the pet district.', prefixes: ['pets'], hubPath: '/pets' },
  /**
   * MEDICAL, AND WHY IT READS DIFFERENTLY FROM THE ELEVEN ABOVE.
   *
   * This hub was on NEVER_FLAGGABLE until 27 Aug and was moved here at the
   * owner's explicit instruction, asked and answered. It is not an oversight
   * and it is not a widening of a rule nobody noticed — see the note on
   * NEVER_FLAGGABLE below, which records the change rather than hiding it.
   *
   * What that costs is written into `turnsOff` in full, because this is the
   * one switch on the page whose confirm text is the only thing standing
   * between a bad afternoon and somebody unable to read their own
   * prescription. The health CHECK endpoint stays un-flaggable and always
   * was: it is how we find out the site is up, not a room anybody visits.
   */
  { key: 'medical', label: 'Medical', turnsOff: 'Health records, blood results, prescriptions and medicine reminders — for every citizen, including anyone mid-treatment who is relying on them right now. Nothing is deleted, but nobody can reach any of it until this is switched back.', prefixes: ['medical', 'medicines', 'prescriptions'], hubPath: '/medical' },
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
export const NEVER_FLAGGABLE = ['auth', 'health', 'admin', 'dev', 'users', 'chat', 'messages', 'mail'];

/**
 * MEDICAL LEFT THIS LIST ON 27 AUG, and the departure is written down because
 * a rule that quietly loses a member is a rule nobody can trust the rest of.
 *
 * It was here for a good reason: a switch that cuts somebody off from their own
 * prescriptions is not the same class of thing as one that closes the dating
 * hub. The owner was asked that question directly, in those terms, and chose to
 * make it flaggable — the dashboard was asked for as one that "overrides all
 * the controls of the website at will", and a hub the switch cannot reach is
 * not that.
 *
 * What did NOT move: `health`, the check endpoint that tells us the site is up,
 * and `auth`, `admin`, `dev` and `users`, without which nobody could switch it
 * back. The friction that remains is real and deliberate — the dev password,
 * the `ops.flags` grant, a written reason of at least eight characters, and an
 * audit row naming who did it.
 */

/**
 * HUBS THAT CANNOT HONESTLY CARRY A SWITCH, and are shown saying so.
 *
 * The dashboard draws one card per hub, and a hub silently missing from that
 * grid reads as "this one is always on" — which is the opposite of the truth
 * here. So the ones that cannot be flagged are declared, with the reason, and
 * drawn as a locked card.
 *
 * This is NOT part of FLAGS and must never become part of it. FLAGS is the
 * single input to the gate; an entry there with no prefixes would be a flag
 * that gates nothing — a link-hider, which rule 1 at the top of this file
 * exists to refuse. Nothing at runtime reads the list below except the page
 * that draws it.
 */
export interface UnflaggableHub {
  key: string;
  label: string;
  /** Said to whoever is looking for the switch and not finding one. */
  why: string;
  hubPath: string;
}

export const UNFLAGGABLE_HUBS: UnflaggableHub[] = [
  {
    key: 'ecommerce',
    label: 'E-Commerce',
    why: 'It has no API of its own — it is a shopfront over the Beauty, Nutrition, '
      + 'Astrology and Pet endpoints. A switch here would either refuse nothing at all, '
      + 'or take those three hubs down with it. Turn off the hub whose shop you mean.',
    hubPath: '/ecommerce',
  },
];

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
