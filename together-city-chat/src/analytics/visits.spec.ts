import { readFileSync } from 'fs';
import { join } from 'path';
import { INVESTOR_PASSWORD, investorPasswordOk, isAutomated, visitorKey } from './visits.service';
import { VisitOriginGuard } from './visit-origin.guard';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * THE CITY COUNTS ITS VISITORS (owner, 16 Sep). What is asserted here is what
 * breaks quietly: a counter that stores somebody's address, a lock that opens
 * for a near miss, and a table the code reads that no migration creates.
 */
describe('the city counts its visitors', () => {
  it('opens the counter only for the exact password the owner chose', () => {
    expect(INVESTOR_PASSWORD).toBe('Togethercity');
    expect(investorPasswordOk('Togethercity')).toBe(true);
    for (const wrong of ['togethercity', 'Togethercity ', '', undefined, null, 42]) {
      expect(investorPasswordOk(wrong)).toBe(false);
    }
  });

  it('keys a browser by its own id, and anything else by a hash that holds no address', () => {
    const id = '3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60';
    expect(visitorKey(id, '1.2.3.4', 'Safari')).toBe(`v:${id}`);
    expect(visitorKey(id.toUpperCase(), '1.2.3.4', 'Safari')).toBe(`v:${id}`);
    const hashed = visitorKey('not-an-id', '203.0.113.9', 'Safari');
    expect(hashed).toMatch(/^h:[0-9a-f]{32}$/);
    expect(hashed).not.toContain('203');
    expect(visitorKey(undefined, '203.0.113.9', 'Safari')).toBe(hashed);
    expect(visitorKey(undefined, '203.0.113.10', 'Safari')).not.toBe(hashed);
  });

  it('does not count crawlers, link previews or probes as people', () => {
    expect(isAutomated('')).toBe(true);
    expect(isAutomated('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(true);
    expect(isAutomated('WhatsApp/2.23.20.0')).toBe(true);
    expect(isAutomated('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe(false);
  });

  it('ships the table it reads in a migration of its own', () => {
    const sql = read('prisma/migrations/20260916T020000_the_city_counts_its_visitors/migration.sql');
    expect(sql).toMatch(/CREATE TABLE "SiteVisitor"/);
    expect(read('prisma/schema.prisma')).toMatch(/model SiteVisitor \{/);
  });

  it('never serves the numbers without the password, and is registered', () => {
    const ctl = read('src/analytics/visits.controller.ts');
    expect(ctl).toMatch(/@Get\('stats'\)[\s\S]{0,200}if \(!investorPasswordOk\(password\)\) throw new ForbiddenException/);
    expect(read('src/analytics/analytics.module.ts')).toMatch(/controllers: \[VisitsController\]/);
  });

  it('counts a beacon only from the city\'s own pages', () => {
    const guard = new VisitOriginGuard();
    const ctx = (origin?: string) => ({
      switchToHttp: () => ({ getRequest: () => ({ headers: origin === undefined ? {} : { origin } }) }),
    }) as never;
    expect(guard.canActivate(ctx('https://togethercity.app'))).toBe(true);
    expect(guard.canActivate(ctx(undefined))).toBe(false);
    expect(guard.canActivate(ctx(''))).toBe(false);
  });
});
