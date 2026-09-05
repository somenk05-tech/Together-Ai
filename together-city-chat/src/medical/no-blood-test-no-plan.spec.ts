/* eslint-disable @typescript-eslint/no-explicit-any */
import { MedicalService } from './medical.service';

/**
 * ── NO BLOOD TEST, NO PLAN — AT THE MEDICAL DOOR TOO (launch gate, third
 *    reading, 4 Sep, blocker 2) ──────────────────────────────────────────
 *
 * The owner's rule (29 Aug) is that supplements are directed by blood work
 * only: no panel on file means no plan at all, not a shorter one. Fitness has
 * held it since it was written. `GET /medical/supplement-plan` was a second
 * door: it built a priced kit from an empty panel under "Everyday baseline",
 * and it called the engine WITHOUT the conditions and age the engine's own
 * CKD / pregnancy / lactation / under-18 stops read — so a CKD-4 citizen with
 * goal `gain` was handed whey and creatine.
 *
 * Both are pinned here. The sim's "0 contraindications" gate tests the
 * function with its inputs; this tests the route that forgot them.
 */

function serviceWith(opts: {
  panel: null | { takenOn: Date; biomarkers: Array<{ key: string; value: number }> };
  pref?: { goal?: string; age?: number | null; extras?: string | null } | null;
  master?: { healthConditions?: string | null; pregnancyTrimester?: string | null; dateOfBirth?: Date | null } | null;
}) {
  const prisma = {
    foodPref: { findUnique: jest.fn(async () => opts.pref === undefined ? { goal: 'gain', age: null, extras: null } : opts.pref) },
    medicalBloodTest: { findFirst: jest.fn(async () => opts.panel) },
    masterProfile: { findUnique: jest.fn(async () => opts.master ?? null) },
  };
  const clock = { now: () => new Date('2026-09-04T00:00:00Z') };
  const svc = new MedicalService(prisma as never, {} as never, {} as never, {} as never, {} as never, clock as never);
  return { svc, prisma };
}

const panel = { takenOn: new Date('2026-08-20T00:00:00Z'), biomarkers: [{ key: 'vitd', value: 40 }] };

describe('no blood test, no plan — at the medical door too', () => {
  it('hands back no items and no price when there is no panel on file', async () => {
    const { svc } = serviceWith({ panel: null });
    const plan = await svc.supplementPlan('u1');
    expect(plan.items).toEqual([]);
    expect(plan.totalInr).toBe(0);
    expect(plan.basis.hasBloodTest).toBe(false);
    expect((plan as any).gated).toBe(true);
    expect(plan.safety).toMatch(/No blood panel on file/);
  });

  it('a kidney condition on the Master Profile keeps whey and creatine out of a gain kit', async () => {
    const { svc } = serviceWith({ panel, master: { healthConditions: 'kidney', kidneyStage: 'late' } as any });
    const names = (await svc.supplementPlan('u1')).items.map((i) => i.name);
    expect(names).not.toContain('Whey protein');
    expect(names).not.toContain('Creatine monohydrate');
    expect(names).toContain('Renal vitamin (B-complex)');
    expect(names).not.toContain('Daily multivitamin');
  });

  it('a trimester on the Master Profile means a prenatal formula and no whey', async () => {
    const { svc } = serviceWith({ panel, master: { healthConditions: 'pregnancy', pregnancyTrimester: 'second' } });
    const names = (await svc.supplementPlan('u1')).items.map((i) => i.name);
    expect(names).toContain('Prenatal multivitamin');
    expect(names).not.toContain('Whey protein');
  });

  it('a condition declared in the food preference counts too', async () => {
    const { svc } = serviceWith({ panel, pref: { goal: 'gain', age: 30, extras: JSON.stringify({ healthConditions: ['Chronic kidney disease'] }) } });
    const names = (await svc.supplementPlan('u1')).items.map((i) => i.name);
    expect(names).not.toContain('Whey protein');
  });

  it('age is read from the record: an under-18 gets no whey or creatine', async () => {
    const { svc } = serviceWith({ panel, master: { dateOfBirth: new Date('2010-01-01T00:00:00Z') } });
    const names = (await svc.supplementPlan('u1')).items.map((i) => i.name);
    expect(names).not.toContain('Whey protein');
    expect(names).not.toContain('Creatine monohydrate');
  });

  it('an adult with a panel and nothing declared still gets the gain kit', async () => {
    const { svc } = serviceWith({ panel, master: { dateOfBirth: new Date('1990-01-01T00:00:00Z') } });
    const plan = await svc.supplementPlan('u1');
    expect(plan.basis.hasBloodTest).toBe(true);
    expect(plan.items.map((i) => i.name)).toEqual(expect.arrayContaining(['Whey protein', 'Creatine monohydrate', 'Daily multivitamin']));
    expect(plan.totalInr).toBeGreaterThan(0);
  });
});
