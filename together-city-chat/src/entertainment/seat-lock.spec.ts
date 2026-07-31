import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The last four seats cannot be sold twice.
 *
 * There is no database here, so what a unit test can hold is the shape of the
 * thing: that the event row is locked BEFORE its tiers are read, and that the
 * read used for the decision is the one taken after the lock. The ordering is
 * the entire fix — the same two statements the other way round are what the
 * code did before, and they look almost identical in a diff.
 *
 * Proving the lock works is Postgres's job. Proving we asked for it is this.
 */
const SRC = readFileSync(join(__dirname, 'entertainment.service.ts'), 'utf8');

describe('booking a ticket', () => {
  const body = (() => {
    const at = SRC.indexOf('async bookTicket');
    const from = at < 0 ? SRC.indexOf('this.financial.paid(') : at;
    return SRC.slice(from, SRC.indexOf('\n  }', from));
  })();

  it('locks the event row before reading its tiers', () => {
    const lock = body.indexOf('FOR UPDATE');
    const read = body.indexOf('tx.event.findUnique');
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(read);
  });

  it('decides on the tier it read after the lock, not the one from before it', () => {
    // `fresh` is the post-lock read; `seat` must come from it.
    expect(body).toContain('const fresh = await tx.event.findUnique');
    expect(body).toContain('const tiers = parseTiers(fresh?.tiersJson');
    expect(body).toMatch(/const seat = tiers\.find/);
    expect(body).toMatch(/if \(!seat \|\| seat\.available < dto\.qty\)/);
  });

  it('writes the seat count and the booking inside the same transaction', () => {
    const update = body.indexOf('tx.event.update');
    const create = body.indexOf('tx.ticketBooking.create');
    expect(update).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(update);
  });

  it('sends the receipt outside it, where a mail failure costs a receipt', () => {
    const paidEnds = SRC.indexOf('    );', SRC.indexOf('this.financial.paid('));
    const mail = SRC.indexOf('this.mail.deliverSystem', paidEnds);
    expect(mail).toBeGreaterThan(paidEnds);
  });
});
