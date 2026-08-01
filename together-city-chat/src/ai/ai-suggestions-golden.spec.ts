/**
 * Golden master — the suggestion engine's DETERMINISTIC spine: the fallbacks
 * every citizen sees when no model is configured, and the guard rails applied
 * to model output (the astrology tag rule: never a percentage, because no
 * percentage is being calculated).
 */
import { AiSuggestionsService } from './ai-suggestions.service';

type Db = {
  foodPref?: unknown; bloodTest?: unknown; datingProfile?: unknown;
  beautyProfile?: unknown; fitnessProfile?: unknown;
};

function build(db: Db, aiItems: unknown[] | null = null) {
  const svc = Object.create(AiSuggestionsService.prototype) as AiSuggestionsService;
  (svc as any).prisma = {
    foodPref: { findUnique: async () => db.foodPref ?? null },
    medicalBloodTest: { findFirst: async () => db.bloodTest ?? null },
    datingProfile: { findUnique: async () => db.datingProfile ?? null },
    beautyProfile: { findUnique: async () => db.beautyProfile ?? null },
    fitnessProfile: { findUnique: async () => db.fitnessProfile ?? null },
  };
  (svc as any).ai = {
    enabled: aiItems !== null,
    json: async (_sys: string, _usr: string, fallback: unknown) => (aiItems !== null ? aiItems : fallback),
  };
  return svc;
}

describe('ai-suggestions golden master (fallback spine)', () => {
  it('recipes: a low hemoglobin drives marker-led meals; the health note always rides along', async () => {
    const svc = build({
      foodPref: { diet: 'vegetarian', goal: 'maintain' },
      bloodTest: { biomarkers: [{ key: 'hb', value: 9.5 }, { key: 'ldl', value: 100 }] },
    });
    expect(await svc.recipes('u1')).toMatchSnapshot();
  });

  it('recipes: no blood test at all falls back to the goal plates', async () => {
    const svc = build({ foodPref: { diet: 'everything', goal: 'lose' } });
    expect(await svc.recipes('u1')).toMatchSnapshot();
  });

  it('astrology: no dating profile is an invitation, not a guess', async () => {
    const svc = build({});
    expect(await svc.astrology('u1')).toMatchSnapshot();
  });

  it('astrology: the pairings rank by tradition and NEVER carry a percentage — even when a model tries', async () => {
    const model = [
      { title: 'Leo + Aries', detail: 'Fire meets fire.', tag: '92% match' },   // the exact sin
      { title: 'Leo + Sagittarius', detail: 'Adventure squared.', tag: 'Strong pairing' },
    ];
    const svc = build({ datingProfile: { birthDate: new Date('1996-08-10T00:00:00Z') } }, model);
    const out = await svc.astrology('u1');
    for (const item of out.items) expect(item.tag).toMatch(/^(Classic|Strong|Easy) pairing$/);
    expect(out).toMatchSnapshot();
  });

  it('beauty: oily skin with acne builds the treatment routine; no profile builds the gentle default', async () => {
    const withProfile = build({ beautyProfile: { skinType: 'oily', hairType: 'wavy', concerns: 'acne, dullness' } });
    const bare = build({});
    expect({ withProfile: await withProfile.beauty('u1'), bare: await bare.beauty('u1') }).toMatchSnapshot();
  });

  it('fitness: declared conditions surface the see-your-doctor note; a beginner gets easy effort', async () => {
    const svc = build({ fitnessProfile: { level: 'beginner', goal: 'weightLoss', mode: 'home', conditions: 'knee pain' } });
    expect(await svc.fitness('u1')).toMatchSnapshot();
  });
});
