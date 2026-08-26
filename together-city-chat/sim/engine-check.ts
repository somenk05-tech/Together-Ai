import { compatibilityScore, zodiacSign, vedicSign, tropicalSign } from '../src/dating/astrology';
import { signOf, siderealLon, sunLongitude } from '../src/astrology/astro-engine';
import {
  WEIGHTS, canonicalGoal, committed, hardFilterReason, languageBarrier,
  dietConflicts, childrenConflict, religionConflict, coverage, confidence,
  curatedBar, effectiveDealBreakers, factorScores, overallScore, type DXProfile,
} from '../src/dating/matching';

const L = (s = '') => console.log(s);
let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => { if (!cond) fails++; L(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

L('WEIGHTS: ' + JSON.stringify(WEIGHTS) + '  sum=' + Object.values(WEIGHTS).reduce((a, b) => a + b, 0).toFixed(3));

L('\n── goal vocabulary ──');
const PROD = ['Marriage', 'Long-term relationship', 'Serious dating', 'Casual dating', 'Friendship first', 'Still figuring it out'];
for (const g of PROD) L(`  ${g.padEnd(24)} → ${String(canonicalGoal(g))}   committed=${committed(g)}`);
let fired = 0;
for (const a of PROD) for (const b of PROD) if (hardFilterReason({ relationshipGoal: a, dealBreakers: ['Marriage Intentions'] }, { relationshipGoal: b }, 30) === 'intent') fired++;
ok(fired === 12, 'Marriage Intentions fires on production labels', `${fired} of 36 ordered pairs`);
ok(factorScores(80, [], [], { relationshipGoal: 'Serious dating' }, { relationshipGoal: 'Casual dating' }).relationshipGoals === 75,
  'Serious dating vs Casual dating scores 75, not the unanswered 45');
ok(canonicalGoal('Still figuring it out') === null, '"Still figuring it out" is not forced onto the ladder');
ok(coverage({ relationshipGoal: 'Still figuring it out' }, { relationshipGoal: 'Marriage' }) === 0,
  'an unreadable goal no longer counts as answered');

L('\n── core filters on by default ──');
ok(effectiveDealBreakers({ relationshipGoal: 'Casual dating' }).includes('Marriage Intentions'), 'intent filters without a chip');
ok(hardFilterReason({ relationshipGoal: 'Marriage' }, { relationshipGoal: 'Casual dating' }, 30) === 'intent', 'marriage-seeker vs casual dater is removed with no chip ticked');
ok(hardFilterReason({ relationshipGoal: 'Marriage' }, { }, 30) === null, 'an unanswered goal still filters nobody');

L('\n── lattices ──');
ok(!dietConflicts('Vegetarian', 'Vegan'), 'Vegetarian preference keeps a Vegan');
ok(!dietConflicts('Vegetarian', 'Jain'), 'Vegetarian preference keeps a Jain');
ok(dietConflicts('Vegetarian', 'Non-vegetarian'), 'Vegetarian preference still removes a meat-eater');
ok(dietConflicts('Vegan', 'Vegetarian'), 'Vegan preference removes a Vegetarian');
ok(!childrenConflict('Yes', 'Maybe'), 'Yes vs Maybe is not a conflict');
ok(!childrenConflict('Yes', 'Prefer not to say'), 'Yes vs a non-answer is not a conflict');
ok(childrenConflict('Yes', 'No'), 'Yes vs No still is');
ok(!religionConflict('Atheist', 'Agnostic'), 'Atheist and Agnostic are compatible');
ok(!religionConflict('Prefer not to say', 'Hindu'), 'a privacy answer excludes nobody');
ok(!religionConflict('Hindu', 'Prefer not to say'), '…in either direction');
ok(religionConflict('Muslim', 'Christian'), 'two stated, different religions still conflict');

L('\n── language ──');
ok(languageBarrier({ languages: ['Japanese'] }, { languages: ['Portuguese'] }), 'no shared language is a barrier');
ok(!languageBarrier({ languages: ['Japanese', 'English'] }, { languages: ['Portuguese', 'English'] }), 'English in common is not');
ok(!languageBarrier({ languages: [] }, { languages: ['Portuguese'] }), 'an unanswered language filters nobody');
ok(hardFilterReason({ languages: ['Japanese'] }, { languages: ['Portuguese'] }, 30) === 'language', 'and it removes the pair');

L('\n── zodiac ──');
const jd = (d: Date) => d.getTime() / 86400000 + 2440587.5;
let agree = 0, tot = 0;
for (const y of [1975, 1990, 2004]) for (let m = 0; m < 12; m++) for (let d = 1; d <= 28; d++) {
  const dt = new Date(Date.UTC(y, m, d, 12)); tot++;
  if (zodiacSign(dt).name === signOf(siderealLon(sunLongitude(jd(dt)), jd(dt)))) agree++;
}
ok(agree === tot, 'dating now agrees with the Astrology Zone on every date', `${agree}/${tot}`);
ok(tropicalSign(new Date(Date.UTC(1996, 11, 25))).name === 'Capricorn', 'the tropical reading is kept whole (C2 regression)');
ok(vedicSign(new Date(Date.UTC(1996, 11, 25))).name === 'Sagittarius', 'and the Vedic answer for the same date differs');

L('\n── anti-gaming ──');
const T = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const I = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const honest = factorScores(80, ['Travel', 'Music', 'Reading'], ['Travel', 'Music', 'Reading'], { personalityTraits: ['Calm', 'Ambitious', 'Creative'] }, { personalityTraits: ['Calm', 'Ambitious', 'Creative'] });
const gamer = factorScores(80, ['Travel', 'Music', 'Reading'], I, { personalityTraits: ['Calm', 'Ambitious', 'Creative'] }, { personalityTraits: T });
ok(honest.personality > gamer.personality, 'a matched twin now beats a trait maximalist', `${honest.personality} vs ${gamer.personality}`);
ok(honest.interests > gamer.interests, '…and an interest maximalist', `${honest.interests} vs ${gamer.interests}`);
// The old exploit, exactly: a candidate who ticks every trait used to collect
// the Introvert/Extrovert complement against an introvert (35 + 13 + 8 = 56) and
// so BEAT a genuine extrovert (35 + 0 + 8 = 43). Now the bonus requires being
// exclusively one of the two, and the overlap term has a denominator.
const vsMaximalist = factorScores(80, [], [], { personalityTraits: ['Introvert'] }, { personalityTraits: T });
const vsOpposite = factorScores(80, [], [], { personalityTraits: ['Introvert'] }, { personalityTraits: ['Extrovert'] });
ok(vsOpposite.personality > vsMaximalist.personality,
  'a trait maximalist no longer out-scores a genuine opposite', `${vsOpposite.personality} vs ${vsMaximalist.personality}`);
const aBonus = compatibilityScore({ userId: 'a', birthDate: new Date(Date.UTC(1994, 4, 1)), interests: ['Travel', 'Music', 'Reading'] }, { userId: 'b', birthDate: new Date(Date.UTC(1994, 4, 1)), interests: ['Travel', 'Music', 'Reading'] }).score;
const bBonus = compatibilityScore({ userId: 'a', birthDate: new Date(Date.UTC(1994, 4, 1)), interests: ['Travel', 'Music', 'Reading'] }, { userId: 'b', birthDate: new Date(Date.UTC(1994, 4, 1)), interests: I }).score;
ok(aBonus > bBonus, 'the astrology interest bonus is an overlap, not a count', `${aBonus} vs ${bBonus}`);

L('\n── confidence is measurable again at 0.90 ──');
const blank: DXProfile = { city: 'Pune', state: 'Maharashtra', country: 'India' };
const full: DXProfile = { city: 'Pune', state: 'Maharashtra', country: 'India', personalityTraits: ['Calm'], values: ['Family'], relationshipGoal: 'Marriage', diet: 'Vegetarian' };
L(`  blank x blank coverage ${coverage(blank, blank).toFixed(2)} → x${confidence(coverage(blank, blank)).toFixed(3)}`);
L(`  full  x full  coverage ${coverage(full, full, ['Travel'], ['Travel']).toFixed(2)} → x${confidence(coverage(full, full, ['Travel'], ['Travel'])).toFixed(3)}`);
ok(coverage(blank, blank) < coverage(full, full, ['Travel'], ['Travel']), 'coverage still separates a blank pair from a complete one at astrology 0.90');

L('\n── the bar ──');
// Taken off the sorted list rather than interpolated, so a viewer with four
// candidates still has a top tenth of four. Ten candidates → index 1 → 80.
ok(curatedBar([90, 80, 70, 60, 50, 40, 30, 20, 10, 5]) === 80, 'curated bar is the viewer\'s own top tenth by default', String(curatedBar([90, 80, 70, 60, 50, 40, 30, 20, 10, 5])));
ok(curatedBar([40, 30, 20], 75) === 40, '…and a thin list still has one');
ok(curatedBar([], 75) === 75, 'an empty list falls back to the fixed bar');

L(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
process.exit(fails ? 1 : 0);
