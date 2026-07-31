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
  { key: 'travel', label: 'TRAVEL', path: '/travel' },
  { key: 'astrology', label: 'ASTROLOGY', path: '/astrology' },
  { key: 'nutrition', label: 'NUTRITION', path: '/nutrition' },
  { key: 'entertainment', label: 'ENTERTAINMENT', path: '/entertainment' },
  { key: 'social', label: 'SOCIAL LIFE', path: '/social' },
  { key: 'dating', label: 'DATING', path: '/dating' },
  { key: 'realestate', label: 'REAL ESTATE', path: '/realestate' },
  { key: 'jobs', label: 'JOBS', path: '/jobs' },
  { key: 'medical', label: 'MEDICAL', path: '/medical' },
  { key: 'financial', label: 'FINANCIAL', path: '/financial' },
  { key: 'beauty', label: 'BEAUTY', path: '/beauty' },
  { key: 'fitness', label: 'FITNESS', path: '/fitness' },
  { key: 'cars', label: 'CARS', path: '/cars' },
  { key: 'mail', label: 'MAIL', path: '/mail' },
];

/** Hub metadata — names/taglines ported 1:1 from tc.js SIDE. */
export const HUBS: Record<HubKey, HubConfig> = {
  // Cars is a coming-soon teaser (see CarsComingSoon): a nav tab + map building,
  // no inner pages yet, so `items` is empty.
  cars: { key: 'cars', name: 'Cars Hub', tag: 'Drive the future.', backPath: '/cars', items: [] },
  travel: {
    key: 'travel', name: 'Travel Hub', tag: 'Explore. Dream. Discover. Together.', backPath: '/travel',
    items: [
      { path: '/travel/explore', index: '01', label: 'Explore Trips', sub: 'Curated packages' },
      { path: '/travel/flights', index: '02', label: 'Flights', sub: 'Compare fares & book' },
      { path: '/travel/trains', index: '03', label: 'Trains', sub: 'Rail across India' },
      { path: '/travel/hotels', index: '04', label: 'Hotels', sub: 'Find the perfect stay' },
      { path: '/travel/packages', index: '05', label: 'Packages', sub: 'Curated experiences' },
      { path: '/travel/visa', index: '06', label: 'Visa Services', sub: 'Three steps, zero stress' },
      { path: '/travel/insurance', index: '07', label: 'Travel Insurance', sub: 'Covered, wherever you go' },
      { path: '/travel/guide', index: '08', label: 'Travel Guide', sub: 'Editorial guides & tips' },
      { path: '/travel/connect', index: '09', label: 'Connect Friends', sub: 'Groups & shared trips' },
      { path: '/travel/trips', index: '10', label: 'My Trips', sub: 'Bookings & tickets' },
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
      { path: '/astrology/today', index: '01', label: "Today's Horoscope", sub: 'Your day, from your chart' },
      { path: '/astrology/monthly', index: '02', label: 'Monthly Horoscope', sub: 'Premium month-ahead reading' },
      { path: '/astrology/ask', index: '03', label: 'Ask the Astrologer', sub: '₹75 · personal consultation' },
      { path: '/astrology/tarot', index: '04', label: 'Tarot', sub: 'Free daily card · paid spreads' },
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
      { path: '/nutrition/recipes', index: '05', label: LABELS.createYourOwnMealPlan, sub: 'Search, add, build your week' },
    ],
  },
  family: {
    key: 'family', name: 'Family Nutrition', tag: 'One table, every plate personal', backPath: '/family',
    items: [
      { path: '/family/connect', index: '01', label: 'Connect Members', sub: 'Roles & permissions' },
      { path: '/family/weekly', index: '02', label: 'Weekly Planner', sub: 'Portioned per member' },
      { path: '/family/daily', index: '03', label: 'Daily Planner', sub: "Today's plate for all" },
      { path: '/family/grocery', index: '04', label: LABELS.groceryLists, sub: 'One combined list' },
      { path: '/family/cart', index: '05', label: 'Cart', sub: 'Review & checkout' },
      { path: '/family/orders', index: '06', label: 'My Orders', sub: 'Family-wide deliveries' },
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
    ],
  },
  dating: {
    key: 'dating', name: 'Dating Hub', tag: 'Curated, not endless', backPath: '/dating', dark: true,
    items: [
      { path: '/dating/profile', index: '01', label: 'My Dating Profile', sub: 'Birth details & interests' },
      { path: '/dating/matches', index: '02', label: 'Curated Matches', sub: 'Only real matches, ≥75%' },
      { path: '/dating/activity', index: '03', label: 'Activity Dating', sub: 'Meet by doing, not swiping' },
      { path: '/dating/chats', index: '04', label: 'Dating Chats', sub: 'Anonymous, one at a time' },
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
      { path: '/beauty/market', index: '02', label: 'Beauty Market', sub: 'Curated, matched to you' },
      { path: '/beauty/makeup', index: '03', label: 'Makeup Studio', sub: 'Your personal AI makeup artist' },
      { path: '/beauty/orders', index: '04', label: 'My Orders', sub: 'Your beauty shelf' },
    ],
  },
  medical: {
    key: 'medical', name: 'Medical Hub', tag: 'Your health, one secure place', backPath: '/medical',
    items: [
      { path: '/medical/blood', index: '01', label: 'Blood Test Analysis', sub: 'Cited, trend-aware panel' },
      { path: '/medical/tests', index: '02', label: 'Order Blood Tests', sub: '5,000+ tests, home collection' },
      { path: '/medical/records', index: '03', label: 'Health Records', sub: 'Reports, analysis & documents' },
      { path: '/medical/consults', index: '04', label: 'Talk to a Doctor', sub: 'Book a consult & appointment slot' },
      { path: '/medical/timeline', index: '05', label: 'Health Timeline', sub: 'Longitudinal history' },
      { path: '/medical/family', index: '06', label: 'Family Profiles', sub: 'Household health at a glance' },
      { path: '/medical/consent', index: '07', label: 'Privacy & Consent', sub: 'Consent controls' },
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
      { path: '/mail/failed', index: '04', label: 'Failed', sub: 'Rejected — see why and try again' },
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
      { path: '/financial/payments', index: '04', label: 'Payments', sub: 'Bills, EMIs & rent' },
      { path: '/financial/transactions', index: '05', label: 'Transactions', sub: 'Every hub, one feed' },
    ],
  },
};
