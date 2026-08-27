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
 * ── VISIBILITY SWITCHES: A DIFFERENT ANIMAL, KEPT IN A DIFFERENT CAGE ───────
 *
 * Owner, 27 Aug: "add a kill switch for e-commerce visibility and also add a
 * kill switch for Mira — these should just turn off visibility from the user
 * app or site."
 *
 * Everything above this line REFUSES AN API. What follows HIDES A DOOR, and
 * conflating the two is the single most dangerous thing this file could do.
 * Rule 1 at the top says a flag that only hides a link is not a switch — that
 * rule stands, and it is why these are not in FLAGS: an operator reaching for
 * a switch in an incident must never get a door-hider by mistake, believing
 * the hub is off while every endpoint keeps answering.
 *
 * So they are a separate list, stored under a separate key namespace, drawn in
 * a separate section of the page, and described by what they DO NOT do.
 *
 * WHY EACH ONE IS THIS SHAPE AND NOT THE OTHER:
 *
 *  · E-COMMERCE has no API of its own. It is a shopfront over the Beauty,
 *    Nutrition, Astrology and Pet endpoints, so there is nothing to refuse
 *    that would not take three other hubs down. Hiding the front door is the
 *    only honest thing a switch here can do, and now it says so.
 *  · MIRA could have been a real kill switch — `mira` is a live prefix and
 *    gating it would work. Visibility was asked for instead, so visibility is
 *    what this is; the prefix is deliberately NOT listed above. If she should
 *    stop answering as well as stop appearing, that is a second switch and a
 *    considered decision, not a widening of this one.
 */
export interface VisibilityFlag {
  key: string;
  label: string;
  /** What disappears — and, just as important, what does not. */
  hides: string;
  /** Where the state lives. Namespaced so `isFlagKey` cannot match it and the
   *  request gate cannot read it, whatever anybody does to FLAGS later. */
  storeKey: string;
}

/** The one prefix that separates a door-hider from a kill switch, in storage. */
export const VISIBILITY_PREFIX = 'show:';

/**
 * ONE PER SECTOR (owner, 27 Aug: "visibility switches for the entire global
 * website, so I can control turning off or on a sector").
 *
 * Every sector the citizen can switch off for THEMSELVES on /profile can now
 * be switched off for EVERYBODY here — same doors, same four places, one
 * decision instead of fourteen thousand. Mira is on the list too; she is not a
 * hub, but she is a thing with doors, which is what this list is about.
 *
 * The standard sentence is deliberately repetitive: the same four places, the
 * same "keeps answering", every time. Three entries add a clause because
 * something about them is genuinely different, and the repetition is what
 * makes those three stand out instead of blending in.
 */
const DOORS = 'the header tab, the drawer, the home page and the city grid';
const STILL_OPEN = 'The hub keeps answering — a direct link still works, saved pages still open, '
  + 'and nothing anybody has stored there is touched.';
const sector = (key: string, label: string, extra?: string): VisibilityFlag => ({
  key,
  label,
  hides: `The ${label} doors: ${DOORS}. ${extra ?? STILL_OPEN}`,
  storeKey: `${VISIBILITY_PREFIX}${key}`,
});

export const VISIBILITY_FLAGS: VisibilityFlag[] = [
  sector('astrology', 'Astrology'),
  sector('beauty', 'Beauty'),
  sector('dating', 'Dating'),
  sector('ecommerce', 'E-Commerce',
    'Every shop stays open — each one also lives inside its own hub, and a direct link still '
    + 'works. E-Commerce has no API of its own to close, so hiding the front door is the whole '
    + 'of what a switch here can honestly do.'),
  sector('entertainment', 'Entertainment'),
  sector('financial', 'Financial'),
  sector('fitness', 'Fitness'),
  sector('jobs', 'Jobs'),
  sector('medical', 'Medical',
    'Health records, prescriptions and medicine reminders KEEP ANSWERING and anyone who has '
    + 'saved a link still reaches them. This hides the way in for people who navigate by the '
    + 'menu, which during treatment is most of them — hiding is not closing, but it is not '
    + 'nothing either.'),
  sector('nutrition', 'Nutrition'),
  sector('pets', 'Pet Care'),
  sector('realestate', 'Real Estate'),
  sector('services', 'Local Services'),
  sector('social', 'Social Life'),
  /**
   * ── THE THREE THAT ARE NOT DISTRICTS (owner, 27 Aug: "add email chat and
   * personal services too") ────────────────────────────────────────────────
   *
   * Mail, Chat and Personal were never on the citizen's own design page —
   * "the citizen's own doors, never designable" — because nobody should be
   * able to lose their own inbox by tidying their menu. The operator's switch
   * is a different question, so they get one; but two of them hold
   * CORRESPONDENCE BETWEEN PEOPLE, and that is not the same as hiding tarot.
   *
   * Nothing stops arriving and nothing stops sending — these are still
   * `NEVER_FLAGGABLE`, so no kill switch can ever reach them. What goes is the
   * way IN, and the copy says so plainly, because the person who suffers a
   * hidden inbox is not the operator: it is somebody waiting on a reply who
   * navigates by the menu, finds nothing, and concludes the message never came.
   */
  sector('mail', 'Mail',
    'Mail keeps arriving and keeps sending, and a saved link still opens the inbox — but '
    + 'somebody waiting on a reply has no way to it from the menu, and will read that as '
    + 'silence rather than as a hidden door.'),
  sector('chat', 'Chat',
    'Messages keep arriving, keep sending, and every notification still works. What goes is '
    + 'the way in — anyone mid-conversation who navigates by the menu will not find it.'),
  sector('personal', 'Personal',
    'Their thoughts, album and everything filed there stay exactly where they are and keep '
    + 'answering. This is the door only.'),
  {
    key: 'mira',
    label: 'Mira',
    hides: 'Her door on every page, in both chat rooms and in the daybook. She keeps answering: '
      + '/api/mira is untouched, so a conversation already open still works and nothing she has '
      + 'been told is deleted. This is the door, not the assistant.',
    storeKey: `${VISIBILITY_PREFIX}mira`,
  },
];

export const VISIBILITY_KEYS = VISIBILITY_FLAGS.map((f) => f.key);
export const isVisibilityKey = (k: string): boolean => VISIBILITY_KEYS.includes(k);
export const visibilityFlag = (k: string): VisibilityFlag | undefined =>
  VISIBILITY_FLAGS.find((f) => f.key === k);

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
