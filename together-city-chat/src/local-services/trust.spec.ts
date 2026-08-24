import {
  atLeast, badgeFor, DEFAULT_POLICY, FREE_NEW_THREADS_PER_DAY, gateLifted, nextStep,
  policyFor, TIERS, tierOf, TRUSTED_MIN_DAYS, TRUSTED_MIN_REVIEWS,
  type TrustEvidence,
} from './trust';

/**
 * THE LADDER.
 *
 * Three things are worth proving here. That the rungs are monotone — no
 * arrangement of evidence reaches a higher tier without holding the lower one.
 * That a trade whose licence is the whole point of it cannot buy its way past
 * that licence with a different document. And that the wording never says
 * Together City vouches for anybody.
 */

const basic: TrustEvidence = {
  entityKind: 'registered',
  identityVerified: false,
  phoneVerified: false,
  docKind: null,
  docStatus: 'none',
  placeConfirmed: false,
  listedForDays: 0,
  reviewCount: 0,
  rating: null,
  reportsUpheld: 0,
};
const identity: TrustEvidence = { ...basic, identityVerified: true, phoneVerified: true };
const business: TrustEvidence = { ...identity, docKind: 'gstin', docStatus: 'verified' };
const trusted: TrustEvidence = {
  ...business,
  placeConfirmed: true,
  listedForDays: TRUSTED_MIN_DAYS,
  reviewCount: TRUSTED_MIN_REVIEWS,
  rating: 4.4,
};

// The camera can stand in for the pin: a shop seen moving is at least a pin.
const trustedByVideo: TrustEvidence = { ...trusted, placeConfirmed: false, videoVerified: true };

describe('the four tiers', () => {
  it('starts at basic and says nothing about it', () => {
    expect(tierOf(basic)).toBe('basic');
    // Not "unverified". A grey chip on every honest new business in the city,
    // on the day it most needs answering, is a punishment for being new.
    expect(badgeFor('basic')).toBeNull();
  });

  it('needs BOTH a phone and an identity to leave basic', () => {
    expect(tierOf({ ...basic, identityVerified: true })).toBe('basic');
    expect(tierOf({ ...basic, phoneVerified: true })).toBe('basic');
    expect(tierOf(identity)).toBe('identity');
  });

  it('will not hand out a business tier on identity alone, however old the listing', () => {
    // The distinction the whole feature rests on: proving who you are and
    // proving the company exists are different claims.
    expect(tierOf({ ...identity, listedForDays: 3650, reviewCount: 90, rating: 5, placeConfirmed: true }))
      .toBe('identity');
  });

  it('will not count a document that has only been submitted', () => {
    expect(tierOf({ ...identity, docKind: 'gstin', docStatus: 'submitted' })).toBe('identity');
    expect(tierOf({ ...identity, docKind: 'gstin', docStatus: 'rejected' })).toBe('identity');
    expect(tierOf(business)).toBe('business');
  });

  it('is monotone — a higher tier always holds everything the one below it does', () => {
    for (const ev of [identity, business, trusted]) {
      const t = tierOf(ev);
      expect(ev.identityVerified && ev.phoneVerified).toBe(true);
      if (atLeast(t, 'business')) expect(ev.docStatus).toBe('verified');
      if (atLeast(t, 'trusted')) expect(ev.placeConfirmed).toBe(true);
    }
    expect(TIERS.indexOf('trusted')).toBeGreaterThan(TIERS.indexOf('business'));
  });
});

describe('trusted', () => {
  it('takes a place, time, reviews and a clean history — and drops on any one of them', () => {
    expect(tierOf(trusted)).toBe('trusted');
    expect(tierOf({ ...trusted, placeConfirmed: false })).toBe('business');
    expect(tierOf({ ...trusted, listedForDays: TRUSTED_MIN_DAYS - 1 })).toBe('business');
    expect(tierOf({ ...trusted, reviewCount: TRUSTED_MIN_REVIEWS - 1 })).toBe('business');
    expect(tierOf({ ...trusted, rating: 3.9 })).toBe('business');
    expect(tierOf({ ...trusted, reportsUpheld: 1 })).toBe('business');
  });

  it('will not read a withheld average as a good one', () => {
    // Below three reviews the directory shows no average at all, and null must
    // not fall through a `>=` comparison as if it were zero or as if it passed.
    expect(tierOf({ ...trusted, rating: null })).toBe('business');
  });
});

describe('what proof fits which trade', () => {
  it('refuses a clinic that offers a GST certificate instead of a registration', () => {
    const clinic = policyFor('clinic');
    expect(tierOf({ ...business, docKind: 'gstin' }, clinic)).toBe('identity');
    expect(tierOf({ ...business, docKind: 'professional' }, clinic)).toBe('business');
  });

  it('asks a kitchen for the licence a kitchen actually needs', () => {
    const restaurant = policyFor('restaurant');
    expect(restaurant.requires).toEqual(['fssai']);
    expect(tierOf({ ...business, docKind: 'udyam' }, restaurant)).toBe('identity');
    expect(tierOf({ ...business, docKind: 'fssai' }, restaurant)).toBe('business');
  });

  it('takes any one credential from a trade with no licence of its own', () => {
    expect(policyFor('trade')).toBe(DEFAULT_POLICY);
    expect(policyFor(null)).toBe(DEFAULT_POLICY);
    for (const kind of DEFAULT_POLICY.accepts) {
      expect(tierOf({ ...business, docKind: kind })).toBe('business');
    }
  });

  it('does not accept a food licence as proof of a plumber', () => {
    // Not pedantry: it is the check that stops "any uploaded PDF" becoming the
    // real rule the first time somebody picks the wrong item in a dropdown.
    expect(tierOf({ ...business, docKind: 'fssai' }, DEFAULT_POLICY)).toBe('identity');
  });
});

describe('the free tier', () => {
  it('opens the inbox on identity, not on the certificate', () => {
    expect(FREE_NEW_THREADS_PER_DAY).toBe(5);
    expect(gateLifted('basic')).toBe(false);
    expect(gateLifted('identity')).toBe(true);
    expect(gateLifted('business')).toBe(true);
    expect(gateLifted('trusted')).toBe(true);
  });
});

describe('what the citizen reads', () => {
  it('never says Together City vouches for the business', () => {
    for (const tier of TIERS) {
      const b = badgeFor(tier);
      if (!b) continue;
      // No positive claim about the business anywhere in the wording. The word
      // "recommendation" is allowed exactly once and only with "not a" in front
      // of it, which is the sentence doing the work rather than avoiding it.
      expect(b.blurb).not.toMatch(/\b(we recommend|recommended|guarantee[ds]?|endorse[ds]?|reliable|trustworthy|safe)\b/i);
      expect(b.blurb.replace(/not a recommendation/gi, ''))
        .not.toMatch(/recommend/i);
      expect(b.label.length).toBeLessThan(24);
    }
    expect(badgeFor('business')!.blurb).toContain('not a recommendation');
  });

  it('tells a freelancer the ladder ends, rather than dangling a rung they cannot reach', () => {
    const freelancer: TrustEvidence = { ...identity, entityKind: 'individual' };
    expect(nextStep(freelancer)).toContain('right answer');
    expect(gateLifted(tierOf(freelancer))).toBe(true);
  });

  it('names the one next thing, in order, and goes quiet at the top', () => {
    expect(nextStep(basic)).toContain('mobile');
    expect(nextStep({ ...basic, phoneVerified: true })).toContain('who you are');
    expect(nextStep({ ...identity, docStatus: 'submitted' })).toContain('either way');
    expect(nextStep(identity, policyFor('restaurant'))).toContain('FSSAI');
    expect(nextStep(business)).toContain('map');
    expect(nextStep(trusted)).toBeNull();
  });
});

describe('the camera on the ladder', () => {
  it('a verified video stands in for the pin-check on Trusted, and for nothing below it', () => {
    expect(tierOf(trustedByVideo)).toBe('trusted');
    // Video without identity is still basic — seeing a shop is not knowing a person.
    expect(tierOf({ ...basic, videoVerified: true })).toBe('basic');
  });
});
