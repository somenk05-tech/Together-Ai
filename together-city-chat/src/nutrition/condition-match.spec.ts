import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONDITION_KEYS, conditionKeys, conditionMatcher, hasCondition, type ConditionKey,
} from './condition-match';
import { activeMntRules } from './clinical-mnt';

/**
 * One matcher, and the ratchet that keeps it one.
 *
 * The first half pins the strings that used to disagree — every one of them
 * taken from this hub's own fixtures, not invented for the test. The second
 * half is the part that lasts: a scan of the hub for a TENTH bespoke condition
 * regex, with an allowlist naming the ones that are allowed to stay and why.
 */
describe('the strings that used to get different answers', () => {
  const cases: Array<[string, ConditionKey]> = [
    ['dialysis', 'kidney'],
    ['Kidney failure on dialysis', 'kidney'],
    ['CKD', 'kidney'],
    ['kidney disease stage 3', 'kidney'],
    ['nephropathy', 'kidney'],
    ['renal disease', 'kidney'],
    ['diabetes', 'diabetes'],
    ['Diabetic', 'diabetes'],
    ['prediabetes', 'diabetes'],
    ['t2diabetes', 'diabetes'],
    ['highchol', 'dyslipidemia'],
    ['high cholesterol', 'dyslipidemia'],
    ['raised triglycerides', 'dyslipidemia'],
    ['fattyliver', 'fattyLiver'],
    ['fatty liver', 'fattyLiver'],
    ['NAFLD', 'fattyLiver'],
    ['hypertension', 'hypertension'],
    ['high blood pressure', 'hypertension'],
    ['gout', 'gout'],
    ['high uric acid', 'gout'],
  ];

  it.each(cases)('reads %s as %s', (text, key) => {
    expect(hasCondition([text], key)).toBe(true);
  });

  it('gives the clinical rules the ones they were missing', () => {
    // The three that fired NO rule before. Each is in the hub's fixtures.
    for (const text of ['dialysis', 'fattyliver', 'highchol']) {
      expect(activeMntRules({ conditions: [text], flags: {} }).length).toBeGreaterThan(0);
    }
    // 'dialysis' alone must reach the dialysis rule, not merely some kidney rule.
    expect(activeMntRules({ conditions: ['dialysis'], flags: {} }).map((r) => r.key))
      .toContain('dialysis');
  });

  it('gives the diet plan the same answer as the ceilings', () => {
    // assignDietPlans asked has('kidney') ALONE — the narrowest matcher in the
    // hub — so 'CKD stage 4' got the ceilings and no renal PLAN. It now shares
    // this matcher, and these are the three strings that used to slip past it.
    for (const text of ['CKD stage 4', 'renal disease', 'dialysis']) {
      expect(conditionMatcher([text])('kidney')).toBe(true);
    }
  });

  it('keeps the staging a sub-question, not a condition', () => {
    // has('dialysis') and has('stage 3') must stay literal, or every kidney
    // citizen resolves as dialysis and gets the strictest protein ceiling.
    const has = conditionMatcher(['kidney disease stage 3']);
    expect(has('kidney')).toBe(true);
    expect(has('dialysis')).toBe(false);
    expect(has('stage 3')).toBe(true);
  });

  it('never guesses', () => {
    expect(conditionKeys([])).toEqual([]);
    expect(conditionKeys(null)).toEqual([]);
    expect(conditionKeys(['healthy', 'vegetarian', 'maintain'])).toEqual([]);
    // Short keys carry word boundaries: 'nash' is inside Nashik, and a city is
    // not a liver condition.
    expect(hasCondition(['Nashik'], 'fattyLiver')).toBe(false);
    expect(hasCondition(['blackduck'], 'kidney')).toBe(false);
  });

  it('returns keys in one order, whatever order they were said in', () => {
    const a = conditionKeys(['diabetes', 'CKD']);
    const b = conditionKeys(['CKD', 'diabetes']);
    expect(a).toEqual(b);
    expect(a).toEqual(['kidney', 'diabetes']);
    expect(CONDITION_KEYS.indexOf('kidney')).toBeLessThan(CONDITION_KEYS.indexOf('diabetes'));
  });
});

/**
 * THE CEILING. Nine matchers became one; this is what stops it becoming two.
 *
 * A count, not a list, and the same shape as lint-ceiling, a11y-ceiling,
 * dead-export-ceiling and swallow-ceiling: it fails when the number goes UP,
 * and it fails when the number goes DOWN without the file being lowered,
 * because a ceiling nobody ratchets is just a high number that drifts back up
 * to meet it.
 *
 * What is still counted, and why it is not zero: display labels ("Renal
 * Friendly"), the isClinical test, the supplement cautions and the medical
 * exclude list all still pattern-match condition words. Converting them is
 * mechanical and belongs in its own commit — they decide what a screen SAYS,
 * not what a citizen is fed, and this commit is about the ones that set caps.
 * meal-engine's fasting check is exempt for a different reason: it matches
 * MEDICATIONS (insulin, metformin), which is a different question with a
 * different answer for the same person.
 */
describe('no second matcher', () => {
  const EXEMPT = new Set(['condition-match.ts', 'meal-engine.ts']);
  const WORDS = 'kidney|renal|\\bckd\\b|nephro|dialys|diab|hypertens|blood pressure'
    + '|cholesterol|lipid|triglycer|fatty ?liver|nafld|masld|nash|gout|uric|pcos|thyroid';

  const findings = (): string[] => {
    const here = __dirname;
    const out: string[] = [];
    for (const f of readdirSync(here).filter((n) => /\.ts$/.test(n) && !/\.spec\.ts$/.test(n))) {
      if (EXEMPT.has(f)) continue;
      const src = readFileSync(join(here, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
      const re = new RegExp(`(/[^\\n/]*(${WORDS})[^\\n/]*/[gimsuy]*)`
        + `|((?:includes|startsWith|endsWith)\\(\\s*['"\`][^'"\`]*(${WORDS}))`, 'gi');
      for (const m of src.matchAll(re)) out.push(`${f}: ${m[0].trim()}`);
    }
    return out.sort();
  };

  it('holds the number of bespoke condition tests at its ceiling', () => {
    const ceiling = JSON.parse(
      readFileSync(join(__dirname, 'condition-matcher-ceiling.json'), 'utf8'),
    ) as { total: number };
    const found = findings();
    if (found.length !== ceiling.total) {
      // eslint-disable-next-line no-console
      console.log(`\nbespoke condition tests (${found.length}, ceiling ${ceiling.total}):\n`
        + found.map((f) => `  ${f}`).join('\n') + '\n');
    }
    expect(found.length).toBe(ceiling.total);
  });

  it('is not one of them itself', () => {
    // The point of the exemption is that this file IS the matcher. If it ever
    // stops being imported by the files it was written for, the exemption is
    // hiding a tenth matcher rather than excusing the first.
    for (const f of ['clinical-mnt.ts', 'diet-plans.ts', 'medical-recs.ts', 'nutrition.service.ts']) {
      expect(readFileSync(join(__dirname, f), 'utf8')).toContain("from './condition-match'");
    }
  });
});
