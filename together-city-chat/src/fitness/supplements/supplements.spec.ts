import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recommend, type Citizen } from './supplements.engine';
import { SUPPLEMENTS, DO_NOT_RECOMMEND } from './knowledge';

/**
 * THE SUPPLEMENT ENGINE IS A SAFETY DEVICE BEFORE IT IS A FEATURE.
 *
 * Supplements are not pre-approved for safety or effectiveness the way drugs
 * are; they interact with real medicines; and the person reading a number on a
 * screen cannot tell a sourced one from an invented one. So the tests below are
 * not about output quality. They are about the four things that would make this
 * engine dangerous, each written as a rule it cannot get past.
 */

const bare: Citizen = {};
const find = (c: Citizen, id: string) => recommend(c).plan.find((r) => r.id === id);

describe('it never invents a dose', () => {
  it('every dose it prints is a string out of the knowledge base', () => {
    const doses = new Set(SUPPLEMENTS.map((s) => s.typicalDose));
    for (const c of [bare, { vegetarian: true, goal: 'muscle', trainsPerWeek: 4 } as Citizen]) {
      for (const r of recommend(c).plan) {
        if (r.dose !== null) {
          expect({ id: r.id, fromKnowledgeBase: doses.has(r.dose) }).toEqual({ id: r.id, fromKnowledgeBase: true });
        }
      }
    }
  });

  it('and withholds the number entirely where a clinician sets it', () => {
    // A documented deficiency is a repletion protocol, and a repletion protocol
    // is a clinical decision. The engine's answer is the range and the doctor,
    // never a number of its own computed from the result.
    const low = find({ labs: [{ name: '25-OH vitamin D', value: 11, unit: 'ng/mL' }] }, 'vitamin-d3')!;
    expect(low.bucket).toBe('priority');
    expect(low.needsClinician).toBe(true);
    expect(low.dose).toBeNull();
  });

  it('there is no arithmetic on a lab value anywhere in the engine', () => {
    // The rule stated as code rather than as a comment: a number that came out
    // of a calculation is a number nobody sourced.
    const src = readFileSync(join(__dirname, 'supplements.engine.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/\bvalue\s*[*/+-]\s*\d/);
    expect(src).not.toMatch(/weightKg\s*[*/]/);
  });
});

describe('it will not put iron in front of somebody who has not been tested', () => {
  it('no ferritin result means not recommended, and says why', () => {
    const iron = find(bare, 'iron')!;
    expect(iron.bucket).toBe('not-recommended');
    expect(iron.dose).toBeNull();
    expect(iron.why[0].text).toMatch(/ferritin/i);
  });

  it('a low ferritin makes it a priority — and still a doctor’s number', () => {
    const iron = find({ labs: [{ name: 'Ferritin', value: 9, unit: 'ng/mL' }] }, 'iron')!;
    expect(iron.bucket).toBe('priority');
    expect(iron.needsClinician).toBe(true);
    expect(iron.dose).toBeNull();
  });

  it('and a normal ferritin closes the question rather than leaving it open', () => {
    const iron = find({ labs: [{ name: 'Ferritin', value: 90, unit: 'ng/mL' }] }, 'iron')!;
    expect(iron.bucket).toBe('not-recommended');
    expect(iron.why[0].text).toMatch(/no gap here/i);
  });
});

describe('safety and interactions run BEFORE the citizen sees anything', () => {
  it('a medicine interaction takes the decision away from the app', () => {
    const k2 = find({ medicines: ['Warfarin 5mg'] }, 'vitamin-k2');
    // K2 is only offered where something asks for it; what matters is that when
    // it IS offered to somebody on warfarin, it can never arrive unflagged.
    const omega = find({ medicines: ['Warfarin 5mg'] }, 'omega-3')!;
    expect(omega.needsClinician).toBe(true);
    expect(omega.flags.some((f) => f.kind === 'interaction')).toBe(true);
    if (k2) expect(k2.needsClinician).toBe(true);
  });

  it('a condition can refuse a supplement outright', () => {
    const protein = find({ conditions: ['Chronic kidney disease'], proteinTargetG: 100, proteinIntakeG: 60 }, 'protein')!;
    expect(protein.bucket).toBe('not-recommended');
    expect(protein.flags.some((f) => f.kind === 'condition')).toBe(true);
  });

  it('and a smoker is warned about the beta-carotene inside a multivitamin', () => {
    const mv = find({ smoker: true }, 'multivitamin')!;
    expect(mv.bucket).toBe('not-recommended');
    expect(mv.flags.some((f) => f.kind === 'harm' && /beta-carotene/i.test(f.text))).toBe(true);
  });

  it('a supplement already in the cabinet is flagged rather than stacked', () => {
    const omega = find({ taking: ['Omega-3 fish oil 1000mg'] }, 'omega-3')!;
    expect(omega.flags.some((f) => f.kind === 'duplicate')).toBe(true);
  });
});

describe('an educational suggestion is never dressed as a clinical one', () => {
  it('a population base rate is labelled as one, and does not become a finding', () => {
    const d = find(bare, 'vitamin-d3')!;
    expect(d.bucket).toBe('consider');
    expect(d.why[0].from).toBe('population');
    expect(d.why[0].text).toMatch(/not a finding about you/i);
  });

  it('every reason names where it came from', () => {
    const c: Citizen = {
      vegetarian: true, goal: 'muscle', trainsPerWeek: 4, proteinTargetG: 100, proteinIntakeG: 62,
      labs: [{ name: '25-OH vitamin D', value: 14, unit: 'ng/mL' }],
    };
    for (const r of recommend(c).plan) {
      for (const w of r.why) {
        expect({ id: r.id, from: w.from }).toEqual({ id: r.id, from: w.from }); // typed union
        expect(['lab', 'diet', 'goal', 'fitness', 'medicine', 'population', 'evidence']).toContain(w.from);
      }
    }
  });

  it('and "not recommended" is an answer it gives with a citation', () => {
    const plan = recommend(bare).plan.filter((r) => r.bucket === 'not-recommended');
    expect(plan.length).toBeGreaterThan(0);
    for (const r of plan) expect(r.why.some((w) => w.source) || r.flags.some((f) => f.source)).toBe(true);
  });

  it('the things Mira is watching are named before their results exist', () => {
    const { watching } = recommend(bare);
    expect(watching.map((w) => w.text).join(' ')).toMatch(/Vitamin D.*B12.*Ferritin/s);
  });
});

describe('the knowledge base itself', () => {
  it('carries all nineteen assessed supplements, each with a dose and a limit', () => {
    expect(SUPPLEMENTS).toHaveLength(19);
    for (const s of SUPPLEMENTS) {
      expect({ id: s.id, dose: Boolean(s.typicalDose), limit: Boolean(s.upperLimit) })
        .toEqual({ id: s.id, dose: true, limit: true });
    }
  });

  it('and the sixteen the review says to skip, each with its trial', () => {
    expect(DO_NOT_RECOMMEND).toHaveLength(16);
    for (const s of DO_NOT_RECOMMEND) expect(s.source.length).toBeGreaterThan(3);
  });

  it('marks the three that need a blood test before the first dose', () => {
    const first = SUPPLEMENTS.filter((s) => s.testFirst).map((s) => s.id).sort();
    expect(first).toEqual(['iron', 'vitamin-b12', 'vitamin-d3']);
  });
});
