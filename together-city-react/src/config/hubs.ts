import type { HubKey } from '@/types';
import { LABELS } from './labels';

export interface NavItem { key: HubKey; label: string; path: string; }
export interface SideItem { path: string; index: string; label: string; sub: string; }
export interface HubConfig {
  key: HubKey;
  name: string;
  tag: string;
  backPath: string;          // hub landing route
  dark?: boolean;            // dark-themed hubs (dating/entertainment landings)
  items: SideItem[];         // sidebar menu
}

/** Header tabs — ported 1:1 from tc.js NAV (order preserved). */
export const NAV: NavItem[] = [
  { key: 'travel', label: 'Travel', path: '/travel' },
  { key: 'astrology', label: 'Astrology', path: '/astrology' },
  { key: 'nutrition', label: 'Nutrition', path: '/nutrition' },
  { key: 'entertainment', label: 'Entertainment', path: '/entertainment' },
  { key: 'social', label: 'Social life', path: '/social' },
  { key: 'dating', label: 'Dating', path: '/dating' },
  { key: 'realestate', label: 'Real estate', path: '/realestate' },
  { key: 'jobs', label: 'Jobs', path: '/jobs' },
  { key: 'medical', label: 'Medical', path: '/medical' },
  { key: 'financial', label: 'Financial', path: '/financial' },
  { key: 'beauty', label: 'Beauty', path: '/beauty' },
  { key: 'fitness', label: 'Fitness', path: '/fitness' },
  { key: 'services', label: 'Local services', path: '/services' },
  { key: 'mail', label: 'Mail', path: '/mail' },
];

/** Hub metadata — names/taglines ported 1:1 from tc.js SIDE. */
export const HUBS: Record<HubKey, HubConfig> = {
  // LOCAL SERVICES replaced Cars, which was a nav tab and a map building with
  // no rooms behind it — a door onto a coming-soon page for four months. This
  // hub is the opposite shape: everything in it is put there by a citizen, so
  // it is empty on the day it ships and honest about it.
  services: {
    key: 'services', name: 'Local Services', tag: 'The people who fix, teach and take care of things near you', backPath: '/services',
    items: [
      { path: '/services/browse', index: '01', label: 'Find a service', sub: 'By trade and by where you are' },
      { path: '/services/list', index: '02', label: 'List your business', sub: 'Pick a category, name your areas' },
      { path: '/services/mine', index: '03', label: 'My business', sub: 'Edit, close, see who asked' },
      { path: '/services/regulars', index: '04', label: 'Regulars', sub: 'The businesses you keep' },
      { path: '/services/offers', index: '05', label: 'Daily offers', sub: 'What is on today' },
      { path: '/services/messages', index: '06', label: 'Messages', sub: 'Anonymous, and only in this hub' },
    ],
  },
  travel: {
    key: 'travel', name: 'Travel Hub', tag: 'Explore. Dream. Discover. Together.', backPath: '/travel',
    items: [
      { path: '/travel/explore', index: '01', label: 'Explore Trips', sub: 'Curated packages' },
      { path: '/travel/flights', index: '02', label: 'Flights', sub: 'Compare fares & book' },
      { path: '/travel/packages', index: '03', label: 'Packages', sub: 'Curated experiences' },
      { path: '/travel/bookings', index: '04', label: 'My Bookings', sub: 'Flights & packages you have paid for' },
      { path: '/travel/trips', index: '05', label: 'My Trips', sub: 'Bookings & tickets' },
    ],
  },
  restaurants: {
    key: 'restaurants', name: 'Restaurants', tag: 'Exceptional dining, curated for you', backPath: '/restaurants',
    items: [
      { path: '/restaurants/discover', index: '01', label: 'Discover', sub: 'Browse by cuisine & diet' },
      { path: '/restaurants/explore', index: '02', label: 'Explore', sub: 'Curated places near you' },
      { path: '/restaurants/decide', index: '03', label: 'Decide What to Eat', sub: 'Tuned to your food profile' },
      { path: '/restaurants/reservations', index: '04', label: 'Reservations', sub: 'Your table bookings' },
      { path: '/restaurants/orders', index: '05', label: 'My Orders', sub: 'Food orders & wallet' },
    ],
  },
  astrology: {
    key: 'astrology', name: 'Astrology Zone', tag: 'Read the stars, together', backPath: '/astrology', dark: true,
    items: [
      // These two lead to letters, and a letter may not name what produced it.
      // A menu entry sitting four inches away that says "from your chart" gives
      // away in a subtitle exactly what the prose spends 400 words not saying.
      { path: '/astrology/today', index: '01', label: 'Today', sub: 'Your letter for today' },
      { path: '/astrology/monthly', index: '02', label: 'This Month', sub: 'One letter, once a month' },
      // NO PRICE IN A MENU. This said "₹75 · personal consultation" through a
      // paywall coming down and a new one going up, and was wrong both times —
      // a subtitle in a config file cannot know what the server will charge.
      // The screen reads the real number from GET /astrology/ask.
      { path: '/astrology/ask', index: '03', label: 'Ask the Astrologer', sub: 'A private consultation' },
      { path: '/astrology/tarot', index: '04', label: 'Tarot', sub: 'A card a day, and full spreads' },
      { path: '/profile/astrology', index: '05', label: 'Astrology Profile', sub: 'Birth details, entered once' },
    ],
  },
  nutrition: {
    key: 'nutrition', name: 'Nutrition Hub', tag: 'Eat healthy, live better', backPath: '/nutrition',
    items: [
      // Seven destinations were removed by the review (p14, p26) and two were
      // renamed. The removed paths still resolve — see REMOVED_ROUTES — they
      // just no longer have a way in from the menu.
      { path: '/nutrition/blood', index: '01', label: 'Connect with Blood Test', sub: 'Personalise from your labs' },
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
      { path: '/family/connect', index: '01', label: 'Connect Members', sub: 'Roles & permissions' },
      { path: '/family/weekly', index: '02', label: 'Weekly Planner', sub: 'Portioned per member' },
      { path: '/family/daily', index: '03', label: 'Daily Planner', sub: "Today's plate for all" },
      { path: '/family/grocery', index: '04', label: LABELS.groceryLists, sub: 'One combined list' },
      { path: '/family/orders', index: '06', label: 'My Orders', sub: 'Empty until ordering goes live' },
      { path: '/family/pantry', index: '07', label: 'Shared Pantry', sub: 'One household pantry' },
      { path: '/family/search', index: '08', label: 'Search by Ingredients', sub: "Cook from what's in" },
    ],
  },
  social: {
    key: 'social', name: 'Social Life', tag: 'Discover everything around you', backPath: '/social', dark: false,
    items: [
      // The map page was removed by the review (p18) — it had never held a pin.
      { path: '/social/feed', index: '01', label: 'City Feed', sub: 'Moments from around you' },
      { path: '/social/create', index: '02', label: 'Create Post', sub: 'Share a photo, video or plan' },
      { path: '/social/profile', index: '03', label: 'My Profile', sub: 'Story, stats & Post & Earn' },
      { path: '/social/saved', index: '04', label: 'Saved', sub: 'Bookmarked posts & places' },
      // The journal. Built, tested, and listed nowhere.
      { path: '/thoughts', index: '05', label: 'Thoughts', sub: 'Your private journal' },
    ],
  },
  dating: {
    key: 'dating', name: 'Dating Hub', tag: 'Curated, not endless', backPath: '/dating', dark: true,
    items: [
      { path: '/dating/profile', index: '01', label: 'My Dating Profile', sub: 'Birth details & interests' },
      { path: '/dating/matches', index: '02', label: 'Curated Matches', sub: 'Only real matches, ≥75%' },
      { path: '/dating/activity', index: '03', label: 'Activity Dating', sub: 'Meet by doing, not swiping' },
      { path: '/dating/chats', index: '04', label: 'Dating Chats', sub: 'Anonymous, up to three' },
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
  beauty: {
    key: 'beauty', name: 'Beauty Market', tag: 'Science-led, personally curated', backPath: '/beauty',
    items: [
      { path: '/beauty/profile', index: '01', label: 'Skin & Hair Profile', sub: 'Photos, AI assessment & goals' },
      // Directly after the profile, because it is what the profile is FOR — the
      // engine builds a routine from those answers and then nothing offered to
      // show it to anybody.
      { path: '/beauty/routine', index: '02', label: 'Your Routine', sub: 'Built from your profile, in order' },
      { path: '/beauty/market', index: '03', label: 'Beauty Market', sub: 'Curated, matched to you' },
      { path: '/beauty/makeup', index: '04', label: 'Makeup Studio', sub: 'Your personal AI makeup artist' },
      { path: '/beauty/orders', index: '05', label: 'My Orders', sub: 'Your beauty shelf' },
    ],
  },
  medical: {
    key: 'medical', name: 'Medical Hub', tag: 'Your health, one secure place', backPath: '/medical',
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
    key: 'jobs', name: 'Jobs Hub', tag: 'Upload once. We do the rest.', backPath: '/jobs',
    items: [
      { path: '/jobs/profile', index: '01', label: 'Resume & Profile', sub: 'Upload once, we parse it' },
      { path: '/jobs/matches', index: '02', label: 'Jobs for you', sub: 'Ranked by fit' },
      { path: '/jobs/applications', index: '03', label: 'My Applications', sub: 'Track your applies' },
      { path: '/jobs/post', index: '04', label: 'Post a Job', sub: 'Hiring? Publish a role' },
      { path: '/jobs/postings', index: '05', label: 'My Postings', sub: 'Your roles & applicants' },
    ],
  },
  fitness: {
    key: 'fitness', name: 'Fitness', tag: 'Move. Recover. Fuel.', backPath: '/fitness',
    items: [
      { path: '/fitness/profile', index: '01', label: 'Training Profile', sub: 'Age, level, style & body goal' },
      { path: '/fitness/body-goal', index: '02', label: 'Body Goal', sub: 'Diet + workout + health, integrated' },
      { path: '/fitness/plan', index: '03', label: 'My Plan', sub: 'Age & condition-aware week' },
      { path: '/fitness/trainer', index: '04', label: 'Trainer Mode', sub: 'Live AI form coach + voice' },
      { path: '/fitness/workout', index: '05', label: 'Workout', sub: 'Guided live-timer plan' },
      { path: '/fitness/log', index: '06', label: 'Activity Log', sub: 'What you actually did' },
      { path: '/fitness/supplements', index: '07', label: 'Supplements', sub: 'Goal-matched kit' },
      { path: '/fitness/sleep', index: '08', label: 'Sleep Cycle', sub: 'Duration, quality & schedule' },
    ],
  },
  mail: {
    key: 'mail', name: 'Together City Mail', tag: 'Your @togethercity.app inbox', backPath: '/mail',
    items: [
      { path: '/mail/inbox', index: '01', label: 'Inbox', sub: 'Mail from around the city' },
      { path: '/mail/compose', index: '02', label: 'Compose', sub: 'Write a new message' },
      { path: '/mail/sent', index: '03', label: 'Sent', sub: 'Messages that were accepted' },
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
    key: 'financial', name: 'Financial District', tag: 'One city wallet, live today', backPath: '/financial',
    items: [
      { path: '/financial/wallet', index: '01', label: 'City Wallet', sub: 'Balance & top-up' },
      { path: '/financial/spending', index: '02', label: 'Spending', sub: 'Where your money goes' },
      { path: '/financial/budgets', index: '03', label: 'Budgets', sub: 'Caps that track live' },
      { path: '/financial/transactions', index: '04', label: 'Transactions', sub: 'Every hub, one feed' },
    ],
  },
};
