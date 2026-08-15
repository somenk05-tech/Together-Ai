import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recommend, type Citizen } from './supplements.engine';
import { SUPPLEMENTS, DO_NOT_RECOMMEND } from './knowledge';
import { CUTOFF } from './labs';
import { AISLES, PRODUCTS, STOCKED, productsFor } from './products';

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

/* ══ THE PANEL THE OWNER ACTUALLY HAS ═══════════════════════════════════════
   Haemoglobin, HbA1c, LDL, triglycerides. The first version of this engine
   mapped vitamin D, B12 and ferritin — none of which he has — so his page
   read him India's base rates while his own results sat one hub away. These
   are the four rules that fixed it, and the one place they must NOT go. */

const PANEL: Citizen['labs'] = [
  { name: 'Haemoglobin', value: 14.8, unit: 'g/dL', at: '2026-07-19' },
  { name: 'HbA1c', value: 6.7, unit: '%', at: '2026-07-19' },
  { name: 'Triglycerides', value: 427, unit: 'mg/dL', at: '2026-07-19' },
  { name: 'LDL cholesterol', value: 132, unit: 'mg/dL', at: '2026-07-19' },
];

describe('a lipid result reaches the shelf, and reaches it differently by marker', () => {
  it('a raised LDL makes psyllium a priority — with a food dose, not a doctor’s', () => {
    const p = find({ labs: PANEL }, 'psyllium')!;
    expect(p.bucket).toBe('priority');
    expect(p.why[0].from).toBe('lab');
    expect(p.why[0].text).toContain('132');
    // The distinguishing property: this one it may actually dose, because the
    // number is a food quantity out of the knowledge base and not a titration.
    expect(p.dose).toBe(SUPPLEMENTS.find((s) => s.id === 'psyllium')!.typicalDose);
    expect(p.needsClinician).toBe(false);
  });

  it('and with no lipid panel it is still offered — as a base rate, labelled as one', () => {
    const p = find(bare, 'psyllium')!;
    expect(p.bucket).toBe('optional');
    expect(p.why[0].from).toBe('population');
    expect(p.why[0].text).toMatch(/not a finding about you/i);
  });

  it('a raised triglyceride moves omega-3 up AND takes the number away', () => {
    const o = find({ labs: PANEL }, 'omega-3')!;
    expect(o.bucket).toBe('consider');
    expect(o.needsClinician).toBe(true);
    // The whole point. The reliable effect is real, the outcome evidence is
    // for a 4 g/day prescription drug, and this is where a supplement page
    // turns into a prescription pad if nobody stops it.
    expect(o.dose).toBeNull();
    expect(o.why.map((w) => w.text).join(' ')).toMatch(/prescription/i);
  });

  it('and with no triglyceride it stays where it was, on a population reason', () => {
    const o = find(bare, 'omega-3')!;
    expect(o.bucket).toBe('optional');
    expect(o.why.every((w) => w.from !== 'lab')).toBe(true);
  });
});

describe('a result that is not a supplement question is handed back, not answered', () => {
  it('an HbA1c in the diabetes range is named, sourced, and sold nothing', () => {
    const { plan, clinical } = recommend({ labs: PANEL });
    const a1c = clinical.find((n) => n.marker === 'hba1c')!;
    expect(a1c.text).toContain('6.7');
    expect(a1c.source).toBe(CUTOFF.hba1cDiabetes.authority);
    // NOTHING on the plan may cite it. A supplement recommended "for your
    // blood sugar" is the exact sentence this subsystem exists to not say.
    for (const r of plan) {
      for (const w of r.why) expect(w.text.toLowerCase()).not.toContain('hba1c');
    }
  });

  it('every clinical note carries the body that set the band', () => {
    const { clinical } = recommend({ labs: PANEL });
    expect(clinical.map((n) => n.marker).sort()).toEqual(['hba1c', 'ldl', 'trig']);
    for (const n of clinical) expect(n.source.length).toBeGreaterThan(3);
  });

  it('and a normal haemoglobin says nothing at all', () => {
    const { clinical } = recommend({ labs: PANEL });
    expect(clinical.some((n) => n.marker === 'hb')).toBe(false);
  });
});

describe('a low haemoglobin does not become a reason to buy iron', () => {
  const anaemic: Citizen = { sex: 'male', labs: [{ name: 'Haemoglobin', value: 10.9, unit: 'g/dL' }] };

  it('iron stays refused, and the refusal gets MORE specific rather than less', () => {
    const iron = find(anaemic, 'iron')!;
    expect(iron.bucket).toBe('not-recommended');
    expect(iron.dose).toBeNull();
    expect(iron.why[0].text).toMatch(/under a third of Indian anaemia/i);
  });

  it('B12 comes forward instead, because it is the next cause on the list', () => {
    const b12 = find(anaemic, 'vitamin-b12')!;
    expect(b12.bucket).toBe('consider');
    expect(b12.why.some((w) => w.from === 'lab' && /haemoglobin/i.test(w.text))).toBe(true);
  });

  it('and where the sex is unknown the LOWER threshold is used', () => {
    // 12.4 is anaemia in one WHO sentence and not the other. An engine with no
    // sex on file does not get to pick which person is reading.
    expect(recommend({ labs: [{ name: 'Haemoglobin', value: 12.4 }] }).clinical.some((n) => n.marker === 'hb')).toBe(false);
    expect(recommend({ sex: 'male', labs: [{ name: 'Haemoglobin', value: 12.4 }] }).clinical.some((n) => n.marker === 'hb')).toBe(true);
  });
});

describe('every threshold the engine compares against is published by somebody', () => {
  it('no bare number is compared against a lab result anywhere in the engine', () => {
    const src = readFileSync(join(__dirname, 'supplements.engine.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // `x.value < 20` is how a threshold gets into a codebase unsourced. Every
    // comparison must name a CUTOFF, and every CUTOFF names an authority.
    expect(src).not.toMatch(/\.value\s*[<>]=?\s*\d/);
    // And a cut-off may be compared against. It may not be arithmetic.
    expect(src).not.toMatch(/CUTOFF\.\w+\.value\s*[*/+-]/);
  });

  it('and every cut-off says who publishes it', () => {
    for (const [name, c] of Object.entries(CUTOFF)) {
      expect({ name, sourced: c.authority.length > 8 }).toEqual({ name, sourced: true });
      expect({ name, banded: c.band.length > 2 }).toEqual({ name, banded: true });
    }
  });
});

/* ══ THE SHELF ══════════════════════════════════════════════════════════════ */

describe('the store sells nothing this city cannot cite', () => {
  it('every product resolves to a supplement in the knowledge base', () => {
    const ids = new Set(SUPPLEMENTS.map((s) => s.id));
    for (const p of PRODUCTS) {
      expect({ id: p.id, known: ids.has(p.supplement) }).toEqual({ id: p.id, known: true });
    }
  });

  it('and every aisle is built from those same ids', () => {
    const ids = new Set(SUPPLEMENTS.map((s) => s.id));
    for (const a of AISLES) for (const s of a.supplements) {
      expect({ aisle: a.id, s, known: ids.has(s) }).toEqual({ aisle: a.id, s, known: true });
    }
  });

  it('there is no affiliate parameter on any link in the catalogue', () => {
    // The plan page's argument was that the moment a refusal costs revenue,
    // the refusals get quieter. The cheapest way to keep that true is to
    // never be in the transaction — asserted rather than promised.
    for (const p of PRODUCTS) {
      expect({ id: p.id, https: p.url.startsWith('https://') }).toEqual({ id: p.id, https: true });
      expect(p.url).not.toMatch(/[?&](tag|aff|affid|ref|utm_|subid|clickid)/i);
    }
  });

  it('the refused supplements are still on the shelf, on purpose', () => {
    // Hiding a multivitamin from somebody who came looking for one does not
    // stop them buying it. It stops them reading the 78 trials first.
    expect(productsFor('multivitamin').length).toBeGreaterThan(0);
    expect(productsFor('collagen').length).toBeGreaterThan(0);
  });

  it('prescription items sort last and unpriced items sort after priced ones', () => {
    const d3 = productsFor('vitamin-d3');
    expect(d3[d3.length - 1].rx).toBe(true);
    const creatine = productsFor('creatine');
    expect(creatine.map((p) => p.priceFrom === undefined)).toEqual([false, false, true]);
  });

  it('and three supplements have no verified Indian product, which the store must be able to say', () => {
    const missing = SUPPLEMENTS.map((s) => s.id).filter((id) => !STOCKED.includes(id));
    expect(missing.sort()).toEqual(['folate', 'l-theanine', 'vitamin-k2']);
  });
});
