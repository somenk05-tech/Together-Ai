import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEALTH_CONDITIONS, KIDNEY_STAGES, TRIMESTERS,
  healthConditionFrom, healthConditionLabel, healthConditionsFrom,
  kidneyStageFrom, kidneyStageLabel, trimesterFrom, trimesterLabel,
  unrecognisedConditions,
} from './health-conditions';
import { DECLARED_CONDITIONS } from '../fitness/dto/fitness.dto';
import { activeMntRules } from '../nutrition/clinical-mnt';

/**
 * B.13 — one vocabulary for a question five readers ask.
 *
 * The point of these tests is not that a map maps. It is that no answer a
 * citizen has already given is dropped by the crossing, that a lab conclusion
 * never becomes something they said, and that the clinical rules fire on the
 * new keys exactly as they fire on the old strings — so the readers can be
 * moved over later without anybody's plan changing underneath them.
 */

/** Files are read as CODE. A guard that reads its own documentation never goes
 *  green, and this repo has paid for that three times in one day (trap 8). */
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const WEB = join(__dirname, '..', '..', '..', 'together-city-react', 'src');

describe('the health-condition vocabulary', () => {
  it('gives every condition a label, and every label is not the key', () => {
    for (const key of HEALTH_CONDITIONS) {
      const label = healthConditionLabel(key);
      expect(label).toBeTruthy();
      expect(label).not.toBe(key);
    }
  });

  it('takes back everything it hands out', () => {
    for (const key of HEALTH_CONDITIONS) expect(healthConditionFrom(key)).toBe(key);
  });

  it('keeps every chip the Nutrition form has ever stored', () => {
    // These five are the ONLY strings that can be in the column: the form has
    // chips and no free-text input. If this list stops matching the page, the
    // drift guard below fails first.
    for (const chip of ['Diabetes', 'Hypertension', 'PCOS', 'Kidney Disease', 'Fatty Liver']) {
      expect(healthConditionFrom(chip)).toBeDefined();
    }
    expect(healthConditionFrom('Kidney Disease')).toBe('kidney');
    expect(healthConditionFrom('Fatty Liver')).toBe('fattyLiver');
  });

  it('keeps every condition the Fitness form has ever stored', () => {
    for (const key of DECLARED_CONDITIONS) expect(healthConditionFrom(key)).toBeDefined();
  });

  it('reads the Nutrition page for its chips, so a new one cannot arrive unmapped', () => {
    const page = codeOnly(readFileSync(
      join(WEB, 'features', 'nutrition', 'pages', 'Preferences.tsx'), 'utf8',
    ));
    const listed = /const CONDITIONS = \[([^\]]*)\]/.exec(page)?.[1] ?? '';
    const chips = (listed.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(healthConditionFrom(chip)).toBeDefined();
  });

  it('folds spacing, case and punctuation into one lookup', () => {
    for (const spelling of ['Kidney Disease', 'kidney-disease', 'KidneyDisease', 'CKD', 'ckd', 'renal']) {
      expect(healthConditionFrom(spelling)).toBe('kidney');
    }
    expect(healthConditionFrom('  Fatty  Liver ')).toBe('fattyLiver');
  });

  it('never guesses', () => {
    for (const nonsense of ['', '   ', 'asthma', 'migraine', 'no diabetes', 'diabetes?', 'x']) {
      expect(healthConditionFrom(nonsense)).toBeUndefined();
    }
    expect(healthConditionFrom(null)).toBeUndefined();
    expect(healthConditionFrom(undefined)).toBeUndefined();
  });

  it('does not turn a lab conclusion into something the citizen said', () => {
    // Fitness's engine and Medical's triggeredConditions speak these as
    // findings drawn FROM blood. Declaring is a different act from testing.
    for (const derived of ['glycemic', 'inflammation']) {
      expect(healthConditionFrom(derived)).toBeUndefined();
    }
  });

  it('leaves Beauty its skin descriptors', () => {
    for (const skin of ['hormonal acne', 'seborrheic']) {
      expect(healthConditionFrom(skin)).toBeUndefined();
    }
    // But the two Beauty genuinely shares DO cross, because they are
    // conditions and not descriptions.
    expect(healthConditionFrom('thyroid')).toBe('thyroid');
    expect(healthConditionFrom('pcos')).toBe('pcos');
  });

  it('has no key for the age-derived rule', () => {
    expect(HEALTH_CONDITIONS).not.toContain('elderly');
    expect(healthConditionFrom('elderly')).toBeUndefined();
  });
});

describe('a stored list becoming keys', () => {
  it('deduplicates spellings of one answer and orders them canonically', () => {
    expect(healthConditionsFrom(['CKD', 'Kidney Disease', 'Diabetes'])).toEqual(['diabetes', 'kidney']);
  });

  it('is stable: the same ticks give byte-identical lists in any order', () => {
    const a = healthConditionsFrom(['PCOS', 'Diabetes', 'Fatty Liver']);
    const b = healthConditionsFrom(['Fatty Liver', 'PCOS', 'Diabetes']);
    expect(a).toEqual(b);
  });

  it('drops what it does not know, and can say what it dropped', () => {
    const stored = ['Diabetes', 'Asthma', '', 'Migraine'];
    expect(healthConditionsFrom(stored)).toEqual(['diabetes']);
    expect(unrecognisedConditions(stored)).toEqual(['Asthma', 'Migraine']);
  });

  it('treats an empty list as an answer, not as a hole', () => {
    expect(healthConditionsFrom([])).toEqual([]);
    expect(healthConditionsFrom(null)).toEqual([]);
  });
});

describe('the two qualifiers', () => {
  it('offers a trimester, and not knowing is one of the answers', () => {
    for (const t of TRIMESTERS) expect(trimesterFrom(t)).toBe(t);
    expect(TRIMESTERS).toContain('unstated');
    expect(trimesterFrom('2')).toBe('second');
    expect(trimesterFrom('Third Trimester')).toBe('third');
    expect(trimesterFrom('fourth')).toBeUndefined();
    for (const t of TRIMESTERS) expect(trimesterLabel(t)).not.toBe(t);
  });

  it('offers a kidney stage, and not knowing is one of the answers', () => {
    for (const s of KIDNEY_STAGES) expect(kidneyStageFrom(s)).toBe(s);
    expect(KIDNEY_STAGES).toContain('unstated');
    expect(kidneyStageFrom('stage 3')).toBe('late');
    expect(kidneyStageFrom('On dialysis')).toBe('dialysis');
    expect(kidneyStageFrom('stage 9')).toBeUndefined();
    for (const s of KIDNEY_STAGES) expect(kidneyStageLabel(s)).not.toBe(s);
  });
});

/**
 * The golden table. Today the clinical rules read free text; tomorrow they read
 * keys. These assertions pin what fires NOW, from the labels the citizen sees,
 * so the move cannot quietly change somebody's protein ceiling.
 */
describe('what the clinical rules do with these conditions today', () => {
  const rulesFor = (conditions: string[]) =>
    activeMntRules({ conditions, flags: {} }).map((r) => r.key).sort();

  it.each([
    ['diabetes', ['diabetes']],
    ['hypertension', ['hypertension']],
    ['highCholesterol', ['dyslipidemia']],
    ['kidney', ['ckdEarly']],
    ['fattyLiver', ['fattyLiver']],
    ['gout', ['gout']],
  ] as const)('%s reaches %s', (key, expected) => {
    expect(rulesFor([healthConditionLabel(key)])).toEqual([...expected].sort());
  });

  it('names the four that reach no clinical rule at all', () => {
    // Not a defect to fix here — a fact to know before anybody assumes a tick
    // changes a meal plan. PCOS reaches an ingredient avoid-list and nothing
    // else; thyroid, anaemia and joint sensitivity are read by Beauty and
    // Fitness, not by the meal engine.
    for (const key of ['pcos', 'thyroid', 'anaemia', 'jointPain'] as const) {
      expect(rulesFor([healthConditionLabel(key)])).toEqual([]);
    }
  });

  it('an unstated kidney stage lands where unstaged text lands today', () => {
    expect(rulesFor(['Kidney disease'])).toEqual(['ckdEarly']);
    expect(rulesFor(['kidney disease, stage 4'])).toEqual(['ckdLate']);
    expect(rulesFor(['kidney disease, on dialysis'])).toEqual(['dialysis']);
  });
});
