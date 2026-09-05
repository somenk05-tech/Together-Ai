import { readFileSync } from 'fs';
import { join } from 'path';
import { CLINICAL_CAVEAT } from './clinical-caveat';

/**
 * THE CAVEAT STANDS UNTIL PHASE 4 (RELEASE-GATE.md; launch gate, third
 * reading, 4 Sep). It required a "not certified for unsupervised clinical
 * use" caveat and the sentence existed nowhere. This pins the sentence, the
 * service attaching it to every clinical plan, and the page drawing it.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the caveat stands', () => {
  it('says what the release gate requires it to say', () => {
    expect(CLINICAL_CAVEAT).toMatch(/^Not certified for unsupervised clinical use\./);
    expect(CLINICAL_CAVEAT).toMatch(/doctor or dietitian/);
    expect(readFileSync(join(__dirname, '..', '..', '..', 'RELEASE-GATE.md'), 'utf8')).toMatch(/not certified for unsupervised clinical use/);
  });

  it('is attached to every clinical plan the composer returns', () => {
    const svc = strip(readFileSync(join(__dirname, 'nutrition.service.ts'), 'utf8'));
    expect(svc).toMatch(/\.\.\.\(isClinical \? \{ clinicalCaveat: CLINICAL_CAVEAT \} : \{\}\)/);
  });

  it('is drawn under the plan, on the page, whether or not a day was blocked', () => {
    const page = strip(readFileSync(join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'pages', 'MealPlan.tsx'), 'utf8'));
    expect(page).toMatch(/\{wk\.clinicalCaveat && <p className="muted" role="note">\{wk\.clinicalCaveat\}<\/p>\}/);
    // Before the blocked banner, so it is not mistaken for part of it.
    expect(page.indexOf('wk.clinicalCaveat')).toBeLessThan(page.indexOf('wk.blocked && ('));
  });
});
