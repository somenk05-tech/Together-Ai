import { LocalServicesService } from './local-services.service';

/**
 * ── ONE PACK, ONE TILE, AND NOT ONE RUPEE THIS FILE MADE UP ─────────────────
 *
 * Owner, 8 Sep: "create an online grocery store using the internet, show all
 * the products that's available in an area."
 *
 * The shelf now groups: eight kiranas' rows for the same 5 kg atta become one
 * tile with a price from each. Grouping is where a store starts inventing
 * numbers if nobody is watching — an average, a "market price", a cheapest
 * price for something that is out of stock — so these are the rules, held.
 *
 * The other half of the answer is `catalogue.spec.ts`: the catalogue holds no
 * price at all. Together they are the pair `grocery-orders-removed.spec.ts`
 * asked for in July.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const VIEWER = 'u-viewer';

function harness(opts: { items: any[]; products?: any[] }) {
  const listings = [
    { id: 'S1', slug: 'ram-kirana', businessName: 'Ram Kirana', categoryKey: 'grocery_stores', city: 'Mumbai', areas: 'Dadar', logoUrl: null, lat: null, lng: null, hoursJson: null, moderation: 'approved', createdAt: new Date(2), updatedAt: new Date(2) },
    { id: 'S2', slug: 'shree-super', businessName: 'Shree Supermarket', categoryKey: 'supermarkets', city: 'Mumbai', areas: 'Dadar', logoUrl: null, lat: null, lng: null, hoursJson: null, moderation: 'approved', createdAt: new Date(1), updatedAt: new Date(1) },
  ];
  const prisma: any = {
    serviceListing: { findMany: async () => listings },
    serviceMenuItem: { findMany: async () => opts.items },
    groceryProduct: {
      findMany: async ({ where }: any) =>
        (opts.products ?? []).filter((p) => !where?.id?.in || where.id.in.includes(p.id)),
      count: async () => (opts.products ?? []).length,
    },
  };
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  /* The directory's own two reads, stubbed to "nothing to say" — this suite is
     about grouping, and trust and ratings have their own suites. */
  svc.ratingsFor = async () => ({});
  svc.trustFor = async () => new Map();
  return svc;
}

const ATTA = {
  id: 'P1', aisle: 'staples', brand: 'Aashirvaad', name: 'Shudh Chakki Atta', pack: '5 kg',
  gtin: '8901030865432', imageUrl: 'https://images.openfoodfacts.org/x.jpg', loose: false,
  sourceKey: 'openfoodfacts', sourceRef: '8901030865432',
};

const row = (over: any) => ({
  id: 'I?', listingId: 'S1', section: null, name: 'Atta', description: null,
  priceInr: null, available: true, veg: null, photoUrl: null, productId: null, ...over,
});

describe('two shops selling one pack', () => {
  it('become one tile that names both, at their own prices', async () => {
    const svc = harness({
      products: [ATTA],
      items: [
        row({ id: 'I1', listingId: 'S1', productId: 'P1', priceInr: 285 }),
        row({ id: 'I2', listingId: 'S2', productId: 'P1', priceInr: 268 }),
      ],
    });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out.products).toHaveLength(1);
    const t = out.products[0];
    expect(t.shopCount).toBe(2);
    expect(t.offers.map((o: any) => [o.shopName, o.priceInr]))
      .toEqual([['Shree Supermarket', 268], ['Ram Kirana', 285]]);
    /* THE ROWS ARE STILL THERE. The tile is a view of them, not a replacement
       — a client that has not learned about products yet must not lose stock. */
    expect(out.items).toHaveLength(2);
    expect(out.total).toBe(2);
  });

  it('prices the tile from a shop, not from an arithmetic', async () => {
    const svc = harness({
      products: [ATTA],
      items: [
        row({ id: 'I1', listingId: 'S1', productId: 'P1', priceInr: 285 }),
        row({ id: 'I2', listingId: 'S2', productId: 'P1', priceInr: 268 }),
      ],
    });
    const out = await svc.groceryShelf(VIEWER, {});
    // The cheapest real price. NOT the mean (276.5), which is nobody's price.
    expect(out.products[0].fromInr).toBe(268);
  });

  it('never quotes a price you cannot buy', async () => {
    const svc = harness({
      products: [ATTA],
      items: [
        row({ id: 'I1', listingId: 'S1', productId: 'P1', priceInr: 285 }),
        // Cheaper, and sold out. A "from ₹240" that ends in an empty shelf is
        // worse than the honest ₹285.
        row({ id: 'I2', listingId: 'S2', productId: 'P1', priceInr: 240, available: false }),
      ],
    });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out.products[0].fromInr).toBe(285);
    // And the sold-out shop is SHOWN, greyed, not hidden — and sorted last.
    expect(out.products[0].offers.map((o: any) => o.available)).toEqual([true, false]);
    expect(out.products[0].shopCount).toBe(2);
  });

  it('says ask, never ₹0, when nobody priced it', async () => {
    const svc = harness({
      products: [ATTA],
      items: [
        row({ id: 'I1', listingId: 'S1', productId: 'P1', priceInr: null }),
        row({ id: 'I2', listingId: 'S2', productId: 'P1', priceInr: null }),
      ],
    });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out.products[0].fromInr).toBeNull();
    expect(out.products[0].fromInr).not.toBe(0);
  });

  it('carries the source onto the tile, so the shelf can print where the pack came from', async () => {
    const svc = harness({ products: [ATTA], items: [row({ id: 'I1', productId: 'P1', priceInr: 285 })] });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out.products[0].source.url).toBe('https://world.openfoodfacts.org/product/8901030865432');
    expect(out.products[0].source.licence).toBe('ODbL');
  });
});

describe('rows that never came off the catalogue', () => {
  it('are left exactly as they were — no name matching, ever', async () => {
    const svc = harness({
      products: [],
      items: [
        // Same words, two shops, no productId. A store that merged these on the
        // strength of the text would be deciding that two shopkeepers mean the
        // same thing, and would misprice one of them the first time they did
        // not. The link is the only evidence, and there is none here.
        row({ id: 'I1', listingId: 'S1', name: 'Toor Dal 1kg', priceInr: 160 }),
        row({ id: 'I2', listingId: 'S2', name: 'Toor Dal 1kg', priceInr: 149 }),
      ],
    });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out.products).toHaveLength(0);
    expect(out.items).toHaveLength(2);
  });

  it('an empty shelf still answers with every key the screen reads', async () => {
    const svc = harness({ products: [], items: [] });
    const out = await svc.groceryShelf(VIEWER, {});
    expect(out).toEqual({ shops: [], aisles: [], items: [], products: [], total: 0, shopCount: 0 });
  });
});
