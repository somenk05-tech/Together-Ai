/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { can } from '../admin/permissions';
import { ACTIVATION, MIN_GROUP, SYSTEMS } from './insights.config';
import {
  addDays, ageBandOf, boundsOf, change, cityDay, cityOf, deviceOf, foldSmall, hostOf, pointChange, rate, sourceOf, systemOfPath,
} from './insights-math';
import { InsightsController, OriginSchema } from './insights.controller';
import { RequestStats } from './request-stats';

/**
 * THE CONTROL ROOM BEHIND THE CITY (owner, 16 Sep): the definitions, the
 * arithmetic, who may read it, and what it may never say.
 */
describe('the arithmetic', () => {
  it('counts days as the city has them', () => {
    expect(cityDay(new Date('2026-09-15T19:00:00Z'))).toBe('2026-09-16');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('compares a window with the equal one before it', () => {
    const b = boundsOf('7d', new Date('2026-09-16T06:00:00Z'));
    expect(b).toMatchObject({ from: '2026-09-10', to: '2026-09-16', prevFrom: '2026-09-03', prevTo: '2026-09-09', days: 7 });
    expect(boundsOf('all', new Date()).prevFrom).toBeNull();
  });

  it('never calls a handful of people a trend', () => {
    expect(change(3, 1)).toEqual({ pct: null, note: 'Not enough data to establish a meaningful trend.' });
    expect(change(12, 10).pct).toBe(20);
    expect(change(12, 0).pct).toBeNull();
    expect(change(12, null).pct).toBeNull();
    expect(pointChange(40, 35, 3).pct).toBeNull();
    expect(pointChange(40, 35.5, 20).pct).toBe(4.5);
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(1, 0)).toBeNull();
  });

  it('knows which system a request belongs to', () => {
    expect(systemOfPath('/api/mira/ask?x=1')).toBe('assistant');
    expect(systemOfPath('/api/family/weekly')).toBe('nutrition');
    expect(systemOfPath('/api/miranda')).toBeNull();
    expect(systemOfPath('/api/social/feed')).toBeNull();
    expect(SYSTEMS).toHaveLength(8);
  });

  it('reads where a visit came from', () => {
    expect(sourceOf('ig', 'social', null)).toBe('instagram');
    expect(sourceOf('facebook', 'paid_social', null)).toBe('paid_social');
    expect(sourceOf(null, null, 'www.google.co.in')).toBe('google');
    expect(sourceOf(null, null, null)).toBe('direct');
    expect(sourceOf(null, null, 'news.ycombinator.com')).toBe('referral');
    expect(hostOf('https://l.instagram.com/?u=secret')).toBe('l.instagram.com');
    expect(hostOf('not a url')).toBeNull();
    expect(deviceOf('Mozilla/5.0 (iPhone) Mobile')).toBe('phone');
    expect(deviceOf('Mozilla/5.0 (iPad)')).toBe('tablet');
  });

  it('names cities and ages without guessing', () => {
    expect(cityOf('Bombay')).toBe('Mumbai');
    expect(cityOf('Goa')).toBe('Other');
    expect(cityOf('  ')).toBeNull();
    const now = new Date('2026-09-16T00:00:00Z');
    expect(ageBandOf(new Date('2000-01-01T00:00:00Z'), now)).toBe('25–34');
    expect(ageBandOf(new Date('2015-01-01T00:00:00Z'), now)).toBeNull();
  });
});

describe('what the dashboard may never show', () => {
  it('folds any group smaller than MIN_GROUP into Other, and hides a fold that is still too small', () => {
    expect(MIN_GROUP).toBeGreaterThanOrEqual(3);
    expect(foldSmall([{ label: 'Mumbai', count: 5 }, { label: 'Goa', count: 1 }, { label: 'Pune', count: 2 }]))
      .toEqual({ rows: [{ label: 'Mumbai', count: 5 }, { label: 'Other', count: 3 }], hidden: 0 });
    expect(foldSmall([{ label: 'Mumbai', count: 5 }, { label: 'Goa', count: 1 }]))
      .toEqual({ rows: [{ label: 'Mumbai', count: 5 }], hidden: 1 });
  });

  it('selects no personal field anywhere', () => {
    const svc = readFileSync(join(__dirname, 'insights.service.ts'), 'utf8');
    for (const field of ['"email"', '"phone"', '"name"', '"handle"', '"text"', '"passwordHash"', '"address"', '"bio"']) {
      expect(svc).not.toContain(field);
    }
    // The live feed says what happened, never who.
    expect(svc).toMatch(/NEVER who/);
    expect(svc).not.toMatch(/Member #/);
  });

  it('never states revenue that was not taken', async () => {
    const svc = readFileSync(join(__dirname, 'insights.service.ts'), 'utf8');
    expect(svc).toContain("monetised: false");
    expect(svc).toContain("{ key: 'paying', value: null");
  });

  it('keeps the activation rule where it can be changed', () => {
    expect(ACTIVATION).toEqual({ minSystems: 2, withinDays: 7 });
  });
});

describe('who may read it', () => {
  const svc = { overview: jest.fn(async () => 'overview'), health: jest.fn(async () => 'health') } as any;
  const refuse = { assert: jest.fn(async () => { throw new ForbiddenException('no'); }) } as any;
  const allow = { assert: jest.fn(async () => ['founder']) } as any;

  it('asks the investor for the deck’s password', async () => {
    const c = new InsightsController(svc, refuse, {} as any);
    expect(() => c.investor('overview', '30d', 'nope')).toThrow(ForbiddenException);
    expect(() => c.investor('overview', '30d', undefined)).toThrow(ForbiddenException);
    await expect(c.investor('overview', '30d', 'Togethercity')).resolves.toBe('overview');
    expect(svc.overview).toHaveBeenLastCalledWith('30d', 'investor');
  });

  it('asks an account for analytics.read, which the founder holds and an investor role holds alone', async () => {
    await expect(new InsightsController(svc, refuse, {} as any).founder({ sub: 'u' } as any, 'overview', '7d')).rejects.toThrow(ForbiddenException);
    await expect(new InsightsController(svc, allow, {} as any).founder({ sub: 'u' } as any, 'health', 'bogus')).resolves.toBe('health');
    expect(allow.assert).toHaveBeenCalledWith('u', 'analytics.read');
    expect(can(['founder'], 'analytics.read')).toBe(true);
    expect(can(['investor'], 'analytics.read')).toBe(true);
    expect(can(['investor'], 'users.read')).toBe(false);
    expect(can(['support'], 'analytics.read')).toBe(false);
  });

  it('takes campaign tags as short strings only', () => {
    expect(() => OriginSchema.parse({ source: 'x'.repeat(81) })).toThrow();
    expect(OriginSchema.parse({ source: 'ig', landedAt: '2026-09-16T06:00:00.000Z' })).toMatchObject({ source: 'ig' });
  });
});

describe('the server’s own health', () => {
  it('counts requests, failures and times, and says since when', () => {
    const s = new RequestStats();
    const t = Date.now();
    for (let i = 0; i < 99; i++) s.record(200, 20, t);
    s.record(503, 900, t);
    const snap = s.snapshot(t);
    expect(snap).toMatchObject({ requests: 100, errors: 1, successRate: 99, p50ms: 20 });
    expect(snap.timeline).toHaveLength(1);
  });
});
