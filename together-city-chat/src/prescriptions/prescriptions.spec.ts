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
        updateMany: jest.fn(async () => ({ count: 1 })),
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

describe('adding a line by hand', () => {
  // The main path while no OCR is configured: the default extractor reads
  // nothing, so without this a citizen could upload a prescription, get an
  // empty review, and never be able to confirm it.
  function serviceWith(prescription: Record<string, unknown> | null) {
    const { PrescriptionsService } = require('./prescriptions.service') as typeof import('./prescriptions.service');
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      prescription: {
        findFirst: jest.fn(async () => prescription),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      prescriptionItem: {
        create: jest.fn(async ({ data }: any) => { created.push(data); return data; }),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const svc = new PrescriptionsService(prisma as never, {} as never, {} as never, {} as never);
    (svc as unknown as { get: () => Promise<unknown> }).get = jest.fn(async () => ({ ok: true }));
    return { svc, created, prisma };
  }

  it('marks a typed line as needing no review — a person read the paper', async () => {
    const { svc, created } = serviceWith({ id: 'p1', status: 'review_required' });
    await svc.addItem('me', 'p1', { medicineName: 'Metformin', dosage: '500mg', frequency: '1-0-1' });
    expect(created[0].needsReview).toBe(false);
    expect(JSON.parse(created[0].confidence as string)).toEqual({ medicineName: 1, dosage: 1, frequency: 1 });
  });

  it('derives dose times from the frequency when none were given', async () => {
    const { svc, created } = serviceWith({ id: 'p1', status: 'review_required' });
    await svc.addItem('me', 'p1', { medicineName: 'Metformin', dosage: '500mg', frequency: '1-0-1' });
    expect(JSON.parse(created[0].timesLocal as string)).toEqual(['09:00', '21:00']);
  });

  it('prefers the times the citizen typed over the frequency', async () => {
    const { svc, created } = serviceWith({ id: 'p1', status: 'review_required' });
    await svc.addItem('me', 'p1', { medicineName: 'X', dosage: '1 tab', frequency: '1-0-1', timesLocal: ['07:30'] });
    expect(JSON.parse(created[0].timesLocal as string)).toEqual(['07:30']);
  });

  it('reopens a failed upload once a human adds a line to it', async () => {
    const { svc, prisma } = serviceWith({ id: 'p1', status: 'failed' });
    await svc.addItem('me', 'p1', { medicineName: 'X', dosage: '1 tab', frequency: 'daily' });
    expect(prisma.prescription.updateMany).toHaveBeenCalledWith(
      // The owner is in the WHERE, not merely checked a few lines above it.
      expect.objectContaining({
        where: { id: 'p1', userId: 'me' },
        data: { status: 'review_required', error: null },
      }),
    );
  });

  it('refuses to add to an already-confirmed prescription', async () => {
    // Its schedules and alarms already exist; a new line would not reach them.
    const { svc } = serviceWith({ id: 'p1', status: 'confirmed' });
    await expect(svc.addItem('me', 'p1', { medicineName: 'X', dosage: '1', frequency: 'daily' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to touch a prescription that is not yours', async () => {
    const { svc, created } = serviceWith(null);
    await expect(svc.addItem('me', 'p1', { medicineName: 'X', dosage: '1', frequency: 'daily' })).rejects.toThrow();
    expect(created).toEqual([]);
  });
});
