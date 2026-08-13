import type { IconName } from '@/components/ui/Icon';

/**
 * WHAT A PROJECT FOLDER LOOKS LIKE — its tint, and the mark on its front.
 *
 * Pure, and deliberately in a file of its own with a test beside it: the grid
 * is nine near-identical shapes, so the two things that tell them apart are
 * the two things worth guarding.
 */

/** The nine a citizen picks from, plus the slate All Emails always wears. */
export const FOLD_TINTS = [
  'blue', 'green', 'purple', 'red', 'orange', 'teal', 'amber', 'pink', 'violet',
] as const;
export type FoldTint = typeof FOLD_TINTS[number];

/** Anything this build does not recognise comes out slate rather than blank —
 *  a tint added by a newer client must never render a colourless folder. */
export const tintOf = (raw: string | null | undefined): FoldTint | 'slate' =>
  (FOLD_TINTS as readonly string[]).includes(raw ?? '') ? (raw as FoldTint) : 'slate';

/**
 * THE MARK IS DERIVED FROM THE NAME, AND IT GUESSES.
 *
 * The owner chose this over a picker, so the honest thing is to say what it
 * costs: "Legal" gets a document and "ABG" gets a folder, because ABG is a
 * name and not a word. That is the right failure — a plain folder is a folder,
 * and the alternative failure (confidently drawing a plane on the tax project)
 * is the one nobody forgives.
 *
 * WHOLE WORDS, NOT SUBSTRINGS. A substring match reads "personal" inside
 * "personal training" correctly and "art" inside "Bharti" by accident; every
 * needle here is matched against the name's words, with a plural and a
 * possessive tolerated. That is why "Marketing" hits `market` and "Marketable
 * Assets" does not hit it twice.
 *
 * FIRST MATCH WINS, and the order below is the priority. Client comes before
 * work because "Client X" is a person you deal with rather than a briefcase,
 * which is what the reference drew.
 */
const RULES: Array<[IconName, readonly string[]]> = [
  ['user', ['client', 'clients', 'customer', 'customers', 'account', 'accounts']],
  ['movie', ['film', 'films', 'movie', 'movies', 'shoot', 'shoots', 'production',
    'studio', 'cast', 'crew', 'script', 'screenplay', 'documentary', 'series']],
  ['chart', ['investor', 'investors', 'investment', 'fund', 'funds', 'funding', 'vc',
    'capital', 'finance', 'financial', 'money', 'bank', 'banking', 'tax', 'taxes',
    'invoice', 'invoices', 'billing', 'budget', 'revenue', 'payroll']],
  ['megaphone', ['marketing', 'market', 'campaign', 'campaigns', 'brand', 'branding',
    'ads', 'advertising', 'promo', 'promotion', 'growth', 'press', 'pr', 'launch']],
  ['doc', ['legal', 'law', 'contract', 'contracts', 'agreement', 'agreements',
    'compliance', 'policy', 'policies', 'nda', 'terms', 'licence', 'license', 'patent']],
  ['people', ['hr', 'hiring', 'hire', 'hires', 'recruit', 'recruiting', 'recruitment',
    'staff', 'staffing', 'team', 'teams', 'candidate', 'candidates', 'interview',
    'interviews', 'onboarding']],
  ['flight', ['travel', 'trip', 'trips', 'flight', 'flights', 'event', 'events',
    'conference', 'conferences', 'venue', 'venues', 'booking', 'bookings', 'tour']],
  ['personal', ['personal', 'family', 'home', 'private', 'me', 'life']],
  ['property', ['property', 'properties', 'estate', 'lease', 'leases', 'rent',
    'rental', 'tenancy', 'landlord', 'apartment', 'house', 'flat']],
  ['job', ['work', 'project', 'projects', 'business', 'agency', 'consulting',
    'consultancy', 'deal', 'deals', 'partner', 'partners', 'partnership', 'vendor',
    'vendors', 'supplier', 'ops', 'operations']],
  ['journal', ['school', 'college', 'university', 'course', 'courses', 'study',
    'studies', 'research', 'thesis', 'class', 'classes']],
  ['restaurant', ['food', 'menu', 'kitchen', 'catering', 'restaurant', 'cafe']],
  ['shield', ['health', 'medical', 'doctor', 'clinic', 'hospital', 'insurance']],
];

/** A name split into comparable words: lowercase, punctuation gone, a trailing
 *  's or ’s dropped so "Client's" is still a client. */
const wordsOf = (name: string): string[] =>
  (name || '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * The mark for a project name. `sort` is lucide's FolderOpen in this app's icon
 * map — the plain folder every unmatched name gets.
 */
export const iconForName = (name: string): IconName => {
  const words = new Set(wordsOf(name));
  if (words.size === 0) return 'sort';
  for (const [icon, needles] of RULES) {
    for (const n of needles) if (words.has(n)) return icon;
  }
  return 'sort';
};
