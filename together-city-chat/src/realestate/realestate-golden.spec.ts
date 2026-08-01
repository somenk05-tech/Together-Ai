import { contactHits, decide, normalizeDesc, ruleChecks, type ListingInput } from './moderation';
import { livabilityBasis, livabilityScore } from './realestate.constants';
import { RealEstateService } from './realestate.service';

/**
 * What the Real Estate hub decides today, written down. (P0-2.)
 *
 * The moderation pipeline decides whether a listing goes live and what
 * rejection a citizen reads; the insight block prices their home against the
 * market. Both are recorded here as they ARE — a golden master, not a
 * specification — so the next change to a threshold, a pattern or a weight
 * produces a diff instead of a silent shift.
 *
 * The pure moderation core (ruleChecks/decide/contactHits) is called
 * directly; insightFor, fraudScore, noticeFor and shapeCard run on the real
 * prototype over stubs, with the clock pinned. fraudScore's account-age
 * branch is exercised with a decade-old createdAt so Date.now() cannot move
 * the record. findDuplicate and the AI text pass are DB/AI-bound and enter
 * decide() as recorded signals instead.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const base: ListingInput = {
  title: '2BHK apartment in Indiranagar', description: 'Sunlit two-bedroom with covered parking and a small balcony garden.',
  city: 'Bengaluru', locality: 'Indiranagar', propertyType: 'apartment', listingType: 'sale',
  priceInr: 9_000_000, areaSqft: 1200, bedrooms: 2, bathrooms: 2, furnishing: 'semi',
  photos: [{ url: 'p1.webp' }, { url: 'p2.webp' }],
};
const run = (input: ListingInput, opts: { duplicateOf?: string | null; peerMedianPerSqft?: number | null; fraudScore: number },
  ai?: { flagged: boolean; confidence: number; reason?: string }) => {
  const { checks, risk } = ruleChecks(input, opts);
  const r = decide(checks, risk, ai);
  return { decision: r.decision, confidence: r.confidence, score: r.score, reasons: r.reasons,
    failed: r.checks.filter((c) => !c.pass).map((c) => c.name) };
};

describe('what listing moderation decides today', () => {
  it('the clean listing, the phone number, the missing fields', () => {
    expect({
      clean: run(base, { fraudScore: 0, peerMedianPerSqft: 7500 }),
      phoneInDescription: run({ ...base, description: 'Sunlit 2BHK — call 98765 43210 to visit.' }, { fraudScore: 0 }),
      emailInCaption: run({ ...base, photos: [{ url: 'p1.webp', caption: 'ping seller@example.com' }] }, { fraudScore: 0 }),
      missingEverything: run({ ...base, title: ' ', city: '', locality: '', priceInr: 0, areaSqft: 0, bedrooms: 0 }, { fraudScore: 0 }),
    }).toMatchSnapshot();
  });

  it('the soft signals: duplicate, price outlier, scam phrasing, spam, fraud', () => {
    expect({
      duplicate: run(base, { fraudScore: 0, duplicateOf: 'prop-1' }),
      tenTimesTheMarket: run({ ...base, priceInr: 90_000_000 }, { fraudScore: 0, peerMedianPerSqft: 1800 }),
      scamPhrasing: run({ ...base, description: '100% guaranteed returns, token amount to block today!' }, { fraudScore: 0 }),
      allCaps: run({ ...base, description: 'URGENT SALE BEST FLAT BEST PRICE BEST AREA CONTACT FAST DEAL NOW' }, { fraudScore: 0 }),
      riskyAccount: run(base, { fraudScore: 65 }),
    }).toMatchSnapshot();
  });

  it('the AI verdict: confident flags reject, unsure flags go to review', () => {
    expect({
      confidentFlag: run(base, { fraudScore: 0 }, { flagged: true, confidence: 0.9, reason: 'Reads like a rental scam.' }),
      unsureFlag: run(base, { fraudScore: 0 }, { flagged: true, confidence: 0.4, reason: 'Possibly exaggerated claims.' }),
      aiClear: run(base, { fraudScore: 0 }, { flagged: false, confidence: 0.9 }),
    }).toMatchSnapshot();
  });

  it('contact detection and description normalisation, as they are', () => {
    expect({
      hits: contactHits({ ...base, description: 'WhatsApp me or t.me/seller, UPI seller@ybl, www.flat.example' }),
      normalized: normalizeDesc('  2BHK — Sunlit & AIRY!!  '),
    }).toMatchSnapshot();
  });
});

describe('what the service derives today, over stubs', () => {
  const FIXED = new Date('2026-08-01T10:00:00Z');
  const svc = (peers: Array<{ priceInr: number; areaSqft: number }> = []): any => {
    const s: any = Object.create(RealEstateService.prototype);
    s.prisma = {
      property: {
        findMany: async () => peers.map((p) => ({ ...p, listingType: 'sale', city: 'Bengaluru' })),
        count: async () => 0,
      },
      user: { findUnique: async () => ({ createdAt: new Date('2016-01-01T00:00:00Z') }) },
    };
    s.clock = { dayIn: () => '2026-08-01' };
    return s;
  };

  it('the market insight block', async () => {
    const prop = { listingType: 'sale', city: 'Bengaluru', priceInr: 9_000_000, areaSqft: 1200 };
    expect({
      withPeers: await svc([{ priceInr: 8_000_000, areaSqft: 1000 }, { priceInr: 12_000_000, areaSqft: 1500 }]).insightFor(prop),
      noPeers: await svc([]).insightFor(prop),
      zeroArea: await svc([{ priceInr: 8_000_000, areaSqft: 1000 }]).insightFor({ ...prop, areaSqft: 0 }),
    }).toMatchSnapshot();
  });

  it('fraud score branches (decade-old account: age bonus can never fire)', async () => {
    const scored = async (total: number, lastDay: number, rejected: number) => {
      const s = svc();
      let call = 0;
      s.prisma.property.count = async () => [total, lastDay, rejected][call++ % 3];
      return s.fraudScore('u1');
    };
    expect({
      clean: await scored(1, 0, 0),
      rapidPoster: await scored(6, 6, 0),
      repeatOffender: await scored(4, 0, 4),
    }).toMatchSnapshot();
  });

  it('the three sentences a citizen reads after posting', () => {
    const s = svc();
    expect({
      approved: s.noticeFor({ decision: 'approved', reasons: [] }),
      review: s.noticeFor({ decision: 'review', reasons: [] }),
      rejected: s.noticeFor({ decision: 'rejected', reasons: ['Remove a phone number.'] }),
    }).toMatchSnapshot();
  });

  it('the card: derived price/sqft, verification badges, posted-on in the viewer zone', () => {
    const s = svc();
    const card = s.shapeCard({
      id: 'p1', listingType: 'sale', propertyType: 'apartment', status: 'ready',
      title: '2BHK', city: 'Bengaluru', locality: 'Indiranagar', priceInr: 9_000_000, areaSqft: 1200,
      bedrooms: 2, bathrooms: 2, furnishing: 'semi', facing: 'east',
      photosJson: JSON.stringify([{ url: 'p1.webp' }]), reraId: 'RERA-1', sellerId: 'u1',
      projectName: null, developer: null, possessionDate: null, progressPct: null,
      createdAt: FIXED, moderation: 'approved', moderationJson: null,
    });
    expect(card).toMatchSnapshot();
  });
});

describe('livability, as scored today', () => {
  const hood = [
    { label: 'Metro station', kind: 'transit', distanceKm: 0.4 },
    { label: 'City hospital', kind: 'health', distanceKm: 1.1 },
    { label: 'Public school', kind: 'school', distanceKm: 0.8 },
  ];
  it('score and basis over amenities + neighbourhood', () => {
    expect({
      full: { score: livabilityScore('lift,parking,gym,park', hood), basis: livabilityBasis('lift,parking,gym,park', hood) },
      bare: { score: livabilityScore('', []), basis: livabilityBasis('', []) },
    }).toMatchSnapshot();
  });
});
