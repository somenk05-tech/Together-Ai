import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPanels, extrasRows, humanKey, humanValue } from './city-profiles';

/**
 * THE PAGE THAT LISTS EVERY PROFILE HAS TO BE TRUE ABOUT ALL OF THEM.
 *
 * It is one screen making fourteen claims at once, and three of them are the
 * kind that are wrong quietly:
 *
 *   1. "This came from your record." If a panel marks a field `master` and
 *      then prints the HUB'S copy of it, the page is arguing for a single
 *      source of truth while demonstrating a stale duplicate. Worse than not
 *      having built it.
 *   2. "You have answered this." Registration writes FoodPref, FitnessProfile
 *      and BeautyProfile with defaults that read exactly like answers —
 *      "everything", "maintain", "beginner", "normal". A brand-new account
 *      described as a person who eats everything and trains as a beginner is
 *      the p1 the rest of this folder was written to stop, arriving through a
 *      new door.
 *   3. "Nothing is recorded here." A blank has to be a blank, not an empty
 *      array printed as `[]` or a default printed as a fact.
 *
 * These are pinned rather than described, because all three are one careless
 * line away at any time.
 */

const empty = {
  master: null, astro: null, beauty: null, fitness: null, food: null, dating: null,
  jobs: null, user: null, wallet: null, mail: null,
  pets: [], addresses: [], consents: [], privacy: [],
  counts: {
    medicalRecords: 0, bloodTests: 0, medicines: 0, posts: 0, followers: 0,
    following: 0, connections: 0, mealPlans: 0, workouts: 0, petPhotos: 0,
  },
  percentByKey: {},
};

const panelOf = (view: ReturnType<typeof buildPanels>, key: string) => {
  const p = view.panels.find((x) => x.key === key);
  if (!p) throw new Error(`no panel: ${key}`);
  return p;
};
const fieldOf = (view: ReturnType<typeof buildPanels>, key: string, label: string) => {
  const f = panelOf(view, key).fields.find((x) => x.label === label);
  if (!f) throw new Error(`no field ${label} on ${key}`);
  return f;
};

describe('every profile in the city', () => {
  describe('a citizen who has opened nothing', () => {
    const view = buildPanels({ ...empty });

    it('still gets a panel for every store, because a blank page says the page exists', () => {
      expect(view.panels.length).toBeGreaterThanOrEqual(11);
      for (const p of view.panels) expect(p.label).toBeTruthy();
    });

    it('reports each one as unstarted rather than as empty-and-broken', () => {
      const started = view.panels.filter((p) => p.started).map((p) => p.key);
      // Account is the one store that always exists — everything else is the
      // citizen's to fill in.
      expect(started).toEqual(['account']);
      expect(view.startedCount).toBe(1);
    });

    it('prints no value anywhere it has none', () => {
      for (const p of view.panels) {
        for (const f of [...p.fields, ...p.extra]) {
          if (f.value !== null) expect(f.value).not.toMatch(/^(\[\]|\{\}|undefined|null|NaN)$/);
        }
      }
    });

    it('gives every panel exactly one door to whoever owns the writing', () => {
      for (const p of view.panels) {
        expect(p.href).toMatch(/^\//);
        expect(p.editLabel.length).toBeGreaterThan(2);
      }
    });
  });

  /* ── claim 1: what says 'from your record' must BE from the record ────── */
  describe('a field marked as descending from the record', () => {
    const view = buildPanels({
      ...empty,
      master: {
        name: 'Priya', heightCm: 170, weightKg: 62, sexAtBirth: 'female',
        dateOfBirth: new Date('1990-05-02'), timeOfBirth: '06:15',
        birthCity: 'Pune', birthCountry: 'India',
      },
      // The hub rows still carry an OLD copy — which is the case this exists
      // to catch. A propagation that has not run yet, or a hub written before
      // the master row existed, leaves exactly this.
      fitness: { answeredAt: new Date(), heightCm: 150, weightKg: 50, sex: 'male', age: 35, level: 'advanced', goal: 'strength' },
      food: { answeredAt: new Date(), heightCm: 151, weightKg: 51, sex: 'male', age: 35, diet: 'vegetarian', goal: 'lose', activity: 1.6 },
      astro: { birthDate: new Date('1980-01-01'), birthCity: 'Nowhere', timeZone: 'Etc/UTC' },
    });

    it('shows the record’s value and not the hub’s stale copy', () => {
      expect(fieldOf(view, 'fitness', 'Height').value).toBe('170 cm');
      expect(fieldOf(view, 'nutrition', 'Weight').value).toBe('62 kg');
      expect(fieldOf(view, 'fitness', 'Sex used for the maths').value).toBe('female');
      expect(fieldOf(view, 'astrology', 'Birth city').value).toBe('Pune');
      expect(fieldOf(view, 'astrology', 'Birth date').value).toBe('1990-05-02');
    });

    it('marks it as the record’s, so the page is not asking to be believed', () => {
      for (const label of ['Height', 'Weight', 'Age', 'Sex used for the maths']) {
        expect(fieldOf(view, 'fitness', label).source).toBe('master');
      }
    });

    it('leaves the hub’s own answers marked as the hub’s', () => {
      expect(fieldOf(view, 'fitness', 'Ability level')).toMatchObject({ value: 'advanced', source: 'hub' });
      expect(fieldOf(view, 'nutrition', 'Goal')).toMatchObject({ value: 'lose', source: 'hub' });
    });

    it('names every mastered field with the stores that read it', () => {
      const dob = view.mastered.find((f) => f.label === 'Date of birth');
      expect(dob?.value).toBe('1990-05-02');
      expect(dob?.readBy).toEqual(expect.arrayContaining(['Astrology', 'Matchmaking']));
      for (const f of view.mastered) expect(f.readBy.length).toBeGreaterThan(0);
    });
  });

  /* ── claim 2: a default is not an answer ──────────────────────────────── */
  describe('a row of registration defaults', () => {
    // Exactly what signup writes: the row exists, answeredAt does not.
    const view = buildPanels({
      ...empty,
      food: { answeredAt: null, diet: 'everything', goal: 'maintain', activity: 1.4 },
      fitness: { answeredAt: null, level: 'beginner', goal: 'general', mode: 'mixed', bodyGoal: 'athletic', age: 35, sex: 'other' },
      beauty: { answeredAt: null, skinType: 'normal', hairType: 'straight', concerns: '' },
    });

    it('is not reported as a citizen’s answer', () => {
      expect(fieldOf(view, 'nutrition', 'Diet').value).toBeNull();
      expect(fieldOf(view, 'fitness', 'Ability level').value).toBeNull();
      expect(fieldOf(view, 'beauty', 'Skin type').value).toBeNull();
    });

    it('leaves the hub unstarted and gives it no summary line', () => {
      for (const key of ['nutrition', 'fitness', 'beauty']) {
        expect(panelOf(view, key).started).toBe(false);
        expect(panelOf(view, key).summary).toBeNull();
      }
    });

    it('does not invent an age of 35 from a defaulted column', () => {
      expect(fieldOf(view, 'fitness', 'Age').value).toBeNull();
      expect(fieldOf(view, 'nutrition', 'Age').value).toBeNull();
    });
  });

  /* ── claim 3: the blobs are shown, not summarised away ────────────────── */
  describe('the free-form blobs each hub keeps', () => {
    it('turns a stored key into a readable label without a table to forget', () => {
      expect(humanKey('skinGoals')).toBe('Skin goals');
      expect(humanKey('max_cook_time')).toBe('Max cook time');
    });

    it('prints nothing for a value with nothing in it', () => {
      expect(humanValue([])).toBeNull();
      expect(humanValue('')).toBeNull();
      expect(humanValue('  ')).toBeNull();
      expect(humanValue({})).toBeNull();
      expect(humanValue(null)).toBeNull();
    });

    it('counts a long list rather than dumping it into a field', () => {
      const many = Array.from({ length: 30 }, (_, i) => `x${i}`);
      expect(humanValue(many)).toContain('(30 in all)');
    });

    it('never prints a value twice on one panel', () => {
      const rows = extrasRows({ skinTone: 'olive', undertone: 'warm', routine: ['am'] }, ['skinTone', 'undertone']);
      expect(rows.map((r) => r.label)).toEqual(['Routine']);
    });

    it('reaches the panel, so nothing a hub stored is hidden from its owner', () => {
      const view = buildPanels({
        ...empty,
        beauty: { answeredAt: new Date(), skinType: 'oily', hairType: 'wavy', concerns: 'acne', extras: JSON.stringify({ skinGoals: ['glow'], hairConcerns: ['frizz'] }) },
      });
      expect(panelOf(view, 'beauty').extra.map((f) => f.label)).toEqual(['Hair concerns', 'Skin goals']);
    });
  });

  /* ── the pets list is a list, not a form ──────────────────────────────── */
  describe('pets', () => {
    it('gives a row per animal and derives age from the birthday it stores', () => {
      const view = buildPanels({
        ...empty,
        pets: [{ name: 'Kalu', species: 'dog', breed: 'indie', dob: '2020-01-01', weightKg: 18, goal: 'maintain' }],
        counts: { ...empty.counts, petPhotos: 2 },
      });
      const p = panelOf(view, 'pets');
      expect(p.started).toBe(true);
      expect(p.fields[0].label).toBe('Kalu');
      expect(p.fields[0].value).toContain('yrs');
      expect(p.counts).toEqual(expect.arrayContaining([{ label: 'Pets', value: 1 }]));
    });
  });

  /* ── the promises the panel makes about privacy ───────────────────────── */
  describe('what it refuses to print', () => {
    it('shows a card by its last four digits and never a number', () => {
      const view = buildPanels({
        ...empty,
        wallet: { balanceInr: 2500, cardBrand: 'Visa', cardLast4: '4242', cardName: 'Somen' },
      });
      const card = fieldOf(view, 'money', 'Card on file');
      expect(card.value).toBe('Visa ending 4242');
      expect(card.value).not.toContain('Somen');
    });

    it('reports an unverified email as unverified rather than as an address', () => {
      const view = buildPanels({
        ...empty,
        user: { handle: 'somen', email: 'a@b.com', emailVerified: false, createdAt: new Date('2026-01-01') },
      });
      expect(fieldOf(view, 'account', 'Primary email').hint).toMatch(/not verified/i);
    });

    it('says a hub is off only from what is stored, never by inverting it', () => {
      const view = buildPanels({ ...empty, user: { hiddenHubsJson: JSON.stringify(['pets']) } });
      expect(fieldOf(view, 'services', 'Hubs switched off').value).toBe('pets');
    });
  });

  /* ── the endpoint is a read and stays one ─────────────────────────────── */
  describe('the route', () => {
    const controller = readFileSync(join(__dirname, 'profile.controller.ts'), 'utf8');

    it('is served as GET /profile/city', () => {
      expect(controller).toContain("@Get('city')");
    });

    /**
     * THE WHOLE ARGUMENT OF THE PAGE, AS A GUARD.
     *
     * A field is owned by exactly one place. The moment this endpoint grows a
     * write, the page that exists to end duplicate copies of a field becomes a
     * second editor for every one of them — so the absence is the feature, and
     * an absence nobody guards is an absence that lasts until the next
     * convenient afternoon.
     */
    it('has no write beside it', () => {
      const block = /@Get\('city'\)[\s\S]{0,400}?\n  \}/.exec(controller)?.[0] ?? '';
      expect(block).toContain('cityProfiles.get');
      expect(controller).not.toMatch(/@(Post|Patch|Put|Delete)\((['"])city\2\)/);
    });
  });
});
