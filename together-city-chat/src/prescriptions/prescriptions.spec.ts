import { BadRequestException } from '@nestjs/common';
import { needsReview, ManualEntryExtractor, CONFIDENCE_THRESHOLD } from './prescription-extractor';
import { timesFromFrequency } from './prescriptions.service';

/**
 * The rule that matters in this module: nothing becomes an alarm telling
 * somebody to take a drug until a human has confirmed the drug and the dose.
 */

describe('what still needs a human', () => {
  const sure = { medicineName: 1, dosage: 1, frequency: 1 };

  it('accepts a line that is complete and confidently read', () => {
    expect(needsReview({ medicineName: 'Metformin', dosage: '500mg', frequency: 'twice daily', confidence: sure })).toBe(false);
  });

  it('flags a missing dosage even when the reader was certain of the rest', () => {
    expect(needsReview({ medicineName: 'Metformin', frequency: 'twice daily', confidence: sure })).toBe(true);
  });

  it('flags a field the reader was unsure about', () => {
    expect(needsReview({
      medicineName: 'Metformin', dosage: '500mg', frequency: 'twice daily',
      confidence: { ...sure, dosage: CONFIDENCE_THRESHOLD - 0.01 },
    })).toBe(true);
  });

  it('treats an unmentioned field as unknown, not as certain', () => {
    // The dangerous default: a provider that omits a confidence entry must not
    // thereby be trusted completely.
    expect(needsReview({ medicineName: 'Metformin', dosage: '500mg', frequency: 'twice daily', confidence: {} })).toBe(true);
  });

  it('flags an empty string as missing rather than as a value', () => {
    expect(needsReview({ medicineName: 'Metformin', dosage: '', frequency: 'daily', confidence: sure })).toBe(true);
  });
});

describe('the default extractor, with no OCR connected', () => {
  it('reads nothing and claims nothing', async () => {
    // The honest behaviour: ask the citizen to type it. Inventing a plausible
    // medicine name would be far worse than admitting we cannot read it.
    const out = await new ManualEntryExtractor().extract();
    expect(out.items).toEqual([]);
  });
});

describe('reading a frequency into clock times', () => {
  it('understands the common Indian prescription forms', () => {
    expect(timesFromFrequency('1-0-1')).toEqual(['09:00', '21:00']);
    expect(timesFromFrequency('1-1-1')).toEqual(['08:00', '14:00', '21:00']);
    expect(timesFromFrequency('BD')).toEqual(['09:00', '21:00']);
    expect(timesFromFrequency('TDS')).toHaveLength(3);
    expect(timesFromFrequency('once daily')).toEqual(['09:00']);
  });

  it('returns nothing for a phrase it does not understand', () => {
    // Which leaves the line in review rather than inventing a schedule — a
    // wrong time is worse than an absent one.
    expect(timesFromFrequency('as needed for pain')).toEqual([]);
    expect(timesFromFrequency('')).toEqual([]);
    expect(timesFromFrequency(null)).toEqual([]);
    expect(timesFromFrequency(undefined)).toEqual([]);
  });
});

describe('confirming a prescription', () => {
  // The service is exercised through a stubbed Prisma; these cover the refusals,
  // which are the part with teeth.
  function serviceWith(items: Array<Record<string, unknown>>) {
    const { PrescriptionsService } = require('./prescriptions.service') as typeof import('./prescriptions.service');
    const prisma = {
      prescription: {
        findFirst: jest.fn(async () => ({ id: 'p1', userId: 'me', items })),
        update: jest.fn(async () => ({})),
      },
      medicine: { create: jest.fn(async () => ({ id: 'med1' })) },
      medicineSchedule: { create: jest.fn(async () => ({ id: 's1' })), findUnique: jest.fn(async () => null) },
      medicineReminder: { createMany: jest.fn(async () => ({ count: 0 })) },
    };
    const clock = { validZone: () => true, timezoneFor: async () => 'Asia/Kolkata', todayIn: () => '2026-08-01', now: () => new Date('2026-08-01T00:00:00Z') };
    return new PrescriptionsService(prisma as never, clock as never, {} as never, {} as never);
  }

  const item = (over: Record<string, unknown> = {}) => ({
    id: 'i1', medicineName: 'Metformin', dosage: '500mg', frequency: '1-0-1',
    durationDays: 7, instructions: null, timesLocal: null, confidence: '{}', needsReview: false, ...over,
  });

  it('refuses while any line still needs review, naming which', async () => {
    const svc = serviceWith([item({ needsReview: true, medicineName: 'Amoxicillin' })]);
    await expect(svc.confirm('me', 'p1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.confirm('me', 'p1', {})).rejects.toThrow(/Amoxicillin/);
  });

  it('refuses an empty prescription', async () => {
    const svc = serviceWith([]);
    await expect(svc.confirm('me', 'p1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a line whose frequency yields no dose times', async () => {
    // Rather than silently scheduling nothing, or guessing.
    const svc = serviceWith([item({ frequency: 'as needed', timesLocal: null })]);
    await expect(svc.confirm('me', 'p1', {})).rejects.toThrow(/dose times/i);
  });
});
