/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { recommend, type Citizen } from './supplements.engine';
import { SupplementsService } from './supplements.service';

/**
 * ── THE RULES THAT WERE ONLY IN THE TESTS (launch gate, third reading,
 *    4 Sep) ────────────────────────────────────────────────────────────────
 *
 * The engine had a retinol-in-pregnancy rule and a beta-carotene-in-smokers
 * rule, each proven in a unit test with `pregnant: true` / `smoker: true` —
 * and the service that builds a real citizen never set either. It also read
 * `master.food.conditions` and `master.food.age`, keys the master view does
 * not have. And no rule at all said what a fifteen-year-old may be sold.
 * Then the till sold 60,000 IU vitamin D to anybody, with no lab on file.
 */
const panel = { values: { vitd: 34 }, takenOn: '2026-08-01' };
const lowD = { values: { vitd: 11 }, takenOn: '2026-08-01' };

function service(opts: {
  master?: Record<string, unknown> | null;
  fitness?: Record<string, unknown> | null;
  dating?: { extras?: string } | null;
  shared?: unknown;
}) {
  const prisma: any = {
    medicine: { findMany: async () => [] },
    supplementOrder: { findMany: async () => [] },
    foodPref: { findUnique: async () => ({ diet: 'everything', goal: 'maintain' }) },
    fitnessProfile: { findUnique: async () => opts.fitness ?? null },
    datingProfile: { findUnique: async () => opts.dating ?? null },
  };
  const masterProfile = { get: async () => opts.master ?? {} };
  const medical = { sharedBiomarkers: async () => opts.shared ?? panel };
  const nutrition = { targets: async () => null };
  const financial = { paid: async (_u: string, _c: unknown, fn: (tx: unknown) => Promise<string>) => fn({ supplementOrder: { create: async () => ({ id: 'o1' }) } }) };
  const svc: any = new SupplementsService(prisma, masterProfile as never, medical as never, nutrition as never, financial as never);
  svc.saveBag = async () => undefined;
  svc.bag = async () => ({ items: [] });
  return svc;
}

describe('the inputs the engine reads are set', () => {
  it('a trimester on the Master Profile makes the citizen pregnant', async () => {
    const svc = service({ master: { age: 30, healthConditions: 'pregnancy', pregnancyTrimester: 'second' } });
    const { citizen } = await svc.citizenFor('u1');
    expect(citizen.pregnant).toBe(true);
    expect(citizen.conditions).toContain('pregnancy');
    expect(citizen.age).toBe(30);
  });

  it('a breastfeeding condition on the fitness profile does too, and the lists merge', async () => {
    const svc = service({ master: { healthConditions: 'kidney' }, fitness: { conditions: 'breastfeeding,jointPain', answeredAt: null, age: 35 } });
    const { citizen } = await svc.citizenFor('u1');
    expect(citizen.pregnant).toBe(true);
    expect(citizen.conditions?.sort()).toEqual(['breastfeeding', 'jointPain', 'kidney']);
  });

  it('smoking is read from the one place the city asks it', async () => {
    const smokes = service({ master: { age: 40 }, dating: { extras: JSON.stringify({ smoking: 'Regularly' }) } });
    expect((await smokes.citizenFor('u1')).citizen.smoker).toBe(true);
    const never = service({ master: { age: 40 }, dating: { extras: JSON.stringify({ smoking: 'Never' }) } });
    expect((await never.citizenFor('u1')).citizen.smoker).toBe(false);
    const unasked = service({ master: { age: 40 } });
    expect((await unasked.citizenFor('u1')).citizen.smoker).toBe(false);
  });

  it('the fitness row’s default age of 35 is not an answer', async () => {
    const svc = service({ master: { age: 52 }, fitness: { age: 35, answeredAt: null } });
    expect((await svc.citizenFor('u1')).citizen.age).toBe(52);
    const answered = service({ master: { age: 52 }, fitness: { age: 41, answeredAt: new Date() } });
    expect((await answered.citizenFor('u1')).citizen.age).toBe(41);
  });
});

describe('under eighteen', () => {
  const teen: Citizen = { age: 15, goal: 'muscle', trainsPerWeek: 4, labs: [{ name: '25-OH vitamin D', value: 34, unit: 'ng/mL' }] };
  it('refuses creatine and protein powder to a fifteen-year-old', () => {
    const plan = recommend(teen).plan;
    for (const id of ['creatine', 'protein']) {
      const r = plan.find((x) => x.id === id);
      if (r) {
        expect(r.bucket).toBe('not-recommended');
        expect(r.flags.some((f) => /Under 18/.test(f.text))).toBe(true);
      }
    }
  });
  it('an adult with the same profile is not refused on age', () => {
    const plan = recommend({ ...teen, age: 25 }).plan;
    for (const r of plan) expect(r.flags.some((f) => /Under 18/.test(f.text))).toBe(false);
  });
});

describe('a repletion dose needs the deficiency on file', () => {
  const sixtyK = 'cadila-calcirol-60k-sachet';
  it('refuses 60,000 IU with a normal result on file', async () => {
    const svc = service({ master: { age: 30 }, shared: panel });
    await expect(svc.placeOrder('u1', { items: [{ id: sixtyK, qty: 1 }], method: 'wallet' })).rejects.toThrow(/repletion dose/);
  });
  it('refuses it with no panel at all', async () => {
    const svc = service({ master: { age: 30 }, shared: null });
    await expect(svc.placeOrder('u1', { items: [{ id: sixtyK, qty: 1 }], method: 'wallet' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('with a documented deficiency it asks for the confirmation, then sells', async () => {
    const svc = service({ master: { age: 30 }, shared: lowD });
    await expect(svc.placeOrder('u1', { items: [{ id: sixtyK, qty: 1 }], method: 'wallet' })).rejects.toThrow(/clinical decision/);
    await expect(svc.placeOrder('u1', { items: [{ id: sixtyK, qty: 1 }], method: 'wallet', acknowledged: [sixtyK] })).resolves.toBeDefined();
  });
});
