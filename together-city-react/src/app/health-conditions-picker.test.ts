import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const master = read('features', 'profile', 'pages', 'MasterProfile.tsx');
const options = read('features', 'profile', 'healthConditions.ts');
const records = read('features', 'medical', 'pages', 'Records.tsx');
const api = read('..', '..', 'together-city-chat', 'src', 'shared', 'health-conditions.ts');

/** The options file explains itself by naming the keys it does NOT offer, so an
 *  absence check that reads the comments fails on its own documentation. Trap 8,
 *  which four guards in this repo have now walked into. */
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.split('//')[0]).join('\n');
const optionsCode = codeOnly(options);
const values = (src: string) => ((src.match(/value: '[^']+'/g) ?? [])
  .map((m) => m.replace("value: '", '').replace(/'$/, '')));
const block = (name: string) => {
  const at = optionsCode.indexOf(`export const ${name}`);
  return at < 0 ? '' : optionsCode.slice(at, optionsCode.indexOf('];', at));
};

/**
 * The picker that can finally say "pregnant".
 *
 * `computeTargets` has carried a full pregnancy path for months — trimester
 * energy, protein +25 g, iron 27 mg, folate 600 mcg, deficits refused — reading
 * a condition string no form could produce. This is the form.
 *
 * Four things are pinned, three of which are mistakes this app has made before:
 *
 * 1. ONE VOCABULARY. The picker's values are the server's keys.
 * 2. NOTHING IS PRESELECTED, and an empty answer is still an answer.
 * 3. A QUALIFIER NEVER OUTLIVES ITS CONDITION. Unticking pregnancy clears the
 *    trimester on this side too, so the box that disappears leaves nothing
 *    behind it.
 * 4. THE HONESTY SENTENCE. Nutrition does not read this list yet, the screen
 *    says so, and this test makes the sentence expensive to delete.
 */
describe('the health-condition picker', () => {
  it('offers exactly the keys the server accepts', () => {
    const apiKeys = ((/export const HEALTH_CONDITIONS = \[([^\]]*)\]/.exec(api)?.[1] ?? '')
      .match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1)).sort();
    expect(values(block('HEALTH_CONDITION_OPTIONS')).sort()).toEqual(apiKeys);
    expect(apiKeys.length).toBe(12);
  });

  it('offers exactly the qualifiers the server accepts', () => {
    const apiTrimesters = ((/export const TRIMESTERS = \[([^\]]*)\]/.exec(api)?.[1] ?? '')
      .match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1)).sort();
    expect(values(block('TRIMESTER_OPTIONS')).sort()).toEqual(apiTrimesters);
    // KIDNEY_STAGES holds three literals and one CONSTANT, so the quoted-string
    // sweep that works for every other list under-counts this one by exactly
    // the value that means "I don't know" — the one it would hurt most to lose.
    const unstated = /export const KIDNEY_STAGE_UNSTATED = '([^']+)'/.exec(api)?.[1] ?? '';
    const apiStages = [
      ...((/export const KIDNEY_STAGES = \[([^\]]*)\]/.exec(api)?.[1] ?? '')
        .match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1)),
      unstated,
    ].sort();
    expect(unstated).toBe('unstated');
    expect(values(block('KIDNEY_STAGE_OPTIONS')).sort()).toEqual(apiStages);
  });

  it('never offers a conclusion drawn from a lab report', () => {
    // A citizen may tick 'anaemia' because a doctor said so. 'anemia' is what
    // the fitness engine calls a haemoglobin reading, and a tick box for it
    // would let somebody turn a lab result on about themselves.
    for (const derived of ['glycemic', 'dyslipidemia', 'inflammation', "'anemia'", 'elderly']) {
      expect(optionsCode).not.toContain(derived);
    }
  });

  it('preselects nothing and keeps an empty answer as an answer', () => {
    expect(master).toMatch(/checked=\{health\.keys\.includes\(o\.value\)\}/);
    // The trimester's blank is NOT ANSWERED; 'unstated' is a separate option
    // meaning answered and declining. Two silences, two options.
    expect(master).toMatch(/<option value="">Not answered<\/option>/);
    expect(optionsCode).toContain("value: 'unstated'");
  });

  it('never lets a qualifier outlive the condition it qualifies', () => {
    // The server clears it too; this is the same rule on the near side, so the
    // control that disappears does not leave a value behind the screen.
    expect(master).toMatch(/trimester: keys\.includes\('pregnancy'\) \? [\s\S]{0,40}: null/);
    expect(master).toMatch(/kidneyStage: keys\.includes\('kidney'\) \? [\s\S]{0,40}: null/);
    // And the follow-up only exists while its box is ticked.
    expect(master).toMatch(/health\.keys\.includes\('pregnancy'\) && \(/);
    expect(master).toMatch(/health\.keys\.includes\('kidney'\) && \(/);
  });

  it('sends the three columns in one request', () => {
    // Three PATCHes would let a refresh land between them and store a trimester
    // with no pregnancy beside it.
    const clientApi = read('features', 'profile', 'api.ts');
    expect(clientApi).toMatch(/updateHealthConditions/);
    expect(master).not.toMatch(/set\('healthConditions'/);
    expect(master).not.toMatch(/commit\('pregnancyTrimester'\)/);
  });

  it('is never required to save the profile', () => {
    expect(master).not.toMatch(/key: 'healthConditions'/);
  });

  it('says out loud that the meal plan does not read it yet', () => {
    // The whole reason this field exists is the pregnancy path in
    // computeTargets. Until the readers converge, saying otherwise on screen
    // would be the "button that reports success and changes nothing" defect,
    // in the one place where being wrong is least recoverable.
    expect(master).toMatch(/your meal plan does not read this list yet/i);
    expect(master).toMatch(/\/nutrition\/preferences/);
  });

  it('is shown back on the health record, where blood group already is', () => {
    // A field that is collected and never shown is the H3 defect, and blood
    // group's own guard says so. This is the reader.
    expect(records).toMatch(/Health conditions/);
    expect(records).toMatch(/declaredSummary/);
    expect(records).toMatch(/Not recorded\./);
    // Read-only: one asker, one owner, and the record is not it.
    expect(records).toMatch(/\/profile\/master#medical/);
  });
});
