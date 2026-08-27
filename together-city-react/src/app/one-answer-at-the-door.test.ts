import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Block comments only at line-head or inside a JSX brace: a comment opener
 *  inside an attribute value must not swallow the rest of the file. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * The browser half of "gender is asked once, at the door" (owner, 27 Aug).
 * The server refuses a registration without it; this file is about the form
 * being honest before somebody has invested a password in it, and about the
 * two vocabularies not forking in the one place a hurried edit would fork them.
 */
describe('the sign-up form asks gender once', () => {
  const form = code('features/auth/pages/RegisterForm.tsx');
  const api = code('api/auth.api.ts');

  it('asks, and will not submit until it is answered', () => {
    expect(form).toMatch(/id="reg-gender"/);
    expect(form).toMatch(/canSubmit\s*=[^;]*gender !== ''/);
  });

  it('offers the identity vocabulary, not the dating one', () => {
    // 'nonBinary', capital B. The dating engine's comparisons are exact and
    // datingGender() is the only place the two spellings meet.
    expect(form).toMatch(/value: 'nonBinary'/);
    expect(form).not.toMatch(/value: 'nonbinary'/);
    for (const v of ["'male'", "'female'", "'other'"]) expect(form).toContain(v);
  });

  it('validates the same four values on the way out', () => {
    expect(api).toMatch(/gender: z\.enum\(\['male', 'female', 'nonBinary', 'other'\]\)/);
  });

  it('sends the free text only with "other"', () => {
    expect(form).toMatch(/gender === 'other' \? genderOther\.trim\(\) : undefined/);
  });

  it('tells the truth about what happens to the answer', () => {
    // Asked once is not locked. The copy says so, because a form that implies
    // permanence when the field is editable is a form that loses people.
    expect(form).toMatch(/change it any\s+time on your profile/);
  });

  it('does not ask the clinical question here', () => {
    expect(form).not.toMatch(/sexAtBirth|Sex at birth/);
  });
});
