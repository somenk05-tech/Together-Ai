import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM_FIELDS, profilePayload, saveFailureMessage } from '@/features/beauty/profile-payload';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The Beauty profile form saves its answers and nothing else.
 *
 * THE BUG THIS PINS (3 Sep). The form was seeded from the whole saved blob,
 * which after a photo analysis carries `aiEstimated: { skinType: true }` — the
 * label on the model's guesses. Save echoed that object back; the server's
 * schema knew only primitives and string lists; every save after an analysis
 * was a 400, and the page showed nothing. Edit, Save, reload: the old answers.
 *
 * Two guards. The payload is built from a named list of the form's own
 * fields, so nothing that rode in on the seed can ride out. And that list is
 * checked against the `Form` interface in the page, so a question added to
 * the form cannot be silently dropped from the save.
 */

describe('what Save sends', () => {
  it('drops the estimate flags, and anything else that is not an answer', () => {
    const out = profilePayload({ skinType: 'Oily', skinGoals: ['Glow'], aiEstimated: { skinType: true }, photos: [] });
    expect(out).toEqual({ skinType: 'Oily', skinGoals: ['Glow'] });
  });

  it('leaves unanswered questions out rather than sending undefined', () => {
    expect(Object.keys(profilePayload({ gender: undefined, city: 'Pune' }))).toEqual(['city']);
  });

  it('names every field the form holds, and no other', () => {
    const src = readFileSync(join(web, 'features', 'beauty', 'pages', 'Profile.tsx'), 'utf8');
    const body = src.slice(src.indexOf('interface Form {'), src.indexOf('}', src.indexOf('interface Form {')));
    const declared = [...body.matchAll(/(\w+)\??:/g)].map((m) => m[1]).filter((k) => k !== 'Form');
    expect([...FORM_FIELDS].sort()).toEqual([...new Set(declared)].sort());
  });
});

describe('the Save button', () => {
  it('is never locked behind the unanswered questions', () => {
    // Owner, 3 Sep: "all save profile buttons should collapse the form and
    // save the form once clicked". A partial profile is saved as it stands;
    // the count beside the button says what is left.
    const src = readFileSync(join(web, 'features', 'beauty', 'pages', 'Profile.tsx'), 'utf8');
    expect(src).not.toMatch(/disabled=\{save\.isPending \|\| !profileComplete\}/);
    expect(src).toMatch(/disabled=\{save\.isPending\} onClick=\{\(\) => save\.mutate\(profilePayload/);
  });
});

describe('when Save fails', () => {
  it('shows the server sentence, and a plain one when there is none', () => {
    expect(saveFailureMessage({ response: { data: { message: 'too many fields' } } })).toMatch(/wasn't saved — too many fields/);
    expect(saveFailureMessage({ response: { data: { message: ['first', 'second'] } } })).toMatch(/— first$/);
    expect(saveFailureMessage(new Error('Network Error'))).toMatch(/check your connection/);
  });

  it('is rendered on the page, not swallowed', () => {
    const src = readFileSync(join(web, 'features', 'beauty', 'pages', 'Profile.tsx'), 'utf8');
    expect(src).toMatch(/save\.isError && \(/);
    expect(src).toMatch(/saveFailureMessage\(save\.error\)/);
  });
});
