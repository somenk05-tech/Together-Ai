/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chartAffinity, compatibilityScore } from './astrology';
import { DatingService } from './dating.service';
import { MessagesService } from '../messages/messages.service';

/**
 * ── THE CHART, NOT THE DICE; A PATTERN OF REPORTS; THE WORDS ARE SCREENED ──
 * (launch gate, third reading — Dating MEDIUMs, owner decisions 5 Sep)
 */
describe('the number under the card is the chart', () => {
  const a = { userId: 'a', birthDate: new Date('1990-04-10'), interests: ['x'] };
  const b = { userId: 'b', birthDate: new Date('1992-08-20'), interests: ['x'] };

  it('carries no per-pair jitter: the same inputs give the same number, whoever the pair is', () => {
    const one = compatibilityScore(a, b).score;
    const two = compatibilityScore({ ...a, userId: 'zz1' }, { ...b, userId: 'zz2' }).score;
    expect(one).toBe(two);
  });

  it('with only Sun signs the affinity is the Sun affinity', () => {
    expect(chartAffinity('fire', 'air')).toEqual({ base: 92, layers: ['sun'] });
  });

  it('a Moon sign on both sides weighs as much as the Sun', () => {
    // sun fire/air = 92; moon Cancer/Capricorn = water/earth = 92 → 92
    expect(chartAffinity('fire', 'air', { moon: 'Cancer' }, { moon: 'Capricorn' })).toEqual({ base: 92, layers: ['sun', 'moon'] });
    // sun fire/air = 92; moon Aries/Cancer = fire/water = 58 → (0.4·92 + 0.4·58)/0.8 = 75
    expect(chartAffinity('fire', 'air', { moon: 'Aries' }, { moon: 'Cancer' }).base).toBe(75);
  });

  it('the ascendant counts only when both have one, and counts for a fifth', () => {
    const both = chartAffinity('fire', 'fire', { moon: 'Leo', ascendant: 'Leo' }, { moon: 'Leo', ascendant: 'Cancer' });
    // sun 88·0.4 + moon 88·0.4 + asc fire/water 58·0.2 = 82
    expect(both).toEqual({ base: 82, layers: ['sun', 'moon', 'ascendant'] });
    const oneSided = chartAffinity('fire', 'fire', { moon: 'Leo', ascendant: 'Leo' }, { moon: 'Leo' });
    expect(oneSided.layers).toEqual(['sun', 'moon']);
  });

  it('the score names which layers it stands on', () => {
    expect(compatibilityScore({ ...a, natal: { moon: 'Leo' } }, { ...b, natal: { moon: 'Leo' } }).layers).toEqual(['sun', 'moon']);
  });
});

describe('a pattern of reports takes a card out of Browse', () => {
  function build(openReporters: string[], moderation = 'approved') {
    const svc: any = Object.create(DatingService.prototype);
    const updates: unknown[] = [];
    svc.analytics = { track: () => undefined };
    svc.prisma = {
      report: {
        findMany: async () => openReporters.map((reporterId) => ({ reporterId })),
        count: async () => openReporters.length,
      },
      datingProfile: {
        updateMany: async ({ where, data }: any) => { updates.push({ where, data }); return { count: where.moderation === moderation ? 1 : 0 }; },
      },
    };
    return { svc, updates };
  }
  it('two distinct open reports leave the card alone', async () => {
    const { svc, updates } = build(['r1', 'r2']);
    expect(await svc.holdIfReported('t')).toBe(false);
    expect(updates).toEqual([]);
  });
  it('the third distinct open report moves approved → review', async () => {
    const { svc, updates } = build(['r1', 'r2', 'r3']);
    expect(await svc.holdIfReported('t')).toBe(true);
    expect(updates).toEqual([{ where: { userId: 't', moderation: 'approved' }, data: { moderation: 'review' } }]);
  });
  it('a card already in review, or rejected, is not touched twice', async () => {
    const { svc } = build(['r1', 'r2', 'r3'], 'review');
    expect(await svc.holdIfReported('t')).toBe(false);
  });
  it('the threshold is configurable but never below two', () => {
    const svc: any = Object.create(DatingService.prototype);
    process.env.DATING_REPORTS_AUTO_HOLD = '1';
    expect(svc.autoHoldAt()).toBe(3);
    process.env.DATING_REPORTS_AUTO_HOLD = '5';
    expect(svc.autoHoldAt()).toBe(5);
    delete process.env.DATING_REPORTS_AUTO_HOLD;
  });
  it('the console’s dismiss puts a report-held card back (the release lives beside the dismissal)', () => {
    const social = readFileSync(join(__dirname, '..', 'social', 'social.service.ts'), 'utf8');
    expect(social).toMatch(/decision === 'dismiss' && targetType === 'user' && reportsClosed > 0/);
    expect(social).toMatch(/where: \{ userId: targetId, moderation: 'review' \}, data: \{ moderation: 'approved' \}/);
  });
});

describe('the words are screened where the pictures are', () => {
  function svc(anonymousTrust: number | null) {
    const m: any = Object.create(MessagesService.prototype);
    m.prisma = { conversation: { findUnique: async () => ({ anonymousTrust }) } };
    return m as { screenWords(c: string, b: string): Promise<void> };
  }
  it('a phone number is refused while the pair is anonymous', async () => {
    await expect(svc(0).screenWords('c1', 'call me on 98765 43210')).rejects.toThrow(/a phone number/);
  });
  it('an app handle is refused too, in the profile scanner’s words', async () => {
    await expect(svc(1).screenWords('c1', 'add me on insta: somen_k')).rejects.toThrow(/messaging or social handle/);
  });
  it('after both have shared names, a number may be sent', async () => {
    await expect(svc(2).screenWords('c1', 'call me on 98765 43210')).resolves.toBeUndefined();
  });
  it('a request for money is refused at every stage', async () => {
    await expect(svc(3).screenWords('c1', 'can you send me money by western union')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('a city chat is not screened at all', async () => {
    await expect(svc(null).screenWords('c1', 'send me money 98765 43210')).resolves.toBeUndefined();
  });
});
