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
    says: ['horoscope', 'my chart', 'stars', 'zodiac', 'kundli'],
    rooms: [
      { path: '/astrology/today', label: 'Today', says: ['my horoscope', 'todays letter', 'daily reading', 'rashifal'] },
      { path: '/astrology/monthly', label: 'This month', says: ['monthly horoscope', 'the month ahead', 'this months letter'] },
      { path: '/astrology/ask', label: 'Ask', says: ['ask the astrologer', 'ask about my chart', 'a consultation'] },
      /* POINTS AT THE MASTER PROFILE, WHICH IS WHERE THEY ARE ACTUALLY TYPED.
         `/astrology/birth` is not a page — the graph below already says birth
         details are told at `/profile/master` and that Matchmaking reuses them, so
         the room was naming a door that does not open. Harmless while nothing
         could find it; not harmless now that "janam" and "time of birth" do. */
      { path: '/profile/master', label: 'Birth details', says: ['birth chart', 'time of birth', 'where i was born', 'janam'] },
      { path: '/astrology/gemstones', label: 'Gemstones', says: ['gemstone', 'my stone', 'ratna'] },
      { path: '/astrology/remedies', label: 'Remedies', says: ['remedy', 'upay', 'what to do about it'] },
      { path: '/astrology/tarot', label: 'Tarot', says: ['a card', 'tarot cards', 'pull a card'] },
    ] },
  { key: 'beauty', name: 'Beauty', what: 'Your skin and hair, a routine built from them, and somewhere to buy it.',
    says: ['skincare', 'hair', 'makeup', 'cosmetics'],
    rooms: [
      { path: '/beauty/profile', label: 'Skin & hair profile', says: ['my skin', 'skin type', 'hair type'] },
      { path: '/beauty/routine', label: 'Routine', says: ['my routine', 'skincare routine', 'my steps'] },
      { path: '/beauty/market', label: 'Market', says: ['beauty market', 'buy skincare', 'beauty products'] },
      { path: '/beauty/orders', label: 'Orders', says: ['beauty orders', 'my beauty orders', 'what i ordered from beauty'] },
    ] },
  /* THE HUB IS MATCHMAKING (31 Aug), AND `says` KEEPS BOTH WORDS.
     A label is what Mira SAYS; `says` is what a citizen says to her, and
     people will go on asking for "dating" for a long time — it is the word
     they have used for a year and the word the rest of the world uses. Taking
     it out would make the rename a small act of not listening. So the names
     move and the ears do not narrow. */
  { key: 'dating', name: 'Matchmaking', what: 'Curated matches, and chats that stay separate from everything else.',
    says: ['dates', 'dating', 'matchmaking', 'my dating profile', 'my matchmaking profile'],
    rooms: [
      { path: '/matchmaking/profile', label: 'Matchmaking profile', says: ['my dating profile', 'my matchmaking profile', 'how i look on dating', 'how i look on matchmaking'] },
      { path: '/matchmaking/matches', label: 'Curated matches', says: ['matches', 'my matches', 'who liked me'] },
      /* "Matchmaking chats" rather than "Chats", which is what the hub's own menu
         calls it — and what stops two rooms in the index answering to the same
         name. `/chats` is also labelled Chats, so "my chats" produced "Chats or
         Chats. Which one?" and `resolveChoice` handed back the first either
         way, making this room unreachable through the question that was asked
         about it. */
      { path: '/matchmaking/chats', label: 'Matchmaking chats', says: ['dating chats', 'matchmaking chats', 'who i am talking to'] },
    ] },
  { key: 'entertainment', name: 'Entertainment', what: 'What is on, what to stream, and a list of what you meant to watch.',
    says: ['films', 'what to watch', 'cinema'],
    rooms: [
      { path: '/entertainment/movies', label: 'Movies now', says: ['movies', 'whats on', 'tickets'] },
      { path: '/entertainment/ott', label: 'Streaming', says: ['ott', 'what to stream', 'netflix'] },
      { path: '/entertainment/watchlist', label: 'Watchlist', says: ['what i meant to watch', 'saved shows'] },
    ] },
  { key: 'financial', name: 'Financial', what: 'Your wallet, what you have spent, and the budgets you set yourself.',
    says: ['money', 'my finances', 'finance'],
    rooms: [
      { path: '/financial/wallet', label: 'Wallet', says: ['my balance', 'balance', 'paisa', 'top up'] },
      { path: '/financial/spending', label: 'Spending', says: ['what i spent', 'expenses', 'kharcha'] },
      { path: '/financial/budgets', label: 'Budgets', says: ['budget', 'my budget', 'my limits'] },
      { path: '/financial/transactions', label: 'Transactions', says: ['payments', 'my payments', 'what went out'] },
    ] },
  { key: 'fitness', name: 'Fitness', what: 'A plan built from your body and your goal, and a log of what you did.',
    says: ['workout', 'training', 'gym', 'exercise'],
    rooms: [
      { path: '/fitness/profile', label: 'Training profile', says: ['my training profile', 'my level'] },
      /* LABELLED "Training plan", NOT "Plan" — and the rename is the whole fix
         for a real misroute. `holds` matches whole words, so the one-word label
         "Plan" sat inside "meal plan" and scored 0.8 against a question about
         FOOD, which nothing in Nutrition could beat. A label short enough to be
         a word in somebody else's sentence is a label that answers somebody
         else's question. */
      { path: '/fitness/plan', label: 'Training plan', says: ['workout plan', 'my training plan', 'my programme'] },
      { path: '/fitness/log', label: 'Log', says: ['workout log', 'what i did', 'activity log'] },
    ] },
  { key: 'jobs', name: 'Jobs', what: 'Your résumé, roles that match it, and what you have applied to.',
    says: ['work', 'jobs', 'kaam', 'naukri'],
    rooms: [
      { path: '/jobs/profile', label: 'Résumé', says: ['my cv', 'resume', 'my resume', 'upload my cv'] },
      { path: '/jobs/matches', label: 'Matches', says: ['job matches', 'roles for me', 'openings', 'vacancies'] },
      { path: '/jobs/applications', label: 'Applications', says: ['what i applied to', 'my applications'] },
    ] },
  { key: 'medical', name: 'Medical', what: 'Your records, your blood work read back in plain words, and who may see it.',
    says: ['health', 'doctor', 'my health'],
    rooms: [
      { path: '/medical/blood', label: 'Blood analysis', says: ['blood', 'blood report', 'blood test', 'my blood work', 'upload my blood report'] },
      { path: '/medical/records', label: 'Records', says: ['my records', 'medical records', 'health records'] },
      { path: '/medical/consent', label: 'Consent', says: ['who can see my health', 'medical consent'] },
      { path: '/medical/medicines', label: 'Medicines', says: ['medicine', 'medicines', 'pills', 'tablets', 'my prescription', 'dawai'] },
    ] },
  { key: 'nutrition', name: 'Nutrition', what: 'A week of meals built for your body, and the list to shop it.',
    says: ['food', 'meals', 'what to eat', 'diet', 'khana'],
    rooms: [
      { path: '/nutrition/preferences', label: 'Preferences', says: ['allergies', 'my allergies', 'food allergies', 'what i cant eat', 'how i eat', 'vegetarian'] },
      { path: '/nutrition/weekly', label: 'Weekly plan', says: ['meal plan', 'my meal plan', 'food plan', 'diet plan', 'what am i eating this week'] },
      { path: '/nutrition/grocery', label: 'Lists', says: ['shopping list', 'grocery list', 'groceries', 'what to buy'] },
      { path: '/nutrition/recipes', label: 'Recipes', says: ['recipe', 'my recipes', 'what to cook'] },
    ] },
  { key: 'realestate', name: 'Real Estate', what: 'Places to live, and the ones you have listed.',
    says: ['property', 'flat', 'house', 'rent', 'buy a place', 'ghar', 'makaan'],
    rooms: [
      { path: '/realestate/explore', label: 'Explore', says: ['explore', 'places to live', 'flats for rent', 'find a flat'] },
      { path: '/realestate/mine', label: 'My listings', says: ['my property', 'what i listed'] },
    ] },
  { key: 'services', name: 'Local Services', what: 'The people who fix, teach and take care of things near you.',
    says: ['plumber', 'electrician', 'tutor', 'a service', 'repair', 'handyman'],
    rooms: [
      { path: '/services/browse', label: 'Find a service', says: ['find a plumber', 'hire someone', 'book a service'] },
      { path: '/services/list', label: 'List your business', says: ['list my business', 'add my business', 'advertise my business'] },
      { path: '/services/mine', label: 'My business', says: ['my shop', 'my services'] },
      { path: '/services/regulars', label: 'Regulars', says: ['my regulars', 'people i book often'] },
      { path: '/services/offers', label: 'Daily offers', says: ['offers', 'deals', 'discounts'] },
      { path: '/services/messages', label: 'Messages', says: ['service messages', 'messages from a provider'] },
    ] },
  { key: 'social', name: 'Social', what: 'The city feed, and the things you post to it.',
    says: ['social', 'posts'],
    rooms: [
      { path: '/social/feed', label: 'Feed', says: ['the feed', 'city feed', 'whats happening'] },
      { path: '/social/create', label: 'Create', says: ['post something', 'write a post', 'share something'] },
      { path: '/social/saved', label: 'Saved', says: ['saved posts', 'what i saved'] },
    ] },
  { key: 'travel', name: 'Travel', what: 'Trips, flights, and everything you have booked.',
    says: ['trip', 'holiday', 'travel'],
    rooms: [
      { path: '/travel/explore', label: 'Explore trips', says: ['explore', 'trip ideas', 'where to go'] },
      { path: '/travel/flights', label: 'Flights', says: ['book a flight', 'my flights'] },
      { path: '/travel/bookings', label: 'My bookings', says: ['bookings', 'my trips', 'what i booked'] },
    ] },
];

/**
 * Everywhere that is not a hub.
 *
 * Seven of these arrived on 21 Aug because the executor was already SENDING
 * citizens to them — `/profile`, `/thoughts`, the settings pages — while the
 * index that is meant to FIND things did not know they existed. A destination
 * she can navigate to and cannot find is the worst of both: it works when she
 * guesses and fails when she is asked.
 */
export const EVERYWHERE: Room[] = [
  { path: '/profile', label: 'My Profile', says: ['profile', 'my profile'] },
  { path: '/profile/master', label: 'Master Profile', says: ['my details', 'master profile', 'what you know about me'] },
  { path: '/settings', label: 'Settings', says: ['settings', 'preferences', 'my account', 'delete my account', 'close my account', 'change my password'] },
  { path: '/settings/privacy', label: 'Privacy', says: ['privacy', 'my data', 'who can see', 'permissions'] },
  { path: '/social/notifications', label: 'Notifications', says: ['notifications', 'alerts', 'my notifications'] },
  { path: '/calendar', label: 'Calendar', says: ['calendar', "what's on", 'my week', 'my schedule'] },
  { path: '/drive', label: 'Drive', says: ['my files', 'documents', 'drive', 'my uploads'] },
  { path: '/thoughts', label: 'Thoughts', says: ['thoughts', 'journal', 'my journal', 'diary', 'my notes'] },
  { path: '/personal/album', label: 'Album', says: ['photos', 'my photos', 'pictures', 'my videos', 'gallery'] },
  { path: '/chats', label: 'Chats', says: ['chat', 'chats', 'my chats', 'messages', 'my messages'] },
  { path: '/mail', label: 'Mail', says: ['email', 'inbox', 'mail', 'my email'] },
  { path: '/connections', label: 'Connections', says: ['my people', 'contacts', 'connections', 'friends'] },
  { path: '/help', label: 'Help', says: ['help', 'support', 'how does this work'] },
  /* "Search" has no page of its own — it is the palette in the header, and a
     palette is not somewhere she can take somebody. The all-hubs index is the
     nearest true answer, and "everything is through here" beats saying nothing
     at all to the commonest word a lost citizen types. */
  { path: '/hubs', label: 'Everything in the city', says: ['search', 'find something', 'all hubs', 'everything'] },
];

/* ────────────────────────────────────────────────────────────────────────────
   THE GRAPH — what one fact does everywhere else.
   ──────────────────────────────────────────────────────────────────────────── */

export interface Personalisation {
  /** The thing they tell the city. */
  fact: string;
  /**
   * What a citizen actually types when they mean it.
   *
   * `whyWeAsk` used to demand that the WHOLE utterance equal the fact, so the
   * only person who ever reached this graph was one who typed "food allergies"
   * and nothing else. "Where do I set my allergies" — the example in this
   * file's own header, and the question the feature was written for — reached
   * nothing at all. Same field as `Room.says` and here for the same reason: a
   * fact is named one way in a schema and five ways by people.
   */
  says?: string[];
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
 * "we collect your allergens" is a privacy policy and "no meal plan we build
 * will ever contain peanuts" is a reason.
 */
export const PERSONALISATION: Personalisation[] = [
  {
    fact: 'Food allergies',
    says: ['allergies', 'my allergies', 'allergy', 'food allergy', 'what i cant eat'],
    toldAt: '/nutrition/preferences',
    changes: [
      'Your weekly meal plan will never contain it.',
      'Beauty screens the same words against ingredients.',
    ],
    offer: 'Tell me once what you can’t eat and three hubs stop getting it wrong. Want to do that now?',
  },
  {
    fact: 'Date, time and place of birth',
    says: ['birth details', 'my birth details', 'time of birth', 'birth chart', 'when i was born'],
    toldAt: '/profile/master',
    changes: [
      'Astrology writes you a letter each morning instead of a generic one.',
      'Matchmaking uses the same details — you never type them twice.',
    ],
    offer: 'Your birth details unlock the daily letter, and Matchmaking reuses them. Two minutes, once.',
  },
  {
    fact: 'A blood report',
    says: ['blood report', 'my blood report', 'upload my blood report', 'blood test results'],
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
    says: ['my height', 'my weight', 'my measurements', 'height and weight'],
    toldAt: '/profile/master',
    changes: [
      'Nutrition computes real targets rather than an average person’s.',
      'Fitness builds the plan from the same numbers.',
    ],
    offer: 'Three numbers and both the food and the training stop guessing.',
  },
  {
    fact: 'Dietary preference',
    says: ['dietary preference', 'how i eat', 'vegetarian', 'vegan', 'my diet'],
    toldAt: '/nutrition/preferences',
    changes: [
      'The weekly plan and the recipe library both narrow to it.',
    ],
    offer: 'Say how you eat and the whole food side of the city rearranges.',
  },
  {
    fact: 'Health conditions',
    says: ['health conditions', 'my conditions', 'medical conditions'],
    toldAt: '/profile/master',
    changes: [
      'Meal planning applies the clinical rules for them.',
    ],
    consented: true,
    offer: 'If you tell me about a condition, the food side stops working against it. It stays where you put it.',
  },
  {
    fact: 'Who your people are',
    says: ['my people', 'who my family is', 'label my connections'],
    toldAt: '/connections',
    changes: [
      'I can act on “Mum”, “my sister”, “the group” without asking who you mean.',
      'Family-only surfaces know who counts as family.',
    ],
    offer: 'Label a few of your connections and I stop asking you which Sarah.',
  },
  {
    fact: 'Skin and hair',
    says: ['my skin', 'skin type', 'my hair', 'hair type'],
    toldAt: '/beauty/profile',
    changes: [
      'The routine is built from your type rather than a bestseller list.',
      'The market filters to things that suit it.',
    ],
    offer: 'Answer the skin questions once and the routine stops being a generic one.',
  },
  {
    fact: 'Your résumé',
    says: ['my resume', 'my cv', 'upload my cv'],
    toldAt: '/jobs/profile',
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

/**
 * A TRAILING S, AND NOTHING ELSE.
 *
 * "budget" did not find Budgets and "recipe" did not find Recipes, which is the
 * single most common way a real query misses: people type the singular of a
 * plural label about half the time. This is not a stemmer and must not become
 * one — a real stemmer turns "medicines" into "medicin" and starts matching
 * words nobody typed, and the failures of an over-eager stemmer are impossible
 * to explain to the person they happened to.
 */
const stem = (s: string): string => s.replace(/(\w{3,})s\b/g, '$1');

/**
 * Levenshtein ≤ 1, decided rather than computed.
 *
 * "buget" and "calender" are the two typos in the support log, and both are one
 * edit from a word she knows. One edit is one pass — a distance MATRIX here
 * would be twenty lines of table nobody reads to answer a yes/no question.
 */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  if (i === short.length) return true;
  return short.length === long.length
    ? short.slice(i + 1) === long.slice(i + 1)
    : short.slice(i) === long.slice(i + 1);
}

/**
 * FIVE CHARACTERS, AND ONE WORD.
 *
 * Below five, one edit is not a typo — it is a different word: "plan" and
 * "plans", "log" and "dog", "list" and "last". And a typo allowance on a phrase
 * would let two edits in through the back door, one per word. So the tolerance
 * is deliberately the smallest thing that catches a slipped finger and nothing
 * that catches a change of mind.
 */
const TYPO_MIN = 5;

function nearMiss(hay: string, term: string): boolean {
  if (term.length < TYPO_MIN || term.includes(' ')) return false;
  return hay.split(' ').some((w) => w.length >= TYPO_MIN && w !== term && oneEdit(w, term));
}

/**
 * How near a match is, on one term, and the whole ladder in one place.
 *
 * The rungs are ordered so that a weaker kind of match can never outrank a
 * stronger one across two different rooms — a typo is worth less than a plural
 * is worth less than the word itself. That ordering is what lets the service
 * navigate on a gap rather than ask on a tie.
 */
function scoreTerm(hay: string, hayStem: string, term: string): number {
  if (!term) return 0;
  if (hay === term) return 1;
  const termStem = stem(term);
  if (hayStem === termStem) return 0.9;
  // Contained, which is always PARTIAL: a term that is inside what they said
  // and not equal to it necessarily covers fewer words than they typed. It used
  // to score 0.8, which put "beauty orders" (the whole phrase, one room) only
  // 0.2 clear of "orders" (one word, three of them) — inside the margin the
  // service needs to answer instead of asking, so she asked about a phrase that
  // named exactly one room. Covering all of a question is better evidence than
  // covering a word of it, and the numbers now say so.
  if (holds(hay, term) || holds(hayStem, termStem)) return 0.75;
  if (nearMiss(hayStem, termStem)) return 0.6;
  // Reverse containment: they said "orders" and the room is called "My Orders".
  // Weak by design, and see FLOOR below for what it is not enough for.
  if (holds(term, hay) && hay.length > 3) return 0.5;
  return 0;
}

/**
 * ONE HIT, ON ITS OWN, HAS TO BE WORTH SOMETHING.
 *
 * "list" matched "List your business" at 0.5 by reverse containment, had no
 * runner-up, passed the contest the service runs, and became a CONFIDENT
 * navigation into somebody's business listing form. The contest only ever
 * compared the top two — a lone result skipped it entirely, so the weakest
 * possible evidence produced the most decisive possible behaviour.
 *
 * The floor is raised here rather than reverse containment being lowered,
 * because reverse containment is right when something else corroborates it: two
 * weak hits are a genuine "which one?", and it is only the UNOPPOSED weak hit
 * that is a bad guess dressed as an answer. Below the floor and alone, she says
 * nothing and the conversation lane takes the turn — which is the outcome the
 * whole framework prefers to a wrong door.
 */
const FLOOR = 0.6;

const HUB_NAME = new Map(CITY.map((h) => [h.key, h.name] as const));

/**
 * "Where do I find…" — the question the hub wall cannot answer.
 *
 * Deliberately returns at most a handful. A citizen who asked where something
 * is wants to be taken there, not handed a search results page — that is the
 * thing they were already stuck in.
 */
export function findInCity(q: string, limit = 3): Found[] {
  const hay = norm(q);
  if (!hay) return [];
  const hayStem = stem(hay);
  const hits: Array<Found & { isHub: boolean }> = [];

  const consider = (label: string, path: string, terms: string[], hub?: string, isHub = false) => {
    let score = 0;
    for (const t of terms) score = Math.max(score, scoreTerm(hay, hayStem, norm(t)));
    if (score > 0) hits.push({ label, path, hub, why: `matched “${label}”`, score, isHub });
  };

  for (const hub of CITY) {
    consider(hub.name, hub.rooms[0]?.path ?? `/${hub.key}`, [hub.name, ...(hub.says ?? [])], hub.key, true);
    for (const r of hub.rooms) consider(r.label, r.path, [r.label, ...(r.says ?? [])], hub.key);
  }
  for (const r of EVERYWHERE) consider(r.label, r.path, [r.label, ...(r.says ?? [])]);

  /**
   * ONE PATH, ONE ANSWER.
   *
   * "wallet" matched the Financial hub AND the Wallet room, and a hub's path is
   * its first room's — so she asked "Financial or Wallet? Which one?" about two
   * options that went to the identical page. A question whose answers are the
   * same answer is not a disambiguation, it is a turn spent on nothing, and the
   * citizen has to guess what distinction she thinks she is drawing.
   *
   * The room wins a tie because the room is the thing they named: "Wallet. Want
   * me to take you?" reads as an answer and "Financial." reads as a category.
   */
  const bestPerPath = new Map<string, Found & { isHub: boolean }>();
  for (const h of hits) {
    const kept = bestPerPath.get(h.path);
    if (!kept || h.score > kept.score || (h.score === kept.score && kept.isHub && !h.isHub)) {
      bestPerPath.set(h.path, h);
    }
  }

  const found = [...bestPerPath.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  if (found.length === 1 && found[0].score < FLOOR) return [];
  return qualify(found);
}

/**
 * TWO ROOMS CALLED THE SAME THING MAKE AN UNANSWERABLE QUESTION.
 *
 * Beauty has an Orders and Restaurants has an Orders, so "orders" rendered as
 * "Orders or Orders. Which one?" — and `resolveChoice` returns the first label
 * that matches, so whichever answer they gave, they got Beauty. `/restaurants/
 * orders` was unreachable through this path, permanently, and the question that
 * made it unreachable looked like a bug in her rather than in the map.
 *
 * The hub name is the disambiguator because it is the thing that actually
 * differs, and it is what a person would have said themselves: nobody asks for
 * "the second Orders", they ask for "the restaurant one".
 */
function qualify(found: Array<Found & { isHub?: boolean }>): Found[] {
  const times = new Map<string, number>();
  for (const f of found) times.set(f.label, (times.get(f.label) ?? 0) + 1);
  return found.map(({ label, path, hub, score }) => {
    const clash = (times.get(label) ?? 0) > 1 && hub && HUB_NAME.has(hub);
    const name = clash ? `${HUB_NAME.get(hub as string)} ${label.toLowerCase()}` : label;
    return { label: name, path, hub, why: `matched “${name}”`, score };
  });
}

/*
 * `nextPersonalisation` lived here — "what she can still offer to learn,
 * consented facts never volunteered first". It had no caller: proactively
 * offering to learn something is phase 5, and this was written three phases
 * early. Removed rather than left exported, because an export with no importer
 * is where a feature gets built by mistake. It is in the history when phase 5
 * arrives.
 */

/**
 * Everything one fact changes — for "why do you need that?". Always answerable.
 *
 * SCORED, NOT COMPARED. This asked for `norm(text) === norm(p.fact)` across the
 * whole utterance, which meant the personalisation graph — the actual product,
 * the "tell it once and three hubs stop getting it wrong" — was reachable only
 * by a citizen who typed the exact phrase "food allergies" and nothing else.
 * Nobody types that. They type "where do I set my allergies", which is the
 * example in this file's own header, and it returned undefined.
 *
 * The threshold is high on purpose: this runs BEFORE the place-finder in the
 * service and takes the turn when it hits, so it must be sure. A weak match
 * here would answer a question about a room with a lecture about a field.
 */
const ASKED = 0.7;

export function whyWeAsk(text: string): Personalisation | undefined {
  const hay = norm(text);
  if (!hay) return undefined;
  const hayStem = stem(hay);
  let best: Personalisation | undefined;
  let bestScore = 0;
  for (const p of PERSONALISATION) {
    let score = 0;
    for (const t of [p.fact, ...(p.says ?? [])]) score = Math.max(score, scoreTerm(hay, hayStem, norm(t)));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= ASKED ? best : undefined;
}
