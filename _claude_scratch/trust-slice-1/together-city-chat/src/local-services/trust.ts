/**
 * TOGETHER CITY TRUST — THE LADDER, AND THE ONE FUNCTION THAT DECIDES IT.
 *
 * A badge that means "typed a number into a box" is worse than no badge: it
 * launders an unverified claim into a platform endorsement, and the platform is
 * the one held to it after the first bad job. Dating's Verified was hidden for
 * that reason and this hub's own plan logged the same call in August — drop the
 * badge until there is something behind it. This file is that something.
 *
 * TWO THINGS IT KEEPS APART, DELIBERATELY.
 *
 * Identity is not business. Someone can prove exactly who they are and still
 * invent a plumbing company, so proving the person and proving the company are
 * separate rungs and the wording on the page says which one was checked.
 *
 * And the tier is NEVER STORED. It is computed here, from evidence rows, every
 * time anybody asks. A tier column is a second source of truth that goes wrong
 * the first time a document expires and no job re-runs — and it goes wrong
 * silently, on a badge, which is the worst place in the product for a stale
 * value to live.
 */

/** What the owner says they are. Decides which proofs are worth asking for. */
export type EntityKind = 'individual' | 'proprietor' | 'registered' | 'company';

export const ENTITY_KINDS: Record<EntityKind, string> = {
  individual: 'Individual or freelancer',
  proprietor: 'Sole proprietor',
  registered: 'Registered business',
  company: 'Company or partnership',
};

/**
 * The credentials a business can offer. One is enough — a form demanding all of
 * them is a form nobody finishes, and the second document proves nothing the
 * first did not.
 */
export type DocKind =
  | 'gstin'
  | 'udyam'
  | 'shop_establishment'
  | 'trade_licence'
  | 'incorporation'
  | 'fssai'
  | 'professional'
  | 'rera';

export const DOC_KINDS: Record<DocKind, string> = {
  gstin: 'GSTIN',
  udyam: 'Udyam registration',
  shop_establishment: 'Shop & Establishment registration',
  trade_licence: 'Trade licence',
  incorporation: 'Certificate of incorporation (CIN / LLPIN)',
  fssai: 'FSSAI licence',
  professional: 'Professional registration',
  rera: 'RERA registration',
};

/** none → submitted → verified | rejected. A rejection always carries a reason;
 *  an owner refused and told nothing has no path forward and files a ticket. */
export type DocStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export type Tier = 'basic' | 'identity' | 'business' | 'trusted';

/** Low to high. The order IS the ladder — `TIERS.indexOf` is how anything
 *  compares two tiers, so there is no second opinion about which is higher. */
export const TIERS: Tier[] = ['basic', 'identity', 'business', 'trusted'];
export const atLeast = (t: Tier, floor: Tier): boolean =>
  TIERS.indexOf(t) >= TIERS.indexOf(floor);

/**
 * Everything the ladder reads. Booleans and counts — no rows, no Prisma, no
 * clock. The caller does the reading; this file does the deciding, and that
 * split is what makes every rung testable without a database.
 */
export interface TrustEvidence {
  entityKind: EntityKind | null;
  /** A government ID matched to this person — by a provider, or by a human in
   *  the console looking at one. Both are real verification; only one scales. */
  identityVerified: boolean;
  phoneVerified: boolean;
  docKind: DocKind | null;
  docStatus: DocStatus;
  /** The pin has been checked against the areas the listing claims to serve. */
  placeConfirmed: boolean;
  listedForDays: number;
  reviewCount: number;
  rating: number | null;
  reportsUpheld: number;
}

/**
 * WHAT TRUSTED COSTS, ON TOP OF BEING VERIFIED.
 *
 * The review floor is three, which is deliberately the same number as the floor
 * for showing a star average: a rating the directory will not print is not a
 * rating a badge can be built on. Ninety days because "established" has to mean
 * something a fortnight cannot buy.
 */
export const TRUSTED_MIN_DAYS = 90;
export const TRUSTED_MIN_REVIEWS = 3;
export const TRUSTED_MIN_RATING = 4;

/**
 * WHAT PROOF FITS WHICH TRADE.
 *
 * The same document is not right for every business, and this is where a
 * directory becomes worth more than a classifieds page. Keyed by the business
 * type that `business-types.ts` already declares, so a new trade is an entry
 * here and never a branch somewhere else.
 *
 * `requires` is the sharp end: a clinic with no professional registration does
 * not become Business Verified, however many GST certificates it uploads. That
 * is not a policy this hub should be flexible about.
 */
export interface CategoryPolicy {
  accepts: DocKind[];
  requires?: DocKind[];
  /** Said to the owner on the form, in their language. */
  why?: string;
}

const ANY_BUSINESS_DOC: DocKind[] = [
  'gstin', 'udyam', 'shop_establishment', 'trade_licence', 'incorporation', 'rera',
];

export const DEFAULT_POLICY: CategoryPolicy = { accepts: ANY_BUSINESS_DOC };

export const CATEGORY_POLICY: Record<string, CategoryPolicy> = {
  restaurant: {
    accepts: [...ANY_BUSINESS_DOC, 'fssai'], requires: ['fssai'],
    why: 'Anyone serving food needs an FSSAI licence, so that is the one we ask for.',
  },
  cafe: {
    accepts: [...ANY_BUSINESS_DOC, 'fssai'], requires: ['fssai'],
    why: 'Anyone serving food needs an FSSAI licence, so that is the one we ask for.',
  },
  bakery: {
    accepts: [...ANY_BUSINESS_DOC, 'fssai'], requires: ['fssai'],
    why: 'Anyone serving food needs an FSSAI licence, so that is the one we ask for.',
  },
  clinic: {
    accepts: [...ANY_BUSINESS_DOC, 'professional'], requires: ['professional'],
    why: 'A clinic is verified on its practitioner registration and nothing else.',
  },
  diagnostics: {
    accepts: [...ANY_BUSINESS_DOC, 'professional'], requires: ['professional'],
    why: 'A lab or pharmacy is verified on its registration and nothing else.',
  },
  professional: {
    accepts: [...ANY_BUSINESS_DOC, 'professional'], requires: ['professional'],
    why: 'A practice is verified on the registration that lets it practise.',
  },
};

export const policyFor = (businessType: string | null): CategoryPolicy =>
  (businessType && CATEGORY_POLICY[businessType]) || DEFAULT_POLICY;

/**
 * THE LADDER.
 *
 * Monotone by construction: every rung above the first restates the one below
 * it rather than listing its conditions again, so there is no arrangement of
 * evidence that reaches Business Verified without being Identity Verified.
 * `trust.spec.ts` proves that rather than trusting the reading.
 */
export function tierOf(ev: TrustEvidence, policy: CategoryPolicy = DEFAULT_POLICY): Tier {
  const identity = ev.identityVerified && ev.phoneVerified;
  if (!identity) return 'basic';

  const docAccepted =
    ev.docStatus === 'verified' &&
    ev.docKind != null &&
    policy.accepts.includes(ev.docKind) &&
    (!policy.requires || policy.requires.includes(ev.docKind));
  if (!docAccepted) return 'identity';

  const established =
    ev.placeConfirmed &&
    ev.listedForDays >= TRUSTED_MIN_DAYS &&
    ev.reviewCount >= TRUSTED_MIN_REVIEWS &&
    ev.rating != null && ev.rating >= TRUSTED_MIN_RATING &&
    ev.reportsUpheld === 0;
  return established ? 'trusted' : 'business';
}

/**
 * WHAT THE CITIZEN READS.
 *
 * Each line says what was checked and by whom, and not one of them says the
 * business is any good. "Verified" on its own reads as Together City standing
 * behind the shop — a promise the company cannot keep and would be held to.
 */
export interface TrustBadge { tier: Tier; label: string; blurb: string }

export function badgeFor(tier: Tier): TrustBadge | null {
  switch (tier) {
    case 'identity':
      return {
        tier,
        label: 'Identity verified',
        blurb: 'The person behind this listing has proved who they are. The business itself has not been checked.',
      };
    case 'business':
      return {
        tier,
        label: 'Business verified',
        blurb: 'Together City has seen a registration document for this business. It is not a recommendation.',
      };
    case 'trusted':
      return {
        tier,
        label: 'Trusted',
        blurb: 'Verified, listed here a while, and with a customer history behind it. It is not a recommendation.',
      };
    default:
      // Basic is the absence of a claim, not a claim of absence. A grey "not
      // verified" chip would mark every honest new business in the city on the
      // day it most needs to be answered.
      return null;
  }
}

/**
 * THE FREE TIER, AND WHAT IT COUNTS.
 *
 * NEW THREADS, not messages: a back-and-forth would eat the allowance and
 * charge a business for answering the neighbour it already has. Conversations
 * already open are never touched by any of this.
 */
export const FREE_NEW_THREADS_PER_DAY = 5;

/**
 * WHICH RUNG OPENS THE INBOX — and it is identity, not the certificate.
 *
 * The fraud the cap exists to stop is one person standing up seventeen
 * plumbers. What stops that is knowing WHO THE PERSON IS; a registration
 * number does not, and a registered company can run a scam and does. So the
 * mailbox opens on identity, and the business document buys the green badge
 * and the ranking. In practice an owner does both in one sitting.
 *
 * It also makes the individual case come out right: a freelance tutor has no
 * business document to give and never will, and capping every honest
 * freelancer in the city at five neighbours a day forever would be the wrong
 * answer to a question they cannot be asked.
 */
export const gateLifted = (tier: Tier): boolean => atLeast(tier, 'identity');

/**
 * ONE SENTENCE ON WHAT IS STILL MISSING — the whole content of the tab when
 * there is nothing to celebrate. A ladder with no next step written on it is a
 * ladder people give up on at the first rung.
 */
export function nextStep(ev: TrustEvidence, policy: CategoryPolicy = DEFAULT_POLICY): string | null {
  if (!ev.phoneVerified) return 'Verify your mobile number.';
  if (!ev.identityVerified) return 'Prove who you are, and neighbours stop queueing.';
  if (ev.docStatus === 'submitted') return 'Your document is with us. We will write to you either way.';
  if (ev.entityKind === 'individual') {
    return 'You are listed as a freelancer, so there is no business document to give. This is as far as the ladder goes for you, and it is the right answer.';
  }
  if (ev.docStatus !== 'verified') {
    const need = policy.requires?.length ? DOC_KINDS[policy.requires[0]] : 'a registration document';
    return `Send us ${need} and this listing becomes Business verified.`;
  }
  if (!ev.placeConfirmed) return 'Confirm where you work on the map.';
  if (ev.listedForDays < TRUSTED_MIN_DAYS) return 'Trusted comes with time. Keep going.';
  if (ev.reviewCount < TRUSTED_MIN_REVIEWS) return 'Trusted needs a few reviews from neighbours you have worked with.';
  return null;
}
