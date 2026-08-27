import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE CITY IS 18+, AND THE FORM SAYS SO BEFORE THE SERVER HAS TO ──────────
 *
 * The launch audit found the age rule enforced in exactly one place — inside
 * the dating hub, after the profile row was already visible — while sign-up
 * asked for no date of birth at all and the Terms checkbox was gated only in
 * the browser. The server held no record that anybody had ever claimed to be
 * an adult.
 *
 * The rule now lives at the front door and the server is what enforces it.
 * This file pins the CLIENT half, which has exactly one job: tell somebody
 * before they invest a password, and never disagree with the API about how old
 * they are.
 */
describe('the city is eighteen plus', () => {
  const form = code('features/auth/pages/RegisterForm.tsx');

  it('asks for a date of birth, and will not submit without an adult one', () => {
    expect(form).toMatch(/type="date"/);
    expect(form).toMatch(/autoComplete="bday"/);
    expect(form).toMatch(/const adult = dob !== '' && ageFrom\(dob\) >= 18/);
    // Both gates: the button, and the submit handler — a disabled button is a
    // suggestion, and Enter is not a click.
    expect(form).toMatch(/pwStrong && adult && agreed/);
    expect(form).toMatch(/if \(!adult\)/);
  });

  it('counts age the way the server does, to the day', () => {
    // A form using a 365.25-day divisor while the API counts calendar years
    // refuses an adult on their birthday, or accepts a child for one round
    // trip. Same arithmetic as shared/age.ts, deliberately duplicated because
    // the two cannot share a module.
    expect(form).toMatch(/y = now\.getUTCFullYear\(\) - d\.getUTCFullYear\(\)/);
    expect(form).toMatch(/if \(m < 0 \|\| \(m === 0 && now\.getUTCDate\(\) < d\.getUTCDate\(\)\)\) y -= 1/);
    expect(form).not.toContain('365.25');
    // And the picker cannot offer a date that is too young in the first place.
    expect(form).toMatch(/max=\{eighteenYearsAgo\(\)\}/);
  });

  it('says why it is asking, and what happens to the answer', () => {
    // A date-of-birth box with no explanation on a sign-up form is the kind of
    // thing people abandon a registration over.
    expect(read('features/auth/pages/RegisterForm.tsx'))
      .toMatch(/Together City is for people aged 18 and over/);
    expect(read('features/auth/pages/RegisterForm.tsx'))
      .toMatch(/is not shown to anyone/);
  });

  it('sends it, rather than collecting it and dropping it', () => {
    expect(form).toMatch(/dateOfBirth: dob/);
    expect(code('store/auth.store.ts')).toMatch(/dateOfBirth: contact\.dateOfBirth/);
    expect(code('api/auth.api.ts')).toMatch(/dateOfBirth: z\.string\(\)/);
  });
});
