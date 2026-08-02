import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = readFileSync(join(web, 'features', 'profile', 'pages', 'MasterProfile.tsx'), 'utf8');
const records = readFileSync(join(web, 'features', 'medical', 'pages', 'Records.tsx'), 'utf8');
const validation = readFileSync(join(web, 'features', 'profile', 'pages', 'MasterProfile.tsx'), 'utf8');

/**
 * Blood group is asked once, is genuinely optional, and admits which kind of
 * silence it is holding.
 *
 * Three things are pinned, and each of them is a mistake this app has already
 * made somewhere else:
 *
 * 1. NOTHING IS PRESELECTED. The blank option is first and carries no value.
 *    A preselected gender is p1/FE-15.1 — a value nobody chose, recorded as
 *    though they had — and a preselected blood group is that about their body.
 * 2. TWO SILENCES STAY TWO. "Not recorded" and "I don't know" are separate
 *    options and separate sentences on the record. Collapsing "we don't know"
 *    into "you have nothing" is the defect the 1 Aug sweep removed from 281
 *    surfaces; it is not being reintroduced in a new field.
 * 3. IT HAS A READER. A field that is collected and never shown is the H3
 *    defect. The health record is where a blood group belongs, and it is the
 *    only place that shows it.
 */
describe('the blood group field', () => {
  it('offers the eight groups and nothing is preselected', () => {
    for (const g of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
      expect(master).toContain(`'${g}'`);
    }
    expect(master).toMatch(/<option value="">Not recorded<\/option>/);
  });

  it('keeps "I don’t know" as its own answer, separate from blank', () => {
    expect(master).toMatch(/<option value="unknown">I don’t know<\/option>/);
  });

  it('is never required to save the profile', () => {
    // The form's validation list is what blocks a save. A skippable field that
    // turns up there is not skippable.
    expect(validation).not.toMatch(/key: 'bloodGroup'/);
  });

  it('says what it is for, and what it is not for', () => {
    expect(master).toMatch(/Optional — skip it/);
    expect(master).toMatch(/nothing in Together City uses it to make/i);
  });

  it('is shown back on the health record, in three different sentences', () => {
    expect(records).toMatch(/Blood group/);
    expect(records).toMatch(/You told us you don’t know it/);
    expect(records).toMatch(/Not recorded\./);
    // And the record does not offer to edit it in place: one asker, one owner.
    expect(records).toMatch(/\/profile\/master#medical/);
  });
});
