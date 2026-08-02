import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = readFileSync(join(web, 'features', 'profile', 'pages', 'MasterProfile.tsx'), 'utf8');
const options = readFileSync(join(web, 'features', 'profile', 'relationshipStatus.ts'), 'utf8');
const api = readFileSync(
  join(web, '..', '..', 'together-city-chat', 'src', 'shared', 'relationship-status.ts'), 'utf8',
);
/** Both files explain themselves by naming the vocabularies they are NOT, so an
 *  absence check that reads the comments fails on its own documentation. Trap 8,
 *  and this guard walked into it on its first run. */
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.split('//')[0]).join('\n');
const optionsCode = codeOnly(options);

/**
 * Relationship status: a field the citizen can change, that nothing computes
 * with, and that must not be confused with the two questions it sounds like.
 *
 * E.19 listed it as a `SharedFields` consolidation. It was never one — no
 * column, no field, no form, nothing reading it, exactly as `bloodGroup` turned
 * out. Dating's `relationshipGoal` is what somebody is LOOKING FOR;
 * `Connection.relationship` is a fact about a PAIR. Three questions, and the
 * cheapest way to end up with one field doing two jobs is to let their
 * vocabularies touch.
 */
describe('relationship status on the Master Profile', () => {
  it('offers every value the server accepts, and nothing is preselected', () => {
    for (const s of ['single', 'inRelationship', 'engaged', 'married',
      'separated', 'divorced', 'widowed', 'preferNotToSay']) {
      expect(options).toContain(`'${s}'`);
    }
    expect(master).toMatch(/<option value="">Not recorded<\/option>[\s\S]{0,400}RELATIONSHIP_STATUS_OPTIONS/);
  });

  it('keeps the picker and the server reading one vocabulary', () => {
    const apiValues = ((/RELATIONSHIP_STATUSES = \[([^\]]*)\]/.exec(api)?.[1] ?? '')
      .match(/'[^']+'/g) ?? []).sort();
    const webValues = ((options.match(/value: '[^']+'/g) ?? [])
      .map((m) => m.replace('value: ', ''))).sort();
    expect(webValues).toEqual(apiValues);
    expect(apiValues.length).toBe(8);
  });

  it('never borrows dating\'s goal vocabulary', () => {
    // 'Marriage' is a GOAL. 'married' is a STATUS. One list holding both is the
    // field-doing-two-jobs mistake the gender split exists to undo.
    for (const goal of ['Casual dating', 'Friendship first', 'Still figuring it out']) {
      expect(optionsCode).not.toContain(goal);
    }
  });

  it('is never required to save the profile', () => {
    expect(master).not.toMatch(/key: 'relationshipStatus'/);
  });

  it('says what it is not for', () => {
    expect(master).toMatch(/Nothing in Together City uses it/);
    expect(master).toMatch(/not your dating profile/);
    // And that declining is an answer, unlike a blank.
    expect(master).toMatch(/Prefer not to say" is recorded as your answer/);
  });
});
