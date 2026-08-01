import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(web, '..', '..', 'together-city-chat', 'src');

/**
 * Beauty offers three genders, and both packages agree which three.
 *
 * Owner decision, 1 Aug: the Beauty hub's options stay `Female | Male | Other`.
 * Non-binary flattens to "Other". That is a settled product call, not an
 * oversight — nothing in beauty-analysis or beauty-engine branches on the
 * value, and widening the select would be a product change.
 *
 * What makes it worth a guard is that the decision is written down in TWO
 * places that no compiler connects: BEAUTY_GENDER in the API, which is what
 * beautyGender() maps a citizen's real answer onto before the form ever sees
 * it, and the <option> list in the form itself. Widen one and not the other and
 * a native <select> given a value with no matching option renders BLANK — so a
 * citizen who already answered is asked again, which is the §15.1 failure this
 * mapping exists to prevent. It fails silently, on one hub, for the people
 * least likely to be in anyone's test data.
 *
 * The flattening is also disclosed rather than hidden. A locked field showing
 * "Other" under a note saying it came from your Master Profile, when your
 * Master Profile says non-binary, is a screen asserting something you did not
 * say. So the form must carry the line that names what it is standing in for.
 */
describe('the Beauty hub offers three genders and says so consistently', () => {
  const sexAndGender = readFileSync(join(api, 'profile', 'sex-and-gender.ts'), 'utf8');
  const form = readFileSync(join(web, 'features', 'beauty', 'pages', 'Profile.tsx'), 'utf8');

  /** The literal list the API maps every citizen's answer down onto. */
  const declared = (() => {
    const m = sexAndGender.match(/export const BEAUTY_GENDER = \[([^\]]+)\]/);
    expect(m, 'BEAUTY_GENDER is gone from sex-and-gender.ts').toBeTruthy();
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  })();

  /** The options the form actually renders, minus the "Gender" placeholder. */
  const offered = (() => {
    const select = form.slice(form.indexOf('aria-label="Gender"'));
    const block = select.slice(0, select.indexOf('</select>'));
    return [...block.matchAll(/<option(?: value="([^"]*)")?>([^<]+)<\/option>/g)]
      .filter(([, value]) => value !== '')
      .map(([, , text]) => text);
  })();

  it('is the same three words on both sides', () => {
    expect(declared).toEqual(['Female', 'Male', 'Other']);
    expect(offered).toEqual(declared);
  });

  it('is reading the real lists, and would notice a fourth', () => {
    expect(offered.length).toBe(3);
    const widened = '<option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option><option>Non-binary</option>';
    const parsed = [...widened.matchAll(/<option(?: value="([^"]*)")?>([^<]+)<\/option>/g)]
      .filter(([, value]) => value !== '').map(([, , t]) => t);
    expect(parsed).not.toEqual(declared);
  });

  it('maps everything else onto a word it can actually render', () => {
    // beautyGender()'s whole job. If it ever returns something outside the
    // list, the field opens blank.
    // The signature spans lines and closes with "}): BeautyGender", so the
    // body ends at the first brace that is alone on its line.
    const fn = sexAndGender.slice(sexAndGender.indexOf('export function beautyGender'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const returned = [...body.matchAll(/return '([^']+)'/g)].map((m) => m[1]);
    expect(returned.length).toBeGreaterThan(0);
    for (const r of returned) expect(declared).toContain(r);
  });

  it('tells the citizen when their answer had to be flattened', () => {
    // Not a copy check — a check that the disclosure exists at all. Silence
    // here is the screen claiming they picked "Other".
    expect(form).toMatch(/masterGender === 'nonBinary'/);
    expect(form).toMatch(/genderShownAs && \(/);
    expect(form).toMatch(/Your Master\s*\n?\s*Profile still says \{genderShownAs\}/);
  });
});
