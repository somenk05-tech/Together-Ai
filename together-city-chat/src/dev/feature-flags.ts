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
  { key: 'dating', label: 'Dating', turnsOff: 'Matches, matchmaking chats and the matchmaking profile. Existing matches are not deleted.', prefixes: ['dating'], hubPath: '/dating' },
  { key: 'services', label: 'Local Market', turnsOff: 'The business directory, listing a business, and the anonymous enquiry threads.', prefixes: ['services'], hubPath: '/services' },
  { key: 'realestate', label: 'Real Estate', turnsOff: 'Property listings, selling, and enquiries.', prefixes: ['realestate'], hubPath: '/realestate' },
  { key: 'jobs', label: 'Jobs', turnsOff: 'Job postings, applications and the jobs profile.', prefixes: ['jobs'], hubPath: '/jobs' },
  { key: 'travel', label: 'Travel', turnsOff: 'Flights, packages and bookings.', prefixes: ['travel', 'flights'], hubPath: '/travel' },
  { key: 'entertainment', label: 'Entertainment', turnsOff: 'The film and television catalogue and the watchlist.', prefixes: ['entertainment'], hubPath: '/entertainment' },
  { key: 'astrology', label: 'Astrology', turnsOff: 'Charts, tarot and paid consultations.', prefixes: ['astrology'], hubPath: '/astrology' },
  { key: 'beauty', label: 'Beauty', turnsOff: 'Photo analysis, routines and the beauty profile.', prefixes: ['beauty'], hubPath: '/beauty' },
  { key: 'fitness', label: 'Fitness', turnsOff: 'Workouts, body goals and sleep.', prefixes: ['fitness'], hubPath: '/fitness' },
  { key: 'financial', label: 'Financial', turnsOff: 'The wallet and everything in the financial hub.', prefixes: ['financial', 'wallet'], hubPath: '/financial' },
  { key: 'social', label: 'Together TV', turnsOff: 'The feed, posting, and social profiles. Chat and Mail are NOT affected.', prefixes: ['social'], hubPath: '/social' },
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
  /* Money's own switch (launch blocker 2, 2 Sep). `pay` is every route under
     /api/pay: paying invoices, business billing, the payments dashboard and
     payout accounts. Not a hub on the citizen's grid, so it has no
     visibility twin - it is a till, not a room. Financial (the wallet) has
     its own switch above and is deliberately separate: closing payments must
     not hide somebody's own balance and statement. */
  { key: 'pay', label: 'Payments', turnsOff: 'Paying invoices, business billing, the payments dashboard and payout accounts. Wallets and statements stay readable.', prefixes: ['pay'], hubPath: '/pay' },
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
/* THE FIFTH PLACE (owner, 9 Sep). Search the city used to answer with rooms
   inside sectors that had been switched off — a door hidden from four menus
   and left standing in the fifth, which is not what anybody reading this
   sentence believed they were pressing. The palette now reads these switches
   too, and the sentence says so. */
const DOORS = 'the header tab, the drawer, the home page, the city grid and Search the city';
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
  /* THREE DISTRICTS THAT HAD NO DOOR SWITCH (owner, 9 Sep, asking for one per
     hub AND one per room). Baby Care arrived on 8 Sep after this list was
     written; Travel had a kill switch and never a door-hider; Family Nutrition
     is a mode of Nutrition with a rail of its own, and a rail of its own is
     what this list is about. Without them their ROOMS would hang under a card
     that does not exist. */
  sector('babycare', 'Baby Care'),
  sector('beauty', 'Beauty'),
  sector('dating', 'Dating'),
  sector('ecommerce', 'E-Commerce',
    'Every shop stays open — each one also lives inside its own hub, and a direct link still '
    + 'works. E-Commerce has no API of its own to close, so hiding the front door is the whole '
    + 'of what a switch here can honestly do.'),
  sector('entertainment', 'Entertainment'),
  sector('family', 'Family Nutrition',
    'The family half of Nutrition keeps answering — a direct link still opens it, plans and '
    + 'members are untouched — and Individual Nutrition has its own switch, so hiding this one '
    + 'does not hide the hub.'),
  sector('financial', 'Financial'),
  sector('fitness', 'Fitness'),
  sector('jobs', 'Jobs'),
  sector('medical', 'Medical',
    'Health records, prescriptions and medicine reminders KEEP ANSWERING and anyone who has '
    + 'saved a link still reaches them. This hides the way in for people who navigate by the '
    + 'menu, which during treatment is most of them — hiding is not closing, but it is not '
    + 'nothing either.'),
  sector('nutrition', 'Nutrition'),
  /* Personalize hides like any other district, and hiding it hides a DOOR
     onto ten hubs rather than a hub — each of the ten keeps its own tab, its
     own billboard and its own switch, so nothing behind this one goes dark
     when it does. */
  sector('personalize', 'Personalize'),
  sector('pets', 'Pet Care'),
  sector('realestate', 'Real Estate'),
  sector('services', 'Local Market'),
  sector('social', 'Together TV'),
  sector('travel', 'Travel'),
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

/**
 * ── ONE DOOR AT A TIME (owner, 9 Sep) ───────────────────────────────────────
 *
 * "Give me a hide-from-city button for each hub and each side hub tab — for
 * example Ask the Astrologer — all 01-06 in Astrology, the same for the entire
 * site and all hubs. I should be able to turn on and off for the entire
 * website."
 *
 * The sector switches above are the whole of Astrology. These are the ROOMS
 * inside it: This Month, Ask the Astrologer, Tarot, Gemstones, Checkout, the
 * profile — the numbered rail a citizen reads down the left of every hub.
 *
 * THE SAME ANIMAL AS A VISIBILITY FLAG, DELIBERATELY. It hides a door and
 * refuses nothing: the page keeps answering, a saved link still opens it, and
 * nothing anybody stored there is touched. That is why these live beside the
 * sector switches rather than beside the kill switches, and why the store key
 * carries the `show:` prefix too — a row written here can never gate a
 * request, because `flagForPath` is built from FLAGS and FLAGS holds no key
 * with this prefix.
 *
 * THE KEY IS THE PATH. A room has no name of its own that is stable — labels
 * are rewritten, the numbers on the rail are a reading order and get
 * renumbered when a room comes off (Fitness did it twice this week) — but
 * `/astrology/ask` is the room. So the path is the identity, and a room that
 * moves house is a new switch rather than an old switch pointing somewhere
 * unexpected, which is the safer of the two failures.
 *
 * THE LIST IS FIXED, like every other list in this file. It is not built from
 * a request, and a typo cannot invent a room. It mirrors the web app's rails
 * in config/hubs.ts, and a-door-at-a-time.test.ts on the web reads BOTH files
 * and fails when they drift — a hub that grows a room and never gets a switch
 * for it is exactly the drift nobody would notice by looking.
 */
export interface RoomFlag {
  key: string;
  /** The sector this room hangs under — the visibility flag one level up. */
  hub: string;
  /** The number the citizen reads on the rail. A reading order, not an id. */
  index: string;
  label: string;
  hides: string;
  storeKey: string;
  /**
   * ── AND THE OTHER SWITCH (owner, 9 Sep: "create kill switches for each
   * tab") ──────────────────────────────────────────────────────────────────
   *
   * A room now has both, exactly as a sector does, and they are as different
   * from each other here as they are up there: `storeKey` hides a door and
   * `killKey` closes the room. Two rows, two prefixes, two writers, two words
   * in the audit log — because "who hid Ask the Astrologer" and "who closed
   * it" must never read as the same event.
   *
   * The kill row gates through the @Room() DECORATOR, never through the path:
   * see room.decorator.ts for why a room cannot be a prefix. So this key can
   * still not be reached by `flagForPath`, and the guarantee the whole file is
   * built on — that no key outside FLAGS can gate a path — is untouched.
   */
  killKey: string;
}

/** Rooms share the door-hider's namespace: same contract, same guarantee that
 *  nothing here can ever refuse a request. `page:` keeps them apart from the
 *  sector keys within it, so `isVisibilityKey` cannot match a room. */
export const PAGE_VISIBILITY_PREFIX = `${VISIBILITY_PREFIX}page:`;

/** Where a CLOSED room is stored. Its own namespace, matching neither
 *  `isFlagKey` nor `isVisibilityKey`, and read only by the decorator branch of
 *  the request gate. */
export const PAGE_KILL_PREFIX = 'kill:page:';

const rooms = (hub: string, hubLabel: string, list: Array<[string, string, string]>): RoomFlag[] =>
  list.map(([index, key, label]) => ({
    hub,
    index,
    key,
    label,
    hides: `${label} — number ${index} on the ${hubLabel} rail. It leaves the rail, the hub's `
      + `own door and Search the city. The room keeps answering: a direct link still opens it, `
      + `and nothing anybody stored there is touched.`,
    storeKey: `${PAGE_VISIBILITY_PREFIX}${key}`,
    killKey: `${PAGE_KILL_PREFIX}${key}`,
  }));

export const ROOM_FLAGS: RoomFlag[] = [
  ...rooms('services', 'Local Market', [
    ['01', '/services/find', 'Find a service'],
    ['02', '/services/browse', 'All listed services'],
    ['03', '/services/grocery', 'Grocery Store'],
    ['04', '/services/electronics', 'Electronics Store'],
    ['05', '/services/list', 'List your business'],
    ['06', '/services/mine', 'My business'],
    ['07', '/services/regulars', 'Regulars'],
    ['08', '/services/offers', 'Daily offers'],
    ['09', '/services/messages', 'Messages'],
    ['10', '/services/orders', 'My orders'],
  ]),
  ...rooms('babycare', 'Baby Care', [
    ['01', '/babycare/shop', 'The baby store'],
    ['02', '/babycare/children', 'Your children'],
    ['03', '/babycare/essentials', 'For this age'],
    ['04', '/babycare/safety', 'Safety & the law'],
  ]),
  ...rooms('travel', 'Travel', [
    ['01', '/travel/explore', 'Explore Trips'],
    ['02', '/travel/flights', 'Flights'],
    ['03', '/travel/packages', 'Packages'],
    ['04', '/travel/bookings', 'My Bookings'],
    ['05', '/travel/trips', 'My Trips'],
  ]),
  ...rooms('astrology', 'Astrology', [
    ['01', '/astrology/monthly', 'This Month'],
    ['02', '/astrology/ask', 'Ask the Astrologer'],
    ['03', '/astrology/tarot', 'Tarot'],
    ['04', '/astrology/gemstones', 'Gemstones'],
    ['05', '/astrology/gem-checkout', 'Checkout'],
    ['06', '/profile/astrology', 'Astrology Profile'],
  ]),
  ...rooms('nutrition', 'Nutrition', [
    ['01', '/nutrition/blood', 'Connect Blood Test'],
    ['02', '/nutrition/preferences', 'Food Preference Profile'],
    ['03', '/nutrition/weekly', 'Weekly Meal Planner'],
    ['04', '/nutrition/grocery', 'Grocery Lists'],
    ['05', '/nutrition/recipes', 'Create Your Own Meal Plan'],
    ['06', '/nutrition/journal', 'AI Food Journal'],
    ['07', '/nutrition/saved', 'Saved Recipes'],
  ]),
  ...rooms('family', 'Family Nutrition', [
    ['01', '/family/connect', 'Connect Members'],
    ['02', '/family/weekly', 'Weekly Planner'],
    ['03', '/family/grocery', 'Grocery Lists'],
    ['04', '/family/search', 'Search by Ingredients'],
  ]),
  ...rooms('social', 'Together TV', [
    ['01', '/social/feed', 'City TV'],
    ['02', '/social/images', 'City Photos'],
    ['03', '/social/channels', 'Together City Channels'],
    ['04', '/social/profile', 'My Profile'],
    ['05', '/social/saved', 'Saved'],
    ['06', '/entertainment', 'Entertainment'],
  ]),
  ...rooms('dating', 'Matchmaking', [
    ['01', '/matchmaking/profile', 'My Matchmaking Profile'],
    ['02', '/matchmaking/browse', 'Potential Matches'],
    ['03', '/matchmaking/matches', 'Curated Matches'],
    ['04', '/matchmaking/chats', 'Matchmaking Chats'],
    ['05', '/matchmaking/safety', 'Safety Centre'],
  ]),
  ...rooms('entertainment', 'Entertainment', [
    ['01', '/entertainment/movies', 'Movies Now'],
    ['02', '/entertainment/ott', 'OTT Watch'],
    ['03', '/entertainment/curated', 'Curated Movies'],
    ['04', '/entertainment/watchlist', 'Watchlist'],
  ]),
  ...rooms('ecommerce', 'Digital Store', [
    ['01', '/ecommerce/store', 'Personalized Store'],
    ['02', '/ecommerce/market', 'Open Market'],
    ['03', '/ecommerce/cart', 'Your Cart'],
    ['04', '/ecommerce/orders', 'Your Orders'],
  ]),
  ...rooms('beauty', 'Beauty', [
    ['01', '/beauty/profile', 'Skin & Hair Profile'],
    ['02', '/beauty/routine', 'Your Beauty Routine'],
    ['03', '/beauty/market', 'Beauty Market'],
    ['04', '/beauty/orders', 'My Orders'],
  ]),
  ...rooms('medical', 'Medical', [
    ['01', '/medical/records', 'Health Records'],
    ['02', '/medical/blood', 'Record Analysis'],
    ['03', '/medical/tests', 'Order Blood Tests'],
    ['04', '/medical/consults', 'Talk to a Doctor'],
    ['05', '/medical/family', 'Family Profiles'],
    ['06', '/medical/consent', 'Privacy & Consent'],
    ['07', '/medical/medicines', 'Medicines & Reminders'],
  ]),
  ...rooms('realestate', 'Real Estate', [
    ['01', '/realestate/explore', 'Explore'],
    ['02', '/realestate/under-construction', 'Under Construction'],
    ['03', '/realestate/sell', 'List a Property'],
    ['04', '/realestate/mine', 'My Listings'],
  ]),
  ...rooms('jobs', 'Jobs', [
    ['01', '/jobs/profile', 'Resume & Profile'],
    ['02', '/jobs/matches', 'Jobs for you'],
    ['03', '/jobs/applications', 'My Applications'],
    ['04', '/jobs/post', 'Post a Job'],
    ['05', '/jobs/postings', 'My Postings'],
  ]),
  ...rooms('fitness', 'Fitness', [
    ['01', '/fitness/profile', 'Training Profile'],
    ['02', '/fitness/workout', 'Workout'],
    ['03', '/fitness/log', 'Activity Log'],
    ['04', '/fitness/supplements', 'Supplements'],
    ['05', '/fitness/sleep', 'Sleep Cycle'],
    ['06', '/fitness/store', 'The Store'],
    ['07', '/fitness/orders', 'My Orders'],
  ]),
  ...rooms('mail', 'Together City Mail', [
    ['01', '/mail/inbox', 'All Email'],
    ['02', '/mail/compose', 'Compose'],
    ['03', '/mail/sent', 'Sent'],
    ['04', '/mail/unsent', 'Drafts & Failed'],
    ['05', '/mail/starred', 'Starred'],
    ['06', '/mail/trash', 'Trash'],
    ['07', '/mail/drive', 'Drive'],
  ]),
  ...rooms('financial', 'Financial', [
    ['01', '/financial/wallet', 'City Wallet'],
    ['02', '/financial/spending', 'Spending'],
    ['03', '/financial/budgets', 'Budgets'],
    ['04', '/financial/transactions', 'Transactions'],
    ['05', '/financial/invoices', 'Invoices'],
  ]),
  ...rooms('pets', 'Pets', [
    ['01', '/pets/world', 'Pet world'],
    ['02', '/pets/profiles', 'Pet profiles'],
    ['03', '/pets/plan', 'Diet plan'],
    ['04', '/pets/today', 'Today'],
    ['05', '/pets/monthly', 'Monthly plan'],
    ['06', '/pets/eat', 'Can my pet eat this?'],
    ['07', '/pets/cook', 'Cook for my pet'],
    ['08', '/pets/shop', 'Pet shop'],
    ['09', '/pets/specialist', 'Pet specialist'],
    ['10', '/pets/bundles', 'Bundles'],
    ['11', '/pets/wellness', 'Health & wellness'],
    ['12', '/pets/activity', 'Activity'],
    ['13', '/pets/quiz', 'Pet scorecard'],
  ]),
];

export const ROOM_KEYS = ROOM_FLAGS.map((r) => r.key);
export const isRoomKey = (k: string): boolean => ROOM_KEYS.includes(k);
export const roomFlag = (k: string): RoomFlag | undefined => ROOM_FLAGS.find((r) => r.key === k);
/** The rooms of one sector, in rail order — how the operator's page draws them. */
export const roomsOf = (hub: string): RoomFlag[] => ROOM_FLAGS.filter((r) => r.hub === hub);
/** The store key a room's CLOSE is written to, or undefined if there is no
 *  such room — the writer's only way in, so a typo cannot invent a row. */
export const roomKillKey = (k: string): string | undefined => roomFlag(k)?.killKey;

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
