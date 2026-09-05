import * as fs from 'fs';
import * as path from 'path';
import { MedicalService, CONSENT_HUBS, DEFAULT_HUB_ACCESS } from './medical.service';

/**
 * ── A DEFAULT IS NOT A CONSENT ──
 *
 * `consents()` used to CREATE a `granted: true` row for every hub the first
 * time anything read the list. Nobody was asked. The product's standing
 * behaviour — same-app hubs read biomarkers until revoked — is unchanged by
 * this file and is not what was wrong.
 *
 * What was wrong is that the record could not tell the two apart. Every row in
 * `MedicalConsent` said the same thing whether the citizen moved the switch or
 * had never opened the page, on a table whose entire purpose is to answer
 * "did they agree to this" about blood-test results. A consent record that
 * cannot distinguish a consent from a default is a decoration.
 *
 * So: reading writes nothing, absence stays absent, and `answered` carries the
 * difference to whatever screen is asking.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(rows: Array<{ hub: string; granted: boolean }> = []) {
  const writes: unknown[] = [];
  const s: any = Object.create(MedicalService.prototype);
  s.prisma = {
    medicalConsent: {
      findMany: async () => rows.map((r) => ({ ...r, updatedAt: new Date('2026-08-01T00:00:00Z') })),
      findUnique: async ({ where }: any) => rows.find((r) => r.hub === where.userId_hub.hub) ?? null,
      create: async (a: unknown) => { writes.push(a); return { granted: true, updatedAt: new Date() }; },
      upsert: async (a: unknown) => { writes.push(a); return {}; },
    },
    medicalBloodTest: { findFirst: async () => null },
  };
  return { s, writes };
}

describe('reading the consent list', () => {
  it('writes nothing', async () => {
    const { s, writes } = build();
    await s.consents('u1');
    expect(writes).toEqual([]);
  });

  it('answers for every hub, and says none of them were asked', async () => {
    const { s } = build();
    const out = await s.consents('u1');
    expect(out.map((c: any) => c.hub)).toEqual(CONSENT_HUBS.map((h) => h.hub));
    for (const c of out) {
      expect(c.answered).toBe(false);
      expect(c.granted).toBe(DEFAULT_HUB_ACCESS);
      expect(c.updatedAt).toBeNull();
    }
  });

  it('marks the one the citizen actually answered, and keeps their answer', async () => {
    const { s } = build([{ hub: 'nutrition', granted: false }]);
    const out = await s.consents('u1');
    const nutrition = out.find((c: any) => c.hub === 'nutrition');
    const beauty = out.find((c: any) => c.hub === 'beauty');
    expect(nutrition).toMatchObject({ answered: true, granted: false });
    expect(beauty).toMatchObject({ answered: false, granted: DEFAULT_HUB_ACCESS });
    expect(nutrition.updatedAt).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('the gate other hubs call', () => {
  it('refuses a hub the citizen switched off', async () => {
    const { s } = build([{ hub: 'nutrition', granted: false }]);
    await expect(s.sharedBiomarkers('u1', 'nutrition')).rejects.toThrow(/does not have consent/);
  });

  it('allows one they switched on', async () => {
    const { s } = build([{ hub: 'nutrition', granted: true }]);
    await expect(s.sharedBiomarkers('u1', 'nutrition')).resolves.toMatchObject({ hub: 'nutrition' });
  });

  /**
   * The default lives in ONE constant, read here and by `consents()` and by
   * nutrition's `bloodValues`. A default written in three places is a default
   * that disagrees with itself the day somebody changes one of them — and
   * flipping this one constant is the whole of switching the product to
   * ask-first.
   */
  it('and an unanswered hub gets the default, from the constant', async () => {
    const { s } = build();
    const call = s.sharedBiomarkers('u1', 'nutrition');
    if (DEFAULT_HUB_ACCESS) await expect(call).resolves.toMatchObject({ hub: 'nutrition' });
    else await expect(call).rejects.toThrow(/does not have consent/);
  });
});

/**
 * And the screen. Being told about a default is the half of this that the
 * citizen can actually see: the card drew the switch already on under the words
 * "When on, your recipes and meal plans are designed around your latest blood
 * panel" — which reads as a description of a choice they made.
 */
describe('the screen says which it is', () => {
  const blood = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'pages', 'Blood.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');

  it('reads `answered` rather than assuming the switch was chosen', () => {
    expect(blood).toMatch(/!nutrition\.answered/);
  });

  it('tells somebody who has never been asked that nothing is read until they say so (4 Sep)', () => {
    expect(blood).toMatch(/off until you turn it on/);
    expect(blood).toMatch(/nothing is read from your panel before you say so/);
    expect(blood).not.toMatch(/on unless you turn it off/);
  });

  /**
   * ASK-FIRST IS THE CONSTANT (launch gate, third reading, 4 Sep). The
   * privacy policy promises explicit consent before health data is processed
   * or shared across hubs; a default of `true` was the policy's opposite.
   */
  it('the default is no: an unanswered hub reads nothing', () => {
    expect(DEFAULT_HUB_ACCESS).toBe(false);
  });
});

/**
 * ── AND IT IS ASKED, AT THE DOOR THE DATA COMES THROUGH (owner, 28 Aug) ──
 *
 * The owner kept the default and asked for the question to be put. Not at
 * sign-up: there is no panel then, and agreeing to share markers you do not
 * have is a click rather than a decision. The moment a report is on file the
 * question is concrete, so the ask lives on Blood Test Analysis.
 *
 * The trap this guards is the one every "we'll ask later" banner falls into —
 * a dismiss button that leaves the default in place under a different name, so
 * the citizen has still never answered and the card comes back forever. Both
 * buttons here write a row.
 */
describe('the ask on Blood Test Analysis', () => {
  const read = (...p: string[]) => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'medical', ...p), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
  const card = read('components', 'ShareWithHubs.tsx');
  const page = read('pages', 'BloodAnalysis.tsx');

  it('is on the page, and only once there is a panel', () => {
    expect(page).toMatch(/<ShareWithHubs hasPanel=\{hasPanel\} \/>/);
    expect(card).toMatch(/if \(!hasPanel \|\| consents\.isLoading \|\| consents\.isError \|\| unanswered\.length === 0\) return null;/);
  });

  it('asks only about hubs nobody has answered for', () => {
    expect(card).toMatch(/\.filter\(\(c\) => !c\.answered\)/);
  });

  it('says the thing that makes it worth asking — nothing is read until they say so (4 Sep)', () => {
    expect(card).toMatch(/nothing\s*\n?\s*until you say so/);
    expect(card).not.toMatch(/on now, and you have not been asked before/);
    // The affirmative button is the affirmative act; the other keeps it off.
    expect(card).toMatch(/'Turn it on'/);
    expect(card).toMatch(/Keep it off/);
  });

  /**
   * Both answers write. If a dismissal ever appears here that does not call
   * `answer`, this fails — and it should, because a banner you can wave away
   * leaves the citizen exactly as unasked as before.
   */
  it('has no way out that is not an answer', () => {
    expect(card).toMatch(/onClick=\{\(\) => answer\(true\)\}/);
    expect(card).toMatch(/onClick=\{\(\) => answer\(false\)\}/);
    expect(card).not.toMatch(/Not now|Dismiss|Maybe later|onClick=\{\(\) => setHidden/);
  });
});
