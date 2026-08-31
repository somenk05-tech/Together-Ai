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

  /**
   * LANGUAGES (11) HAD NOWHERE TO BE TYPED.
   *
   * The column exists, the passport prints it as field 11, and the server
   * counts it as one of the seven things `percent` is computed from — so a
   * citizen who filled in every box the app offered was held below 100% by a
   * field with no box, and their document carried a line that could never be
   * filled. Found by merging the two profile pages: once the ruled line and
   * the form sat on one screen, the missing box was obvious.
   */
  it('gives languages a box, since the passport prints it and the score counts it', () => {
    expect(master).toMatch(/textField\('languages'/);
    const scored = readFileSync(
      join(web, '..', '..', 'together-city-chat', 'src', 'profile', 'master-profile.service.ts'), 'utf8',
    );
    expect(scored).toMatch(/has\(m\.languages\)/);
  });

  it('says what it is not for', () => {
    /* RE-PINNED TO THE COPY AUDIT'S WORDS (708dc01 rewrote the blurb to
       "Optional — nothing else in the city reads it, including dating." and
       this pin was still holding the old sentence). Re-pinned again on
       31 Aug: the hub a citizen sees is called Matchmaking now, so the
       sentence says "including matchmaking". The three promises are
       unchanged — nothing reads it, the matchmaking hub especially, and
       declining stays a real answer (the option itself is the pin now that
       the long sentence about it went). */
    expect(master).toMatch(/nothing else in the city reads it/);
    expect(master).toMatch(/including matchmaking/);
    // And that declining is an answer, unlike a blank.
    expect(master).toMatch(/Prefer not to say/);
  });
});

/**
 * ONE DATE OF BIRTH, HELD IN ONE PLACE (owner, 28 Aug).
 *
 * Dating, Beauty, Fitness and Nutrition all lock their age/DOB box to the
 * Master Profile. Astrology — the one hub where a birth date is the whole
 * input — kept its own, so the sky could be read for a day the passport did
 * not agree with. The lock is the same lock the other four use.
 */
describe('astrology reads its birth date from the record', () => {
  const astro = readFileSync(
    join(web, 'features', 'astrology', 'pages', 'AstroProfilePage.tsx'), 'utf8',
  );

  it('locks the box when the record has a date', () => {
    expect(astro).toMatch(/const dobLocked = Boolean\(masterDob\)/);
    expect(astro).toMatch(/disabled=\{dobLocked\}/);
    expect(astro).toMatch(/<MasterLockedNote label="Date of birth" \/>/);
  });

  it('takes the record\'s date even when it arrives after the form', () => {
    // Two requests, no guaranteed order. Without this the box can draw empty
    // and stay empty while the record sits in the cache beside it.
    expect(astro).toMatch(/if \(masterDob\) setBirthDate\(masterDob\)/);
  });

  it('still owns the time and place of birth', () => {
    // The record has no birth-time column, and this form is the one that needs
    // it to the minute — an hour is a sign and a half of ascendant.
    expect(astro).toMatch(/setBirthTime\(e\.target\.value\)/);
    expect(astro).toMatch(/setBirthCity\(/);
  });
});
