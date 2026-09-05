/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AstrologyService } from './astrology.service';

/**
 * ── A PRICE THAT IS INDICATIVE IS NOT A PRICE TO CHARGE (owner, 5 Sep) ──────
 * The gem checkout charged August's retail tiers and a fallback gold rate as
 * real money, with a work callback that did nothing. The counter QUOTES now:
 * the request reaches the console, the citizen is told, nothing is taken.
 */
function build(opts: { cart?: unknown[]; recent?: boolean; admins?: string[] } = {}) {
  const svc: any = Object.create(AstrologyService.prototype);
  const notes: any[] = [];
  const charged: unknown[] = [];
  svc.requireProfile = async () => ({ userId: 'u1' });
  svc.masterProfile = { get: async () => ({ weightKg: 70 }) };
  svc.readGemCart = async () => opts.cart ?? [{ gemId: 'ruby', carat: 3, metal: 'gold22', setting: 'ring', lockedAt: '2026-09-01' }];
  svc.financial = { paid: async (...a: unknown[]) => { charged.push(a); } };
  svc.notifications = { create: async (n: unknown) => { notes.push(n); } };
  svc.prisma = {
    notification: { findFirst: async () => (opts.recent ? { id: 'n0' } : null) },
    user: { findUnique: async () => ({ handle: 'somen', name: 'Somen' }) },
    adminGrant: { findMany: async () => (opts.admins ?? ['admin1']).map((userId) => ({ userId })) },
  };
  return { svc, notes, charged };
}

describe('asking for a quote', () => {
  it('charges nothing, tells the citizen, and tells every console holder', async () => {
    const { svc, notes, charged } = build({ admins: ['admin1', 'admin2', 'admin1'] });
    const out = await svc.requestGemQuote('u1');
    expect(out.requested).toBe(true);
    expect(out.indicative).toBe(true);
    expect(charged).toEqual([]);
    expect(notes.map((n) => [n.userId, n.kind])).toEqual([
      ['u1', 'gem_quote'], ['admin1', 'gem_quote_request'], ['admin2', 'gem_quote_request'],
    ]);
    expect(notes[0].body).toMatch(/Nothing has been charged/);
    expect(notes[1].body).toMatch(/indicative/);
  });
  it('one request a day per citizen', async () => {
    const { svc, notes } = build({ recent: true });
    await expect(svc.requestGemQuote('u1')).rejects.toBeInstanceOf(ConflictException);
    expect(notes).toEqual([]);
  });
  it('an empty cart has nothing to ask about', async () => {
    const { svc } = build({ cart: [] });
    await expect(svc.requestGemQuote('u1')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('the old checkout is gone: no route and no method charges a gem', () => {
    expect(readFileSync(join(__dirname, 'astrology.controller.ts'), 'utf8')).not.toMatch(/gem-cart\/checkout/);
    expect(readFileSync(join(__dirname, 'astrology.service.ts'), 'utf8')).not.toMatch(/checkoutGemCart/);
  });
});
