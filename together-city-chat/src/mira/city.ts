/**
 * What Mira knows about the city.
 *
 * Two halves, and they are different kinds of knowledge.
 *
 * THE MAP — where things are. Derivable in principle from `config/hubs.ts` in
 * the web package, and asserted against it by `city.spec.ts` (the same
 * cross-package read `route-reach.spec.ts` already does). It is declared here
 * rather than imported because the two packages share nothing but a network
 * contract, and a guard that fails loudly is better than a build-time coupling
 * between two things that deploy separately.
 *
 * THE GRAPH — what one hub does with something another hub was told. This is
 * NOT derivable from anywhere. It is the actual product: "a fact you give once
 * is known everywhere." It is also the thing citizens most consistently never
 * discover, because nothing in the app currently says it out loud. Mira is the
 * first surface that can.
 */

export interface Room {
  path: string;
  label: string;
  /** What a citizen would actually say to mean this room. */
  says?: string[];
}

export interface Hub {
  key: string;
  name: string;
  /** One sentence, in her voice — not the marketing tag. */
  what: string;
  rooms: Room[];
  /** Things a citizen might say that mean this hub. */
  says?: string[];
}

export const CITY: Hub[] = [
  { key: 'astrology', name: 'Astrology', what: 'A letter each day, a longer one each month, and somewhere to ask.',
    says: ['horoscope', 'my chart', 'stars', 'tarot'],
    rooms: [
      { path: '/astrology/today', label: 'Today' },
      { path: '/astrology/month', label: 'This month' },
      { path: '/astrology/ask', label: 'Ask' },
      { path: '/astrology/birth', label: 'Birth details' },
    ] },
  { key: 'beauty', name: 'Beauty', what: 'Your skin and hair, a routine built from them, and somewhere to buy it.',
    says: ['skincare', 'my routine', 'hair'],
    rooms: [
      { path: '/beauty/profile', label: 'Skin & hair profile' },
      { path: '/beauty/routine', label: 'Routine' },
      { path: '/beauty/market', label: 'Market' },
      { path: '/beauty/orders', label: 'Orders' },
    ] },
  { key: 'dating', name: 'Dating', what: 'Curated matches, and chats that stay separate from everything else.',
    says: ['matches', 'dates', 'my dating profile'],
    rooms: [
      { path: '/dating/profile', label: 'Profile' },
      { path: '/dating/curated', label: 'Curated matches' },
      { path: '/dating/chats', label: 'Chats' },
    ] },
  { key: 'entertainment', name: 'Entertainment', what: 'What is on, what to stream, and a list of what you meant to watch.',
    says: ['films', 'movies', 'what to watch', 'cinema'],
    rooms: [
      { path: '/entertainment/movies', label: 'Movies now' },
      { path: '/entertainment/ott', label: 'Streaming' },
      { path: '/entertainment/watchlist', label: 'Watchlist' },
    ] },
  { key: 'financial', name: 'Financial', what: 'Your wallet, what you have spent, and the budgets you set yourself.',
    says: ['money', 'wallet', 'balance', 'spending', 'budget'],
    rooms: [
      { path: '/financial/wallet', label: 'Wallet' },
      { path: '/financial/spending', label: 'Spending' },
      { path: '/financial/budgets', label: 'Budgets' },
      { path: '/financial/transactions', label: 'Transactions' },
    ] },
  { key: 'fitness', name: 'Fitness', what: 'A plan built from your body and your goal, and a log of what you did.',
    says: ['workout', 'training', 'gym', 'exercise'],
    rooms: [
      { path: '/fitness/profile', label: 'Training profile' },
      { path: '/fitness/plan', label: 'Plan' },
      { path: '/fitness/log', label: 'Log' },
    ] },
  { key: 'jobs', name: 'Jobs', what: 'Your résumé, roles that match it, and what you have applied to.',
    says: ['work', 'jobs', 'my cv', 'resume', 'applications'],
    rooms: [
      { path: '/jobs/resume', label: 'Résumé' },
      { path: '/jobs/matches', label: 'Matches' },
      { path: '/jobs/applications', label: 'Applications' },
    ] },
  { key: 'medical', name: 'Medical', what: 'Your records, your blood work read back in plain words, and who may see it.',
    says: ['health', 'blood test', 'my records', 'doctor', 'medicines'],
    rooms: [
      { path: '/medical/blood', label: 'Blood analysis' },
      { path: '/medical/records', label: 'Records' },
      { path: '/medical/consent', label: 'Consent' },
    ] },
  { key: 'nutrition', name: 'Nutrition', what: 'A week of meals built for your body, and the list to shop it.',
    says: ['food', 'meals', 'what to eat', 'groceries', 'recipes', 'diet'],
    rooms: [
      { path: '/nutrition/preferences', label: 'Preferences' },
      { path: '/nutrition/plan', label: 'Weekly plan' },
      { path: '/nutrition/lists', label: 'Lists' },
      { path: '/nutrition/recipes', label: 'Recipes' },
    ] },
  { key: 'realestate', name: 'Real Estate', what: 'Places to live, and the ones you have listed.',
    says: ['property', 'flat', 'house', 'rent', 'buy a place'],
    rooms: [
      { path: '/realestate/explore', label: 'Explore' },
      { path: '/realestate/mine', label: 'My listings' },
    ] },
  { key: 'restaurants', name: 'Restaurants', what: 'Somewhere to eat, chosen around what you can and cannot have.',
    says: ['dinner', 'eat out', 'book a table', 'restaurant'],
    rooms: [
      { path: '/restaurants/discover', label: 'Discover' },
      { path: '/restaurants/reservations', label: 'Reservations' },
      { path: '/restaurants/orders', label: 'Orders' },
    ] },
  { key: 'services', name: 'Local Services', what: 'The people who fix, teach and take care of things near you.',
    says: ['plumber', 'electrician', 'tutor', 'a service', 'repair'],
    rooms: [
      { path: '/services/browse', label: 'Find a service' },
      { path: '/services/list', label: 'List your business' },
      { path: '/services/mine', label: 'My business' },
      { path: '/services/regulars', label: 'Regulars' },
      { path: '/services/offers', label: 'Daily offers' },
      { path: '/services/messages', label: 'Messages' },
    ] },
  { key: 'social', name: 'Social', what: 'The city feed, and the things you post to it.',
    says: ['feed', 'posts', 'thoughts'],
    rooms: [
      { path: '/social/feed', label: 'Feed' },
      { path: '/social/create', label: 'Create' },
      { path: '/social/saved', label: 'Saved' },
    ] },
  { key: 'travel', name: 'Travel', what: 'Trips, flights, and everything you have booked.',
    says: ['flights', 'trip', 'holiday', 'travel', 'my bookings'],
    rooms: [
      { path: '/travel/explore', label: 'Explore trips' },
      { path: '/travel/flights', label: 'Flights' },
      { path: '/travel/bookings', label: 'My bookings' },
    ] },
];

/** Everywhere that is not a hub. */
export const EVERYWHERE: Room[] = [
  { path: '/profile/master', label: 'Master Profile', says: ['my details', 'my profile', 'what you know about me'] },
  { path: '/settings/privacy', label: 'Privacy', says: ['privacy', 'my data', 'who can see'] },
  { path: '/calendar', label: 'Calendar', says: ['calendar', "what's on", 'my week'] },
  { path: '/drive', label: 'Drive', says: ['my files', 'documents', 'drive'] },
  { path: '/chats', label: 'Chats', says: ['messages', 'chats'] },
  { path: '/mail', label: 'Mail', says: ['email', 'inbox', 'mail'] },
  { path: '/connections', label: 'Connections', says: ['my people', 'contacts', 'connections'] },
];

/* ────────────────────────────────────────────────────────────────────────────
   THE GRAPH — what one fact does everywhere else.
   ──────────────────────────────────────────────────────────────────────────── */

export interface Personalisation {
  /** The thing they tell the city. */
  fact: string;
  /** Where it is entered. Exactly one place owns each field — that is the rule. */
  toldAt: string;
  /** What changes elsewhere, in consequences rather than features. */
  changes: string[];
  /** True where a consent gate stands between the fact and the hubs that use it. */
  consented?: boolean;
  /** How Mira offers it, unprompted, when it is missing. */
  offer: string;
}

/**
 * The spine of the product, written as consequences.
 *
 * Every line is phrased as what CHANGES, never as what is collected — because
 * "we collect your allergens" is a privacy policy and "no restaurant that
 * serves you peanuts will be shown to you again" is a reason.
 */
export const PERSONALISATION: Personalisation[] = [
  {
    fact: 'Food allergies',
    toldAt: '/nutrition/preferences',
    changes: [
      'Restaurants stops showing you venues that serve it, and says how many it hid.',
      'Your weekly meal plan will never contain it.',
      'Beauty screens the same words against ingredients.',
    ],
    offer: 'Tell me once what you can’t eat and three hubs stop getting it wrong. Want to do that now?',
  },
  {
    fact: 'Date, time and place of birth',
    toldAt: '/profile/master',
    changes: [
      'Astrology writes you a letter each morning instead of a generic one.',
      'Dating uses the same details — you never type them twice.',
    ],
    offer: 'Your birth details unlock the daily letter, and Dating reuses them. Two minutes, once.',
  },
  {
    fact: 'A blood report',
    toldAt: '/medical/blood',
    changes: [
      'It is read back to you in plain words, not a table of ranges.',
      'With your consent, your meal plan is built around what it found.',
    ],
    consented: true,
    offer: 'Upload a blood report and your food plan starts working from your actual numbers — but only if you say so, separately.',
  },
  {
    fact: 'Height, weight and activity level',
    toldAt: '/profile/master',
    changes: [
      'Nutrition computes real targets rather than an average person’s.',
      'Fitness builds the plan from the same numbers.',
    ],
    offer: 'Three numbers and both the food and the training stop guessing.',
  },
  {
    fact: 'Dietary preference',
    toldAt: '/nutrition/preferences',
    changes: [
      'The weekly plan and the recipe library both narrow to it.',
      'Restaurants leads with places that can actually feed you.',
    ],
    offer: 'Say how you eat and the whole food side of the city rearranges.',
  },
  {
    fact: 'Health conditions',
    toldAt: '/profile/master',
    changes: [
      'Meal planning applies the clinical rules for them.',
      'Restaurants stops recommending dishes that work against them.',
    ],
    consented: true,
    offer: 'If you tell me about a condition, the food side stops working against it. It stays where you put it.',
  },
  {
    fact: 'Who your people are',
    toldAt: '/connections',
    changes: [
      'I can act on “Mum”, “my sister”, “the group” without asking who you mean.',
      'Family-only surfaces know who counts as family.',
    ],
    offer: 'Label a few of your connections and I stop asking you which Sarah.',
  },
  {
    fact: 'Skin and hair',
    toldAt: '/beauty/profile',
    changes: [
      'The routine is built from your type rather than a bestseller list.',
      'The market filters to things that suit it.',
    ],
    offer: 'Answer the skin questions once and the routine stops being a generic one.',
  },
  {
    fact: 'Your résumé',
    toldAt: '/jobs/resume',
    changes: ['Matches are scored against what you have actually done.'],
    offer: 'Put your résumé in once and the matches stop being a job board.',
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Lookup
   ──────────────────────────────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * A match, WITH ITS SCORE.
 *
 * The score used to be discarded at the return, and discarding it is what
 * produced the disambiguation loop the owner found in production: two hits
 * came back, the service saw "two", and it asked — even when the first was an
 * exact name match and the second merely contained the word. `Astrology` at
 * 1.0 beside `Astrology Log` at 0.5 is an answer with a runner-up, not a tie.
 *
 * A caller cannot tell those apart without the number, so the number leaves.
 */
export interface Found { label: string; path: string; hub?: string; why: string; score: number }

/**
 * "Where do I find…" — the question the hub wall cannot answer.
 *
 * Deliberately returns at most a handful. A citizen who asked where something
 * is wants to be taken there, not handed a search results page — that is the
 * thing they were already stuck in.
 */
/**
 * WHOLE WORDS, NOT SUBSTRINGS — and this one line was half of a real loop.
 *
 * `'take me to astrology'.includes('log')` is TRUE. "log" sits inside
 * "astroLOGy", so the room called Log scored 0.8 against a sentence that had
 * nothing to do with it, tied with the hub the citizen actually named, and she
 * asked "Astrology or Log? Which one?" — then asked it again when they
 * answered, for ever.
 *
 * A raw `includes` on normalised text is the kind of matcher that looks correct
 * in every example you think to try, because the failures are words hiding
 * inside longer words: "art" in "start", "ate" in "later", "log" in astrology.
 */
function holds(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(haystack);
}

export function findInCity(q: string, limit = 3): Found[] {
  const hay = norm(q);
  if (!hay) return [];
  const hits: Array<Found & { score: number }> = [];

  const consider = (label: string, path: string, terms: string[], hub?: string) => {
    let score = 0;
    for (const t of terms) {
      const n = norm(t);
      if (!n) continue;
      if (hay === n) score = Math.max(score, 1);
      else if (holds(hay, n)) score = Math.max(score, 0.8);
      else if (holds(n, hay) && hay.length > 3) score = Math.max(score, 0.5);
    }
    if (score > 0) hits.push({ label, path, hub, why: `matched “${label}”`, score });
  };

  for (const hub of CITY) {
    consider(hub.name, hub.rooms[0]?.path ?? `/${hub.key}`, [hub.name, ...(hub.says ?? [])], hub.key);
    for (const r of hub.rooms) consider(r.label, r.path, [r.label, ...(r.says ?? [])], hub.key);
  }
  for (const r of EVERYWHERE) consider(r.label, r.path, [r.label, ...(r.says ?? [])]);

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ label, path, hub, why, score }) => ({ label, path, hub, why, score }));
}

/*
 * `nextPersonalisation` lived here — "what she can still offer to learn,
 * consented facts never volunteered first". It had no caller: proactively
 * offering to learn something is phase 5, and this was written three phases
 * early. Removed rather than left exported, because an export with no importer
 * is where a feature gets built by mistake. It is in the history when phase 5
 * arrives.
 */

/** Everything one fact changes — for "why do you need that?". Always answerable. */
export function whyWeAsk(fact: string): Personalisation | undefined {
  return PERSONALISATION.find((p) => norm(p.fact) === norm(fact));
}
