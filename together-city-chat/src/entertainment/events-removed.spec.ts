import { readFileSync } from 'fs';
import { join } from 'path';

const HERE = __dirname;
const service = readFileSync(join(HERE, 'entertainment.service.ts'), 'utf8');
const controller = readFileSync(join(HERE, 'entertainment.controller.ts'), 'utf8');
const module_ = readFileSync(join(HERE, 'entertainment.module.ts'), 'utf8');
const schema = readFileSync(join(HERE, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/**
 * The events flow is gone, and nobody is quietly left holding a paid ticket.
 *
 * Owner decision, 2 Aug: REMOVE it. Four endpoints — list, detail, book,
 * my-tickets — charged the city wallet against a table with no UI anywhere in
 * the app. A seat-lock transaction, a receipt email, and no screen from which
 * any of it could be reached.
 *
 * Deleting code is the easy half, and a guard for a deletion is usually not
 * worth writing. This one is, because of what the deletion nearly took with it.
 *
 * An earlier deploy seeded invented events — a concert that was never scheduled
 * — and those rows were bookable. The `onModuleInit` hook that cleaned them up
 * shouted when a booking blocked the delete, and that warning was the ONLY thing
 * in the codebase that knew a refund might be owed. Deleting the feature would
 * have deleted the alarm about money the feature had already taken.
 *
 * So three things are pinned: the flow cannot come back by accident, the alarm
 * survives, and the evidence is not tidied away.
 */
describe('the events flow', () => {
  it('has no endpoints left', () => {
    for (const route of ["@Get('events')", "@Get('events/:id')", "@Post('events/:id/book')", "@Get('tickets')"]) {
      expect(controller).not.toContain(route);
    }
    expect(controller).not.toMatch(/BookTicket|EventQuery/);
  });

  it('cannot take money', () => {
    // The clearest single statement of the removal: this service no longer has
    // a wallet to charge. Not "does not charge" — cannot.
    expect(service).not.toMatch(/FinancialService|financial/);
    expect(module_).not.toMatch(/FinancialModule/);
    expect(service).not.toMatch(/ticketReceipt/);
  });

  it('keeps the watchlist, which was never the problem', () => {
    // A deletion that takes a working neighbour with it is the other way this
    // goes wrong.
    for (const kept of ['async watchlist(', 'async addToWatchlist(', 'async removeFromWatchlist(', 'categories()']) {
      expect(service).toContain(kept);
    }
  });
});

describe('the refund alarm', () => {
  it('counts what citizens already paid for, and says so loudly', () => {
    expect(service).toMatch(/ticketBooking\.count\(/);
    expect(service).toMatch(/this\.logger\.error\(/);
    expect(service).toMatch(/need(s)? refunding by hand/);
  });

  it('names the seeded events that were never real', () => {
    // The eight ids are the specific ones somebody may have paid for. A generic
    // "some tickets exist" would leave an operator with nowhere to start.
    expect(service).toMatch(/RETIRED_SEED_EVENT_IDS/);
    for (const id of ['ev_arijit', 'ev_dune', 'ev_zakir']) expect(service).toContain(id);
  });

  it('does not delete the bookings', () => {
    // They are the record that money moved. The invented EVENT rows go; the
    // TicketBooking rows stay.
    expect(service).toMatch(/event\.deleteMany\(/);
    expect(service).not.toMatch(/ticketBooking\.delete/);
    expect(service).not.toMatch(/ticketBooking\.deleteMany/);
  });
});

describe('the tables', () => {
  it('are still there, on purpose', () => {
    // Not an oversight. Dropping a table this cannot verify is empty is not a
    // thing to do from a code change, and TicketBooking holds the evidence a
    // refund is owed. If somebody later confirms both are empty in production,
    // that is a migration with a human behind it — and this test is the note
    // saying so.
    expect(schema).toMatch(/model Event \{/);
    expect(schema).toMatch(/model TicketBooking \{/);
  });
});
