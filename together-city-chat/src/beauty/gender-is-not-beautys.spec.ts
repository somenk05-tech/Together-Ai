import { readFileSync } from 'fs';
import { join } from 'path';
import { beautyGender, genderIdentityFromBeauty } from '../profile/sex-and-gender';

/**
 * Beauty may READ the citizen's gender. It may not write it.
 *
 * Owner decision, 1 Aug: gender is decided once, at the Master Profile, and no
 * hub asks again. That is the §3 "never ask twice" rule — but here it was also
 * a live data-loss bug, which is why this is a spec and not a comment.
 *
 * THE FAILURE IT PINS. Beauty's select is Female | Male | Other, so
 * beautyGender() flattens nonBinary to 'Other'. The save ran that label back
 * through genderIdentityFromBeauty() → 'other', and syncShared() overwrites any
 * field it is handed. So a non-binary citizen who changed their SKIN TYPE had
 * `nonBinary` silently rewritten to `other` in the canonical row — a protected
 * attribute destroyed by an unrelated save, with nothing shown.
 *
 * WHY THIS READS THE SOURCE rather than calling saveProfile(). Importing
 * BeautyService pulls in medical.service → image-normalize → sharp, and the
 * rule being guarded is structural anyway: this call site must not carry that
 * field. The first half of the spec proves the flattening behaviourally, which
 * is the part that explains why the structural rule exists.
 */

describe('the flattening that made this necessary', () => {
  it('is real, and does not round-trip', () => {
    const shown = beautyGender({ genderIdentity: 'nonBinary' });
    expect(shown).toBe('Other');
    expect(genderIdentityFromBeauty(shown)).toBe('other');
    expect(genderIdentityFromBeauty(shown)).not.toBe('nonBinary');
  });

  it('is lossless for the two values the select can actually hold', () => {
    // Which is exactly why it went unnoticed: every value the form offers
    // survives, and the one it cannot offer is the one that gets destroyed.
    for (const id of ['male', 'female'] as const) {
      expect(genderIdentityFromBeauty(beautyGender({ genderIdentity: id })!)).toBe(id);
    }
  });
});

describe("Beauty's sync to the Master Profile", () => {
  const src = readFileSync(join(__dirname, 'beauty.service.ts'), 'utf8');

  /** The syncShared(...) call in beauty.service.ts, comments removed. */
  const syncCall = (() => {
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
    const at = code.indexOf('this.masterProfile.syncShared(');
    expect(at).toBeGreaterThan(-1);          // the call still exists to be checked
    return code.slice(at, code.indexOf("}, 'beauty')", at));
  })();

  it('does not send gender in any of its spellings', () => {
    expect(syncCall).not.toMatch(/genderIdentity/);
    expect(syncCall).not.toMatch(/\bgender\b/);
    expect(syncCall).not.toMatch(/genderIdentityFromBeauty/);
  });

  it('still sends what Beauty legitimately owns', () => {
    // Not a ban on syncing — a ban on syncing this one field.
    for (const field of ['heightCm', 'weightKg', 'city', 'occupation']) {
      expect(syncCall).toContain(field);
    }
  });

  it('would catch the old line coming back', () => {
    const oldLine = 'genderIdentity: genderIdentityFromBeauty(pp.gender), heightCm: pp.heightCm';
    expect(/genderIdentity/.test(oldLine)).toBe(true);   // the pattern is the right one
    expect(src).not.toContain(oldLine);                  // and it is gone
  });
});
