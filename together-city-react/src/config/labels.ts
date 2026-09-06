/**
 * One home for the two labels the review renamed, and for the destinations it
 * removed.
 *
 * Two rules live here so nothing drifts:
 *
 *   1. A renamed label is written once. Nav, breadcrumbs, page titles, empty
 *      states and toasts all read the constant, so a stale string cannot
 *      survive in some corner nobody thought to open.
 *
 *   2. A removed destination keeps a redirect for one release. Deleting the
 *      route outright would hard-fail for anyone still holding the old URL —
 *      a bookmark, a link in an old email, a mobile build that has not
 *      updated yet. They land on a real page instead of a 404.
 */

export const LABELS = {
  /** renamed by the review: it is a list you take shopping, not a storefront */
  groceryLists: 'Grocery Lists',
  /** was "Recipes" — the page is a plan builder, not a recipe browser */
  createYourOwnMealPlan: 'Create Your Own Meal Plan',
} as const;

/**
 * Every destination the review removed, mapped to the nearest surviving page.
 *
 * "Nearest" means the page a user who typed the old URL was probably after.
 * Supplements still exists inside the Fitness hub, so that is where the old
 * nutrition link goes. The dietitian page becomes the medical consult booking,
 * which is the same job done by a real clinician.
 */
export const REMOVED_ROUTES: Readonly<Record<string, string>> = {
  '/nutrition/history': '/nutrition/weekly',
  '/nutrition/daily': '/nutrition/weekly',
  '/nutrition/daily-classic': '/nutrition/weekly',
  '/nutrition/pantry': '/nutrition/grocery',
  '/nutrition/health': '/nutrition/preferences',
  '/nutrition/orders': '/nutrition/grocery',
  '/nutrition/supplements': '/fitness/supplements',
  '/nutrition/dietitian': '/medical/consults',
  '/social/map': '/social/feed',
  // The daily astrology letter (5 Sep). One model call per citizen per day was
  // the largest line in what a free member cost to serve, and the owner dropped
  // it. The month's letter is the nearest surviving page.
  '/astrology/today': '/astrology/monthly',
  // Remedies (6 Sep, owner). One practice a week for the season you are in,
  // rotating on the server. The month's letter is the nearest surviving page:
  // it is the other thing in this zone that speaks about a stretch of time
  // rather than about a stone.
  '/astrology/remedies': '/astrology/monthly',
  // Trainer Mode, the camera form coach (20 Aug). Workout is the nearest
  // surviving page — a guided session with a timer, which is what somebody
  // following an old Trainer link was after.
  '/fitness/trainer': '/fitness/workout',
  // The family Daily Planner (7 Aug). It rendered today's slice of the same
  // household plan the weekly view shows in full, so the weekly view is where
  // an old link belongs.
  '/family/daily': '/family/weekly',
  // The 24-hour verification link is gone — every outstanding token was consumed
  // by 20260730160000_retire_verification_links. Anyone who follows an old link
  // from their inbox lands on the profile, where the six-digit flow lives.
  '/verify': '/profile',
};
