import type { HubKey } from '@/types';
import { LABELS } from './labels';
import { PETS_SIDEBAR } from '@/features/pets/routes';

/**
 * ONE TAB IS NOT A DISTRICT.
 *
 * Personal is the citizen's own drawer — their journal, their calendar, their
 * documents, their album — and it is deliberately NOT a hub: no district on
 * the city map, no photograph, no consent gate, no rail of its own. Its rooms
 * are city-level pages that already existed and were listed nowhere.
 *
 * Widened HERE rather than in `types/index.ts` on purpose: `HubKey` is the set
 * of PLACES the city is made of, and the moment `personal` joins it every map
 * keyed by hub — heroes, portraits, billboard lines, themes, consent — starts
 * owing it an answer it does not have. A tab key is a smaller idea than a hub
 * key, so it gets a smaller type.
 */
export type TabKey = HubKey | 'personal';

export interface NavItem { key: TabKey; label: string; path: string; }
export interface SideItem { path: string; index: string; label: string; sub: string; }
export interface HubConfig {
  key: HubKey;
  name: string;
  tag: string;
  backPath: string;          // hub landing route
  dark?: boolean;            // dark-themed hubs (dating/entertainment landings)
  /** Each of the hub's screens has its own sky. The shell carries the page's
   *  name as `data-sky` and the stylesheet picks the picture. One hub. */
  skies?: boolean;
  items: SideItem[];         // sidebar menu
}

/** ── HEADER TABS, IN ALPHABETICAL ORDER ────────────────────────────────────
 *
 *  This list was "ported 1:1 from tc.js NAV (order preserved)" — which is to
 *  say its order was an accident of a file nobody has opened in a year. It
 *  opened Travel, Astrology, Nutrition, Entertainment, and there is no reading
 *  of this product in which those are the four most important rooms; they were
 *  simply the four somebody typed first.
 *
 *  Thirteen tabs on one line is a list you SCAN rather than one you recognise,
 *  and the only scan order a stranger can predict is the alphabet. It also has
 *  the property an invented order never has: it survives a fourteenth hub.
 *
 *  (The honest alternative is frequency — put the rooms people actually open
 *  first. That beats alphabetical when you know the frequencies. Nothing in
 *  this app measures them yet, so choosing that order today would mean
 *  guessing and calling it data.)
 *
 *  Sorted in the literal so the file reads the way the header renders, AND
 *  sorted again where it is used, so an append lands in its place instead of
 *  at the end.                                                              */
export const NAV: NavItem[] = [
  { key: 'astrology', label: 'Astrology', path: '/astrology' },
  { key: 'beauty', label: 'Beauty', path: '/beauty' },
  /* E-COMMERCE IS BACK ON THE STREET (owner, 22 Aug), and this time it has
     rooms. It sorts between Beauty and Entertainment — it used to say Dating,
     which was true until that hub was renamed Matchmaking and sorted away from
     here. `localeCompare` weighs the hyphen below the letters, so the list
     reads "ECommerce" and 'c' lands before 'n'. a-drawer-of-ones-own.test.ts
     holds the whole run to that order. */
  { key: 'ecommerce', label: 'E-Commerce', path: '/ecommerce' },
  { key: 'entertainment', label: 'Entertainment', path: '/entertainment' },
  /* FINANCIAL LEFT THE STREET (owner, 22 Aug), NOT THE CITY — the same move
     Travel made on 15 Aug, and for a reason that is easier to say: money is
     not a district you walk through, it is a thing that belongs to you. So it
     goes where the rest of what belongs to you already is, as the fifth card
     in the Personal drawer, pointing at the wallet rather than at the hub.
     The hub keeps its config, its five rooms, its routes, its art and its
     place on the home map; the command palette still finds the wallet and the
     spending. What it no longer has is a tab in the header. */
  { key: 'fitness', label: 'Fitness', path: '/fitness' },
  { key: 'jobs', label: 'Jobs', path: '/jobs' },
  { key: 'services', label: 'Local services', path: '/services' },
  { key: 'mail', label: 'Mail', path: '/mail' },
  /* THE HUB IS CALLED MATCHMAKING (31 Aug, owner), AND IT MOVED BECAUSE OF IT.
     Header.tsx sorts this list by LABEL, so the rendered order changed on its
     own the moment the word did — from between Beauty and E-Commerce to
     between Mail and Medical. The literal is hand-sorted to read the way the
     header renders, which is the whole reason a-drawer-of-ones-own.test.ts
     asserts the run, so the entry moves with its word.

     The KEY and the PATH stay `dating`. They are in stored notification hrefs,
     in shared links, in the database and in a hundred route strings, and
     renaming an identifier to match a label is how a rename breaks things
     nobody asked about. The label is what a citizen reads; the key is what the
     app reads. Only one of them changed. */
  { key: 'dating', label: 'Matchmaking', path: '/matchmaking' },
  { key: 'medical', label: 'Medical', path: '/medical' },
  { key: 'nutrition', label: 'Nutrition', path: '/nutrition' },
  // Not a district — the citizen's own drawer. See TabKey above.
  { key: 'personal', label: 'Personal', path: '/personal' },
  /* AFTER Personal, not before it: 'Per' < 'Pet'. This list is asserted to be
     in `localeCompare` order by a-drawer-of-ones-own.test.ts, which caught the
     wrong one — the two labels differ at the third letter and the eye reads
     them as the same word. */
  { key: 'pets', label: 'Pets', path: '/pets' },
  { key: 'realestate', label: 'Real estate', path: '/realestate' },
  // Renamed from "Social life" (owner, 5 Sep): the hub is a television now,
  // and the city's own name is on the set. Still last in `localeCompare` order.
  { key: 'social', label: 'Together City TV', path: '/social' },
  /* TRAVEL LEFT THE STREET (owner, 15 Aug), NOT THE CITY. The hub keeps its
     config, its rooms, its routes and its art below — /travel and every page
     under it still answer, Mira can still take you there, and the command
     palette still finds a flight. What it no longer has is a tab in the
     header and a building on the home page. A hub that is not being shown is
     a different thing from a hub that has been deleted, and this is the
     first. */
];

/** Hub metadata — names/taglines ported 1:1 from tc.js SIDE. */
export const HUBS: Record<HubKey, HubConfig> = {
  // LOCAL SERVICES replaced Cars, which was a nav tab and a map building with
  // no rooms behind it — a door onto a coming-soon page for four months. This
  // hub is the opposite shape: everything in it is put there by a citizen, so
  // it is empty on the day it ships and honest about it.
  services: {
    key: 'services', name: 'Local Services', tag: 'Fix it, learn it, book it — near you', backPath: '/services',
    items: [
      /* TWO DOORS ONTO THE SAME DIRECTORY, AND THE ORDER IS THE ARGUMENT.
         Somebody arriving at this hub has a job in mind — a leaking pipe, a
         maths tutor — not a taxonomy to walk. 01 is one line to say it in;
         02 is the whole list for the day you would rather look than ask. The
         directory did not move: /services/browse is the same screen it was,
         under the name it always deserved. */
      { path: '/services/find', index: '01', label: 'Find a service', sub: 'Say it in your own words' },
      { path: '/services/browse', index: '02', label: 'All listed services', sub: 'By trade and by where you are' },
      { path: '/services/list', index: '03', label: 'List your business', sub: 'Pick a category, name your areas' },
      { path: '/services/mine', index: '04', label: 'My business', sub: 'Edit, close, see who asked' },
      { path: '/services/regulars', index: '05', label: 'Regulars', sub: 'The businesses you keep' },
      { path: '/services/offers', index: '06', label: 'Daily offers', sub: 'What is on today' },
      { path: '/services/messages', index: '07', label: 'Messages', sub: 'Anonymous, and only in this hub' },
      { path: '/services/orders', index: '08', label: 'My orders', sub: 'Paid from your wallet, tracked to the door' },
    ],
  },
  travel: {
    key: 'travel', name: 'Travel', tag: 'Explore, dream, discover — together', backPath: '/travel',
    items: [
      { path: '/travel/explore', index: '01', label: 'Explore Trips', sub: 'Curated packages' },
      { path: '/travel/flights', index: '02', label: 'Flights', sub: 'Compare fares & book' },
      { path: '/travel/packages', index: '03', label: 'Packages', sub: 'Curated experiences' },
      { path: '/travel/bookings', index: '04', label: 'My Bookings', sub: 'Flights & packages you have paid for' },
      { path: '/travel/trips', index: '05', label: 'My Trips', sub: 'Bookings & tickets' },
    ],
  },
  astrology: {
    key: 'astrology', name: 'Astrology', tag: 'Read the stars, together', backPath: '/astrology', dark: true, skies: true,
    items: [
      // This leads to a letter, and a letter may not name what produced it. A
      // menu entry sitting four inches away that says "from your chart" gives
      // away in a subtitle exactly what the prose spends 400 words not saying.
      // The daily letter that sat above it was retired on 5 Sep.
      { path: '/astrology/monthly', index: '01', label: 'This Month', sub: 'One letter, once a month' },
      // NO PRICE IN A MENU. This said "₹75 · personal consultation" through a
      // paywall coming down and a new one going up, and was wrong both times —
      // a subtitle in a config file cannot know what the server will charge.
      // The screen reads the real number from GET /astrology/ask.
      { path: '/astrology/ask', index: '02', label: 'Ask the Astrologer', sub: 'A private consultation' },
      { path: '/astrology/tarot', index: '03', label: 'Tarot', sub: 'A card a day, and full spreads' },
      // The marketplace, and the only place a stone is prescribed. The remedies
      // page kept the practices and gave up its Stones half — two surfaces
      // answering "which stone is mine" from two different readings was the
      // arrangement before this, and it survived only because one of them had
      // no way in from this menu.
      { path: '/astrology/gemstones', index: '04', label: 'Gemstones', sub: 'Personalised stones for your chart' },
      // A locked commission is a decision somebody made and walked away from,
      // and it needs somewhere to be waiting. Without a door in the menu the
      // cart is a page you can only reach from the page you just left.
      { path: '/astrology/gem-checkout', index: '05', label: 'Checkout', sub: 'Stones you have locked' },
      { path: '/astrology/remedies', index: '06', label: 'Remedies', sub: 'Practices for the season you are in' },
      { path: '/profile/astrology', index: '07', label: 'Astrology Profile', sub: 'Birth details, entered once' },
    ],
  },
  nutrition: {
    key: 'nutrition', name: 'Nutrition', tag: 'Eat healthy, live better', backPath: '/nutrition',
    items: [
      // Seven destinations were removed by the review (p14, p26) and two were
      // renamed. The removed paths still resolve — see REMOVED_ROUTES — they
      // just no longer have a way in from the menu.
      { path: '/nutrition/blood', index: '01', label: 'Connect Blood Test', sub: 'Personalise from your labs' },
      { path: '/nutrition/preferences', index: '02', label: 'Food Preference Profile', sub: 'Your taste & goals' },
      { path: '/nutrition/weekly', index: '03', label: 'Weekly Meal Planner', sub: 'Personalised 7-day plan' },
      { path: '/nutrition/grocery', index: '04', label: LABELS.groceryLists, sub: 'Built from your plan' },
      { path: '/nutrition/recipes', index: '05', label: LABELS.createYourOwnMealPlan, sub: 'Browse, add your own, build a list' },
      { path: '/nutrition/journal', index: '06', label: 'AI Food Journal', sub: 'Photo in — logged & counted' },
      // 07. The Save button on every recipe page has worked since the page was
      // built and wrote to a list nothing rendered — GET /nutrition/saved has
      // always returned the recipes, and only the ids were ever read. This is
      // the door to what was already being kept.
      { path: '/nutrition/saved', index: '07', label: 'Saved Recipes', sub: 'The ones you kept' },
      // NEITHER HUB LISTS A CART ANY MORE. A key for a basket sat between the
      // grocery list and the plan on two menus; checkout moved onto the grocery
      // list itself, which is where somebody holding a list actually looks for
      // it. Both /nutrition/cart and /family/cart still resolve — Grocery.tsx
      // links to them — they just no longer take a numbered key.
    ],
  },
  family: {
    key: 'family', name: 'Family Nutrition', tag: 'One table, every plate personal', backPath: '/family',
    items: [
      // The Daily Planner is gone (7 Aug). It showed today's slice of the same
      // household plan the Weekly Planner shows seven days of — one plan, two
      // doors, and the daily one had no answer to "what about tomorrow". Old
      // links land on the weekly view; see REMOVED_ROUTES.
      //
      // The numbering closes up with it. It ran 01-02-03-04-06-07-08 — a gap
      // at 05 from an earlier removal that nobody shut.
      // My Orders and Shared Pantry left the rail on 13 Aug (owner's call).
      // Orders was "empty until ordering goes live" — a door to a room with
      // nothing in it; its route now lands on the grocery list, where the
      // coming-soon notice already is. The pantry is a real feature the
      // grocery arithmetic reads, so its PAGE stays and is linked from the
      // grocery list it feeds — the cart's own precedent from 4 Aug.
      { path: '/family/connect', index: '01', label: 'Connect Members', sub: 'Roles & permissions' },
      { path: '/family/weekly', index: '02', label: 'Weekly Planner', sub: 'Portioned per member' },
      { path: '/family/grocery', index: '03', label: LABELS.groceryLists, sub: 'One combined list' },
      { path: '/family/search', index: '04', label: 'Search by Ingredients', sub: "Cook from what's in" },
    ],
  },
  social: {
    key: 'social', name: 'Together City TV', tag: 'The city, one moment at a time', backPath: '/social', dark: false,
    items: [
      // The map page was removed by the review (p18) — it had never held a pin.
      // Create Post left the rail by the owner's call (15 Aug): the page
      // stays, reached from the feed's + Create and its composer — a verb
      // does not need a room in the list of places.
      // The feed became a television (owner, 5 Sep): one screen, one post at
      // a time, a channel per citizen. Same path, same lens underneath.
      { path: '/social/feed', index: '01', label: 'City TV', sub: 'One moment at a time' },
      // "Post & Earn" and "places" left these two lines (owner, 4 Sep): the
      // rail promises only what exists. The programme is still reachable from
      // the profile chip, labelled not open; places are a caption on a post.
      { path: '/social/profile', index: '02', label: 'My Profile', sub: 'Story, stats & posts' },
      { path: '/social/saved', index: '03', label: 'Saved', sub: 'Bookmarked posts' },
      // Thoughts was here because it was "built, tested, and listed nowhere" —
      // a journal boarding in the social hub for want of anywhere else. It has
      // a home of its own now (Personal), and a private journal listed inside
      // the SOCIAL rail was always the wrong shelf.
    ],
  },
  dating: {
    key: 'dating', name: 'Matchmaking', tag: 'Curated, not endless', backPath: '/matchmaking', dark: true,
    items: [
      { path: '/matchmaking/profile', index: '01', label: 'My Matchmaking Profile', sub: 'Birth details & interests' },
      // THE RAIL IS THE JOURNEY, so it runs in the order the journey does:
      // introduce yourself, look at the city, keep the people who chose you
      // back, talk to them. Potential Matches is where every resident is scored
      // and where liking happens; Curated Matches is only ever MUTUAL, which is
      // why its line no longer advertises a percentage — nobody arrives there
      // by scoring well, only by being chosen back.
      { path: '/matchmaking/browse', index: '02', label: 'Potential Matches', sub: 'Everyone, with your %' },
      { path: '/matchmaking/matches', index: '03', label: 'Curated Matches', sub: 'You both liked each other' },
      // ACTIVITY DATING WAS REMOVED ENTIRELY (27 Aug, launch audit). It had
      // been hidden from this menu since 12 Aug; the audit found its anonymous
      // chats surfacing in the main Chats list under the other person's real
      // name, and its invitations ignoring passes with no way to decline short
      // of a block. Hiding it was not enough, so the page, the invitation
      // engine, both database tables and every /dating/activity endpoint are
      // gone. The numbering below closes up as it already did.
      { path: '/matchmaking/chats', index: '04', label: 'Matchmaking Chats', sub: 'Your conversations' },
      // THE SAFETY CENTRE IS ON THE RAIL, not only behind the report menu.
      // It was reachable from two places, and both of them assume something
      // has already gone wrong: the ⋯ menu on a card, and a block shown to
      // somebody whose own profile was refused. The page carries what we
      // check, what we do not, and four numbers to call — which is reading
      // somebody should be able to do BEFORE they need it, from the same list
      // as everything else in the hub.
      { path: '/matchmaking/safety', index: '05', label: 'Safety Centre', sub: 'What we check, and who to call' },
    ],
  },
  entertainment: {
    key: 'entertainment', name: 'Entertainment', tag: 'Always something worth experiencing', backPath: '/entertainment', dark: true,
    items: [
      { path: '/entertainment/movies', index: '01', label: 'Movies Now', sub: 'In theatres this week' },
      { path: '/entertainment/ott', index: '02', label: 'OTT Watch', sub: 'Stream tonight' },
      { path: '/entertainment/curated', index: '03', label: 'Curated Movies', sub: "Critics' picks & hidden gems" },
      { path: '/entertainment/watchlist', index: '04', label: 'Watchlist', sub: 'Your saved movies & shows' },
    ],
  },
  /* E-COMMERCE — TWO DOORS, AND NOTHING SOLD THAT THE CITY WAS NOT ALREADY
     SELLING. The district was deleted on 10 Aug for being the only one without
     a hub: a photograph of a shop that does not exist, with "Coming soon"
     across the third plate of the walk. It returns wearing the facade the
     owner commissioned — a personalised store on the left, an open market on
     the right — and both rooms are ways in to shops that already exist, in the
     hubs that verified them. There is no catalogue in this hub and no product
     table behind it; see features/ecommerce/README.md for why that is the
     design rather than a first version of one. */
  ecommerce: {
    key: 'ecommerce', name: 'E-Commerce', tag: 'Every shop in the city, through one door', backPath: '/ecommerce',
    items: [
      { path: '/ecommerce/store', index: '01', label: 'Personalized Store', sub: 'The shelves that read your profiles' },
      { path: '/ecommerce/market', index: '02', label: 'Open Market', sub: 'Every category, nothing ranked for you' },
      /* THE CART IS A VIEW, NOT A FOURTH BAG (owner, 22 Aug): "keep individual
         carts and also a cross-hub cart in e-commerce". Every shop still owns
         and shows its own; this room is all of them in one list with one total,
         and one press that places an order in each. */
      { path: '/ecommerce/cart', index: '03', label: 'Your Cart', sub: 'One list, one checkout' },
    ],
  },
  beauty: {
    key: 'beauty', name: 'Beauty', tag: 'Science-led, personally curated', backPath: '/beauty',
    items: [
      { path: '/beauty/profile', index: '01', label: 'Skin & Hair Profile', sub: 'Photos, AI assessment & goals' },
      // THE BUDGET IS NOT A TAB. It had one for an afternoon and it was a
      // second place for one decision — the panel already sits on the profile,
      // directly under the assessment it is spending against, which is where
      // the decision is actually made. A sidebar entry pointing at another
      // page's section highlights the wrong row and teaches nobody anything.
      /* "Your Routine" until the owner renamed it on 22 Aug. The name was
         unambiguous in this rail and ambiguous everywhere else: on the
         E-Commerce floor it stood beside Supplements, Gemstones and Diet plan,
         and a routine of WHAT was the first question the card raised. Renamed
         HERE rather than overridden on the card, because a room with two names
         is a room somebody has to learn twice. */
      { path: '/beauty/routine', index: '02', label: 'Your Beauty Routine', sub: 'Built from your profile + budget' },
      { path: '/beauty/market', index: '03', label: 'Beauty Market', sub: 'Curated, matched to you' },
      // THE MAKEUP STUDIO IS OFF THE MENU (11 Aug), at the owner's word, and
      // that is all that has happened to it: the page, the look engine and
      // GET /beauty/makeup are untouched and /beauty/makeup still resolves.
      // Deleting a working surface to hide it is how a feature comes back as a
      // rewrite; taking the door away is reversible in one line.
      //
      // The numbering closes up behind it rather than leaving a gap at 04 —
      // a menu that counts 01-02-03-05 is a menu with something missing, which
      // is exactly what this is trying not to advertise.
      { path: '/beauty/orders', index: '04', label: 'My Orders', sub: 'Your beauty shelf' },
    ],
  },
  medical: {
    key: 'medical', name: 'Medical', tag: 'Your health, one secure place', backPath: '/medical',
    items: [
      { path: '/medical/blood', index: '01', label: 'Blood Test Analysis', sub: 'Cited, trend-aware panel' },
      { path: '/medical/tests', index: '02', label: 'Order Blood Tests', sub: 'Not yet — upload a report today' },
      { path: '/medical/records', index: '03', label: 'Health Records', sub: 'Reports, analysis & documents' },
      { path: '/medical/consults', index: '04', label: 'Talk to a Doctor', sub: 'Not yet — analyse a report today' },
      { path: '/medical/timeline', index: '05', label: 'Health Timeline', sub: 'Longitudinal history' },
      { path: '/medical/family', index: '06', label: 'Family Profiles', sub: 'Household health at a glance' },
      { path: '/medical/consent', index: '07', label: 'Privacy & Consent', sub: 'Consent controls' },
      // Prescriptions, dose reminders and the allergies you have recorded. This
      // menu has never listed it: the page was reachable only by typing the URL,
      // or by following a reminder notification you could not receive without
      // having been there first.
      { path: '/medical/medicines', index: '08', label: 'Medicines & Reminders', sub: 'Prescriptions, doses & your allergies' },
    ],
  },
  realestate: {
    key: 'realestate', name: 'Real Estate', tag: 'Find where life happens next', backPath: '/realestate',
    items: [
      { path: '/realestate/explore', index: '01', label: 'Explore', sub: 'Discover & book a viewing' },
      { path: '/realestate/under-construction', index: '02', label: 'Under Construction', sub: 'Plans, RERA & progress' },
      { path: '/realestate/sell', index: '03', label: 'List a Property', sub: 'Multi-property, live photos' },
      { path: '/realestate/mine', index: '04', label: 'My Listings', sub: 'Your posted properties' },
    ],
  },
  jobs: {
    key: 'jobs', name: 'Jobs', tag: 'Upload once, we do the rest', backPath: '/jobs',
    items: [
      { path: '/jobs/profile', index: '01', label: 'Resume & Profile', sub: 'Upload once, we parse it' },
      { path: '/jobs/matches', index: '02', label: 'Jobs for you', sub: 'Ranked by fit' },
      { path: '/jobs/applications', index: '03', label: 'My Applications', sub: 'Track your applies' },
      { path: '/jobs/post', index: '04', label: 'Post a Job', sub: 'Hiring? Publish a role' },
      { path: '/jobs/postings', index: '05', label: 'My Postings', sub: 'Your roles & applicants' },
    ],
  },
  fitness: {
    key: 'fitness', name: 'Fitness', tag: 'Move, recover, fuel', backPath: '/fitness',
    items: [
      { path: '/fitness/profile', index: '01', label: 'Training Profile', sub: 'Age, level, style & body goal' },
      { path: '/fitness/body-goal', index: '02', label: 'Body Goal', sub: 'Diet + workout + health, integrated' },
      // MY PLAN IS OFF THE MENU (16 Aug), at the owner's word — and the room is
      // left standing, which is the third time this hub-level decision has been
      // taken and the third time on the same argument: deleting a working
      // surface in order to hide it is how a feature comes back as a rewrite,
      // and taking the door away is one line to put back. FitnessPlan.tsx, the
      // route and GET /fitness/plan are all untouched, so a saved link still
      // opens. Same treatment as the Makeup Studio and Activity Dating, and
      // declared in scripts/nav-audit.mjs for the same reason: hiding a surface
      // has two halves, and only doing the first leaves the audit failing on a
      // silence nobody explained.
      //
      // The numbering closes up rather than leaving a gap at 03: a menu that
      // counts 01-02-04 is a menu advertising the thing it is trying not to
      // advertise.
      // TRAINER MODE IS GONE (20 Aug), at the owner's word — and it is DELETED
      // rather than hidden, which breaks the run of three above it and is worth
      // saying why. My Plan, the Makeup Studio and Activity Dating are working
      // surfaces taken off a menu; the argument for leaving them standing is
      // that the door is one line to put back. Trainer Mode is a camera page
      // that loaded a pose model from a CDN and a speech synthesiser, for three
      // exercises. Left standing it is a route nothing links to, two modules
      // nothing else imports, and a third-party model URL still in the bundle
      // graph — carrying cost with no door. `/fitness/trainer` redirects to
      // Workout in config/labels.ts, so a saved link still lands somewhere real.
      //
      // The numbering closes up, same as it did at 03: a menu that counts
      // 01-02-04 advertises the thing it is trying not to advertise.
      { path: '/fitness/workout', index: '03', label: 'Workout', sub: 'Guided live-timer plan' },
      { path: '/fitness/log', index: '04', label: 'Activity Log', sub: 'What you actually did' },
      { path: '/fitness/supplements', index: '05', label: 'Supplements', sub: 'Read from your blood work' },
      // DIRECTLY UNDER THE PLAN, and not down beside the store, because it is
      // an advising screen rather than a selling one — it carries no bag, no
      // price that leads anywhere and no Add. Numbered into the rail rather
      // than hidden behind the plan page, because the most useful thing on it
      // is a refusal and a refusal nobody can find is a refusal nobody reads.
      { path: '/fitness/multivitamins', index: '06', label: 'Multivitamins', sub: 'Thirty-two labels, assessed' },
      { path: '/fitness/sleep', index: '07', label: 'Sleep Cycle', sub: 'Duration, quality & schedule' },
      { path: '/fitness/store', index: '08', label: 'The Store', sub: 'Verified in India · we take no cut' },
      { path: '/fitness/orders', index: '09', label: 'My Orders', sub: 'Your bag & what you bought' },
    ],
  },
  mail: {
    key: 'mail', name: 'Together City Mail', tag: 'Your @togethercity.app inbox', backPath: '/mail',
    items: [
      // PROJECTS IS NOT ONE OF ALL EMAILS' FOLDERS. This numbered rail is the
      // folders of the room you are standing in, and the door back to the wall
      // hangs below the hairline instead — see Sidebar.tsx, where the project
      // rail keeps its own way out in the same place for the same reason.
      { path: '/mail/inbox', index: '01', label: 'All Email', sub: 'Every message, always' },
      { path: '/mail/compose', index: '02', label: 'Compose', sub: 'Write a new message' },
      { path: '/mail/sent', index: '03', label: 'Sent', sub: 'What went out' },
      // One room for everything still waiting on the citizen: what they were
      // still writing, and what the provider refused. /mail/failed still
      // resolves for old links — see router.
      { path: '/mail/unsent', index: '04', label: 'Drafts & Failed', sub: 'Unfinished, and rejected — pick either up' },
      { path: '/mail/starred', index: '05', label: 'Starred', sub: 'Flagged for later' },
      { path: '/mail/trash', index: '06', label: 'Trash', sub: 'Deleted mail' },
      { path: '/mail/drive', index: '07', label: 'Drive', sub: 'Upload & attach your files' },
    ],
  },
  financial: {
    key: 'financial', name: 'Financial', tag: 'One city wallet, live today', backPath: '/financial',
    items: [
      { path: '/financial/wallet', index: '01', label: 'City Wallet', sub: 'Balance & top-up' },
      { path: '/financial/spending', index: '02', label: 'Spending', sub: 'Where your money goes' },
      { path: '/financial/budgets', index: '03', label: 'Budgets', sub: 'Caps that track live' },
      { path: '/financial/transactions', index: '04', label: 'Transactions', sub: 'Every hub, one feed' },
      { path: '/financial/invoices', index: '05', label: 'Invoices', sub: 'Bills from businesses you use' },
    ],
  },
  /* PET CARE OPENED ON 19 AUG, AND THIS NOTE IS THE OLD ONE CORRECTED.
     It read "a facade, not yet a room": `items: []`, which Home.tsx reads as
     `soon`, so the plate was LABELLED rather than linked — the first hub ever
     to stand in that branch. And it was deliberately absent from NAV, on the
     reasoning that a header tab is a door and there was nothing behind it.

     Both halves are now false and the reasoning behind them is the reason why:
     the door has sixteen rooms behind it, so it joins the tabs, the /hubs grid
     and the walk on the same day its first room does, exactly as this comment
     said it would. The walk's plate says "Explore Pet Products" rather than
     "Explore Pet Care" — see DISTRICT_COPY in Home.tsx, which is the only map
     that override touches. */
  pets: {
    key: 'pets', name: 'Pets', tag: 'Everything your pet needs, in one place', backPath: '/pets',
    /* The sixteen rooms live with the feature that owns them, so adding a room
       is one edit there rather than two — one here and one in the router. */
    items: PETS_SIDEBAR,
  },
};
