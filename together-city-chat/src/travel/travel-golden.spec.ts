/**
 * Golden master — travel's decisions, recorded before anything changes them.
 * The demo gate is the record that matters most: with SEED_DEMO off, flights
 * are an honest empty answer and booking one is refused — never a plausible
 * list of planes that don't exist.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TravelService } from './travel.service';

function build(pkgRows: unknown[] = [], trips: unknown[] = []) {
  const svc = Object.create(TravelService.prototype) as TravelService;
  (svc as any).logger = { warn: () => undefined, log: () => undefined };
  (svc as any).prisma = {
    travelPackage: {
      findMany: async () => pkgRows,
      findUnique: async ({ where }: { where: { id: string } }) => (pkgRows as Array<{ id: string }>).find((r) => r.id === where.id) ?? null,
    },
    tripBooking: { findMany: async () => trips },
  };
  (svc as any).clock = { timezoneFor: async () => 'Asia/Kolkata', dayIn: () => '1 Aug 2026' };
  (svc as any).financial = {};
  (svc as any).mail = {};
  return svc;
}

const PKG = {
  id: 'p1', title: 'Coorg Coffee Trail', destination: 'Coorg', country: 'India', category: 'hills',
  nights: 2, days: 3, priceFromInr: 12500, summary: 'Estates and easy treks', heroUrl: 'h',
  highlightsJson: 'NOT JSON', inclusionsJson: '["stay"]', itineraryJson: '[{"day":1,"title":"Arrive","detail":"…"}]', tiersJson: 'also not json',
};

describe('travel golden master', () => {
  const OLD = process.env.SEED_DEMO;
  afterEach(() => { if (OLD === undefined) delete process.env.SEED_DEMO; else process.env.SEED_DEMO = OLD; });

  it('flights with demo OFF: an honest zero, with the reason', () => {
    delete process.env.SEED_DEMO;
    const svc = build();
    expect(svc.flightSearch({ from: 'bom', to: 'blr', date: '2026-08-15', pax: 2, cabin: 'economy' } as never)).toMatchSnapshot();
  });

  it('booking a flight with demo OFF is refused', async () => {
    delete process.env.SEED_DEMO;
    const svc = build();
    await expect(svc.bookFlight('u1', { from: 'BOM', to: 'BLR', date: '2026-08-15', pax: 1, cabin: 'economy', flightId: 'x', method: 'wallet' } as never))
      .rejects.toThrow(BadRequestException);
  });

  it('flights with demo ON: the synthesiser is deterministic for one route+date', () => {
    process.env.SEED_DEMO = 'true';
    const svc = build();
    const a = svc.flightSearch({ from: 'BOM', to: 'BLR', date: '2026-08-15', pax: 1, cabin: 'economy' } as never);
    const b = svc.flightSearch({ from: 'BOM', to: 'BLR', date: '2026-08-15', pax: 1, cabin: 'economy' } as never);
    expect(a).toEqual(b);
    expect({ available: a.available, count: a.count, first: a.flights[0] }).toMatchSnapshot();
  });

  it('package detail: corrupt JSON fields degrade to empty arrays, never a crash', async () => {
    const svc = build([PKG]);
    expect(await svc.packageDetail('p1')).toMatchSnapshot();
    await expect(svc.packageDetail('nope')).rejects.toThrow(NotFoundException);
  });

  it('the catalogue filters by category and shapes the card', async () => {
    const svc = build([PKG, { ...PKG, id: 'p2', category: 'beach', title: 'Goa Slow Week' }]);
    expect(await svc.packages({ category: 'beach' } as never)).toMatchSnapshot();
  });

  it('my trips: a flight gets the plane, a package gets its category icon', async () => {
    const svc = build([], [
      { id: 't1', kind: 'flight', title: 'BOM → BLR', subtitle: 'IndiGo 6E-501', tier: 'economy', pax: 1, totalInr: 4500, code: 'TC-1', status: 'confirmed', category: 'flight', detailJson: '{"date":"2026-08-15"}', createdAt: new Date(0) },
      { id: 't2', kind: 'package', title: 'Coorg Coffee Trail', subtitle: '2N/3D · Coorg', tier: 'Base', pax: 2, totalInr: 25000, code: 'TC-2', status: 'confirmed', category: 'hills', detailJson: 'broken', createdAt: new Date(0) },
    ]);
    expect(await svc.myTrips('u1')).toMatchSnapshot();
  });
});
