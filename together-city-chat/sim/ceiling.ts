import { factorScores, overallScore, coverage, confidence, type DXProfile } from '../src/dating/matching';
const best = (dx: DXProfile, ints: string[], otherDx: DXProfile, otherInts: string[]) => {
  // best case: astrology 99, and every factor at its own maximum given what is answered
  const f = factorScores(99, ints, otherInts, dx, otherDx);
  const cov = coverage(dx, otherDx, ints, otherInts);
  return { raw: overallScore(f, 1), shown: overallScore(f, confidence(cov)), cov, f };
};
const FULL: DXProfile = { city: 'Pune', state: 'Maharashtra', country: 'India',
  personalityTraits: ['A','B','C','D','E','F','G'], values: ['Family','Honesty','Loyalty'],
  relationshipGoal: 'Marriage', diet: 'Vegetarian', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Active' };
const FULLI = ['Travel','Music','Reading'];
const tiers: [string, DXProfile, string[]][] = [
  ['both complete, everything identical', FULL, FULLI],
  ['no interests', { ...FULL }, []],
  ['no values', { ...FULL, values: undefined }, FULLI],
  ['no personality traits', { ...FULL, personalityTraits: undefined }, FULLI],
  ['no lifestyle at all', { ...FULL, diet: undefined, smoking: undefined, drinking: undefined, fitnessLevel: undefined }, FULLI],
  ['no goal', { ...FULL, relationshipGoal: undefined }, FULLI],
  ['traits+values+interests only (no lifestyle, no goal)', { city:'Pune', state:'Maharashtra', country:'India', personalityTraits:['A','B','C','D','E','F','G'], values:['Family','Honesty','Loyalty'] }, FULLI],
  ['goal + diet only (a "partial" profile)', { city:'Pune', state:'Maharashtra', country:'India', relationshipGoal:'Marriage', diet:'Vegetarian' }, []],
  ['city only (a "thin" profile)', { city:'Pune', state:'Maharashtra', country:'India' }, []],
];
console.log('  THE CEILING: the highest score this profile can EVER reach with anybody');
console.log('  (astrology pinned at its maximum 99, the other side complete and identical)');
console.log('  profile shape                                            coverage   raw   SHOWN CEILING');
for (const [name, dx, ints] of tiers) {
  const r = best(dx, ints, FULL, FULLI);
  console.log(`  ${name.padEnd(54)}  ${r.cov.toFixed(2).padStart(6)}   ${String(r.raw).padStart(3)}      ${String(r.shown).padStart(3)}%${r.shown < 75 ? '   ← can never be a curated match' : ''}`);
}
