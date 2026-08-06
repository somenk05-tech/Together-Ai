/**
 * A BUSINESS'S OWN ADDRESS.
 *
 * togethercity.app/services/anna-idli reads like a shop's own site;
 * /services/58fcf888-dbdd-4ff7-aac9-e426e891a9bd reads like a database row a
 * citizen was not supposed to see. It is also the thing a shopkeeper writes on
 * a card, says down a phone and paints on a shutter, so it has to be short,
 * lowercase, unambiguous when spoken, and stable once given out.
 *
 * The rules exist for specific failures:
 *
 *  · lowercase only, because a URL somebody types in capitals must reach the
 *    same shop, and the cheapest way to guarantee that is to have one form;
 *  · hyphens and never underscores, because an underscore vanishes under the
 *    underline in most link styling;
 *  · no leading, trailing or doubled hyphen, so "anna--idli-" and "anna-idli"
 *    cannot be two different businesses;
 *  · three characters minimum, because a two-letter address is a landgrab;
 *  · nothing that looks like an id, or a listing could shadow a real one.
 */
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/**
 * Words a listing may not take, because the router reads them first.
 *
 * Every static segment under /services on the web app is in here. If a
 * business took "messages", its page would be unreachable and the Messages
 * screen would look, to the citizen, like it had been replaced by a salon.
 *
 * The rest are addresses that will be wanted later or that a citizen would
 * reasonably read as belonging to Together City rather than to a shop. Giving
 * one away is a decision that cannot be taken back without breaking a URL
 * somebody has already printed.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'browse', 'list', 'mine', 'new', 'edit', 'search', 'find',
  'regulars', 'offers', 'messages', 'inbox', 'threads', 'reviews', 'menu',
  'slug', 'admin', 'api', 'app', 'help', 'about', 'terms', 'privacy',
  'contact', 'support', 'settings', 'login', 'signup', 'me', 'all',
  'togethercity', 'together-city', 'city', 'services', 'service',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The typed answer, cleaned but NOT invented. Returns '' for hopeless input. */
export function normaliseSlug(raw: string): string {
  return raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export type SlugProblem = 'tooShort' | 'tooLong' | 'shape' | 'reserved' | 'looksLikeAnId';

/** Null when it is fine. A named problem otherwise — the screen says which. */
export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < SLUG_MIN) return 'tooShort';
  if (slug.length > SLUG_MAX) return 'tooLong';
  if (!SHAPE.test(slug)) return 'shape';
  if (UUID.test(slug)) return 'looksLikeAnId';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  return null;
}

export const SLUG_MESSAGES: Record<SlugProblem, string> = {
  tooShort: `A web address needs at least ${SLUG_MIN} characters.`,
  tooLong: `A web address can be at most ${SLUG_MAX} characters.`,
  shape: 'Use lowercase letters, numbers and single hyphens — nothing else.',
  reserved: 'That word is already part of Together City. Pick another.',
  looksLikeAnId: 'That looks like an id rather than a name.',
};

/**
 * A first suggestion from the business name, made unique against what exists.
 *
 * The suffix counts up rather than reaching for randomness: "anna-idli-2" is a
 * second Anna Idli, which is what it is, and a citizen can read that. A hash
 * would be unique and mean nothing.
 */
export function suggestSlug(businessName: string, taken: readonly string[]): string {
  const base = normaliseSlug(businessName) || 'business';
  const seed = base.length < SLUG_MIN ? `${base}-shop`.slice(0, SLUG_MAX) : base;
  const clash = (s: string) => taken.includes(s) || RESERVED_SLUGS.includes(s);
  if (!clash(seed) && !slugProblem(seed)) return seed;
  for (let n = 2; n < 1000; n += 1) {
    const tail = `-${n}`;
    const candidate = `${seed.slice(0, SLUG_MAX - tail.length).replace(/-+$/, '')}${tail}`;
    if (!clash(candidate) && !slugProblem(candidate)) return candidate;
  }
  // A thousand businesses of the same name is not a case worth inventing a
  // cleverer answer for; the caller falls back to the id.
  return '';
}

/** Does this string address a listing by name, or by id? */
export const looksLikeId = (s: string): boolean => UUID.test(s);
