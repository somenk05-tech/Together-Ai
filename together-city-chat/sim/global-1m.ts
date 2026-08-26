/**
 * TOGETHER CITY DATING — 1,000,000-USER GLOBAL STRESS TEST.
 *
 * Scored against the shipped engine (matching.ts, astrology.ts, geo.ts,
 * completion.ts). Nothing is re-implemented here.
 *
 * The candidate model matches what `dating.service.ts#matches()` actually does:
 * it loads EVERY visible approved profile with no geographic scoping and no
 * cap, so a viewer's candidate set is the whole planet. The harness therefore
 * samples uniformly from the world, plus a same-city sample used only to
 * estimate local liquidity.
 *
 *   tsx sim/global-1m.ts [scale] [seed]
 */
import { compatibilityScore } from '../src/dating/astrology';
import {
  confidenceFor, factorScores, overallScore, unreachableReason, curatedBar,
  effectiveDealBreakers, WEIGHTS, type DXProfile,
} from '../src/dating/matching';
import { profileCompletion } from '../src/dating/completion';
import { distanceBetween } from '../src/shared/geo';
import { buildPopulation, trueKm, MARKETS, GOAL_VOCAB, type GP } from './global-pop';

const SCALE = Number(process.argv[2] ?? 100000);
const SEED = Number(process.argv[3] ?? 42);
const K_GLOBAL = Number(process.env.K_GLOBAL ?? 90);
const K_LOCAL = Number(process.env.K_LOCAL ?? 30);
const CURATED = 75, DECK = 5, MIN_COMPLETION = 40;

const t0 = Date.now();
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(2) + '%' : 'n/a');
const L = (s = '') => console.log(s);

console.error(`generating ${SCALE.toLocaleString('en-IN')} profiles…`);
const people = buildPopulation(SCALE, SEED);
console.error(`generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let seed = SEED ^ 0x5f3759df;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// index by city for the local sample
const byCity = new Map<string, number[]>();
people.forEach((p, i) => {
  const k = `${p.city}|${p.country}`;
  const a = byCity.get(k); if (a) a.push(i); else byCity.set(k, [i]);
});

// completion percent, computed once per person with the real function
const compPct = new Float32Array(people.length);
people.forEach((p, i) => {
  compPct[i] = profileCompletion({
    ...(p.dx as Record<string, unknown>),
    bio: p.complete === 'thin' ? '' : 'x'.repeat(40),
    interests: p.interests,
    photos: p.complete === 'thin' ? [] : p.complete === 'partial' ? ['a', 'b'] : ['a', 'b', 'c', 'd'],
    languages: p.languages,
    birthTime: null,
  }).percent;
});

const wants = (a: GP, b: GP) => (a.seeking === 'any' || a.seeking === b.gender) && (b.seeking === 'any' || b.seeking === a.gender);
function sc(a: GP, b: GP) {
  const { score: astro } = compatibilityScore(
    { userId: a.id, birthDate: a.birthDate, interests: a.interests },
    { userId: b.id, birthDate: b.birthDate, interests: b.interests });
  const f = factorScores(astro, a.interests, b.interests, a.dx, b.dx);
  const s = overallScore(f, confidenceFor(a.dx, b.dx, a.interests, b.interests));
  return { f, s, astro };
}

// ───────────────────────────────────────────── accumulators
const histo = new Int32Array(101);
const astroX: number[] = [], goalX: number[] = [], valX: number[] = [], locX: number[] = [], ovX: number[] = [];
type Seg = { n: number; sum: number; ge90: number; ge85: number; ge80: number; ge75: number; ge70: number; reach: number; seen: number };
const seg = () => ({ n: 0, sum: 0, ge90: 0, ge85: 0, ge80: 0, ge75: 0, ge70: 0, reach: 0, seen: 0 } as Seg);
const byMarket = new Map<string, Seg>(), byAge = new Map<string, Seg>(), byOrient = new Map<string, Seg>(),
  byGender = new Map<string, Seg>(), byTier = new Map<string, Seg>(), byComplete = new Map<string, Seg>(),
  byArche = new Map<string, Seg>();
const get = (m: Map<string, Seg>, k: string) => { let v = m.get(k); if (!v) { v = seg(); m.set(k, v); } return v; };
const ageBand = (a: number) => a <= 21 ? '18-21' : a <= 25 ? '22-25' : a <= 30 ? '26-30' : a <= 35 ? '31-35' : a <= 40 ? '36-40' : a <= 50 ? '41-50' : '50+';

// per-viewer liquidity (scaled to the full population)
const liq = { ge90: 0, ge85: 0, ge80: 0, ge75: 0, ge70: 0, n: 0 };
const viewerGE75: number[] = [];      // estimated count of ≥75 partners, per viewer
const viewerLocalGE75: number[] = []; // same, restricted to their own city
let emptyDeck = 0, deckSlots = 0, deckMismatch = 0, deckCrossLang = 0, deckCrossBorder = 0, deckFarKm = 0;
let viewers = 0, shownPairs = 0, removedPairs = 0;
const exposure = new Map<string, number>();
const removalReason = new Map<string, number>();
let unplaceablePairs = 0, placeablePairs = 0, unplaceableSumLoc = 0, placeableSumLoc = 0;
let hi_noSharedLang = 0, hi_n = 0, hi_crossBorder = 0, hi_over2000km = 0, hi_intentSplit = 0, hi_kidSplit = 0, hi_adversary = 0;
let engineKmNull = 0, engineKmWrong = 0, engineKmTot = 0, engineKmErrSum = 0;
const marketEmpty = new Map<string, { v: number; e: number }>();
const candArche = new Map<string, { drawn: number; shown: number; ge75: number; ge80: number; sum: number }>();
const cArch = (k: string) => { let v = candArche.get(k); if (!v) { v = { drawn: 0, shown: 0, ge75: 0, ge80: 0, sum: 0 }; candArche.set(k, v); } return v; };
const crossRel = { n: 0, hi: 0 }; const sameRel = { n: 0, hi: 0 };
/**
 * §24 — PREDICTIVE VALIDITY WITHOUT OUTCOME DATA.
 *
 * There are no real dates to correlate against, so the harness defines a latent
 * "workable pair" indicator OUTSIDE the engine, from the things that decide
 * whether two strangers can actually have a relationship at all: a shared
 * language, a survivable distance, the same answer about commitment, a
 * compatible answer about children, an age gap either side would accept, and
 * the candidate not being a fake. It contains nothing the engine scores on.
 *
 * This is not "will they fall in love" — nothing can simulate that. It is the
 * weaker and still necessary claim: if the percentage predicts nothing about
 * even THIS, it predicts nothing at all.
 */
const band = (s: number) => s >= 90 ? '90+' : s >= 85 ? '85-89' : s >= 80 ? '80-84' : s >= 75 ? '75-79' : s >= 70 ? '70-74' : s >= 60 ? '60-69' : '<60';
const validity = new Map<string, { n: number; ok: number }>();
const vAdd = (b: string, ok: boolean) => { let v = validity.get(b); if (!v) { v = { n: 0, ok: 0 }; validity.set(b, v); } v.n++; if (ok) v.ok++; };
const workX: number[] = [], workY: number[] = [];
const cityEmpty = new Map<string, { v: number; e: number }>();

const N = people.length;
const step = Math.max(1, Math.floor(N / 20));
for (let vi = 0; vi < N; vi++) {
  if (vi % step === 0) console.error(`  scoring ${(100 * vi / N).toFixed(0)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  const me = people[vi];
  if (compPct[vi] < MIN_COMPLETION) { /* they can still view; they just cannot be curated FOR others */ }
  viewers++;
  const localIdx = byCity.get(`${me.city}|${me.country}`) ?? [];
  const cand: number[] = [];
  for (let k = 0; k < K_GLOBAL; k++) cand.push(Math.floor(rnd() * N));
  const nLocalDraw = Math.min(K_LOCAL, localIdx.length);
  for (let k = 0; k < nLocalDraw; k++) cand.push(localIdx[Math.floor(rnd() * localIdx.length)]);

  const scored: { p: GP; s: number; mismatch: boolean; km: number }[] = [];
  let gSeen = 0, gGe75 = 0, gGe90 = 0, gGe85 = 0, gGe80 = 0, gGe70 = 0, gReach = 0;
  let lSeen = 0, lGe75 = 0;
  for (let ci = 0; ci < cand.length; ci++) {
    const isLocal = ci >= K_GLOBAL;
    const you = people[cand[ci]];
    if (you.id === me.id) continue;
    if (isLocal) lSeen++; else gSeen++;
    const ca = cArch(you.archetype); if (!isLocal) ca.drawn++;
    if (!wants(me, you)) continue;
    const un = unreachableReason(me.dx, you.dx, me.statedAge, you.statedAge);
    if (un) { removedPairs++; removalReason.set(un.reason, (removalReason.get(un.reason) ?? 0) + 1); continue; }
    if (compPct[cand[ci]] < MIN_COMPLETION) continue;   // CURATED_MIN_COMPLETION, as the service applies it
    if (!isLocal) gReach++;
    const { f, s, astro } = sc(me, you);
    if (!isLocal) { ca.shown++; ca.sum += s; if (s >= 75) ca.ge75++; if (s >= 80) ca.ge80++; }
    if (me.dx.religion && you.dx.religion) {
      const tgt = me.dx.religion === you.dx.religion ? sameRel : crossRel;
      tgt.n++; if (s >= 75) tgt.hi++;
    }
    shownPairs++;
    histo[Math.max(0, Math.min(100, s))]++;
    if (ovX.length < 300000) { ovX.push(s); astroX.push(astro); goalX.push(f.relationshipGoals); valX.push(f.values); locX.push(f.location); }

    const km = distanceBetween(me.dx, you.dx);
    const tk = trueKm(me, you);
    engineKmTot++;
    if (km === null) { engineKmNull++; unplaceablePairs++; unplaceableSumLoc += f.location; }
    else { placeablePairs++; placeableSumLoc += f.location; engineKmErrSum += Math.abs(km - tk); if (Math.abs(km - tk) > 300) engineKmWrong++; }

    const goalSideMe = me.trueCommitted, goalSideYou = you.trueCommitted;
    const kidSplit = !!me.dx.wantsChildren && !!you.dx.wantsChildren && me.dx.wantsChildren !== you.dx.wantsChildren
      && (me.dx.wantsChildren === 'Yes') !== (you.dx.wantsChildren === 'Yes');
    const mismatch = (goalSideMe !== goalSideYou) || kidSplit;
    const sharedLang = me.languages.some((l) => you.languages.includes(l));

    if (!isLocal) {
      gGe70 += s >= 70 ? 1 : 0; gGe75 += s >= 75 ? 1 : 0; gGe80 += s >= 80 ? 1 : 0;
      gGe85 += s >= 85 ? 1 : 0; gGe90 += s >= 90 ? 1 : 0;
    } else if (s >= 75) lGe75++;

    if (s >= CURATED) {
      hi_n++;
      if (!sharedLang) hi_noSharedLang++;
      if (me.country !== you.country) hi_crossBorder++;
      if (tk > 2000) hi_over2000km++;
      if (goalSideMe !== goalSideYou) hi_intentSplit++;
      if (kidSplit) hi_kidSplit++;
      if (you.archetype === 'catfish' || you.archetype === 'bot' || you.archetype === 'scammer' || you.archetype === 'agelie') hi_adversary++;
    }
    // latent workability, computed from nothing the engine reads
    let w = 0;
    if (sharedLang) w += 2;
    w += tk <= 50 ? 2 : tk <= 300 ? 1.5 : tk <= 1500 ? 0.5 : 0;
    if (goalSideMe === goalSideYou) w += 2;
    if (!kidSplit) w += 1.5;
    if (Math.abs(me.age - you.age) <= 8) w += 1;
    if (!['catfish', 'bot', 'scammer', 'agelie'].includes(you.archetype)) w += 1;
    const workable = w >= 7;
    vAdd(band(s), workable);
    if (workX.length < 300000) { workX.push(s); workY.push(w); }
    scored.push({ p: you, s, mismatch, km: tk });
  }

  // segment stats over the GLOBAL sample only (unbiased for the whole pool)
  for (const [m, k] of [[byMarket, me.market], [byAge, ageBand(me.age)], [byOrient, me.orientation],
    [byGender, me.gender], [byTier, me.tier], [byComplete, me.complete], [byArche, me.archetype]] as [Map<string, Seg>, string][]) {
    const g = get(m, k);
    g.n++; g.seen += gSeen; g.reach += gReach;
    g.ge90 += gGe90; g.ge85 += gGe85; g.ge80 += gGe80; g.ge75 += gGe75; g.ge70 += gGe70;
  }
  liq.n++; liq.ge90 += gGe90; liq.ge85 += gGe85; liq.ge80 += gGe80; liq.ge75 += gGe75; liq.ge70 += gGe70;
  const scaleG = gSeen ? N / gSeen : 0;
  viewerGE75.push(gGe75 * scaleG);
  viewerLocalGE75.push(lSeen ? (lGe75 / lSeen) * localIdx.length : 0);

  scored.sort((a, b) => b.s - a.s);
  const bar = curatedBar(scored.map((c) => c.s), CURATED);
  const top = scored.filter((c) => c.s >= bar).slice(0, DECK);
  deckSlots += top.length;
  for (const d of top) {
    if (d.mismatch) deckMismatch++;
    if (!me.languages.some((l) => d.p.languages.includes(l))) deckCrossLang++;
    if (d.p.country !== me.country) deckCrossBorder++;
    if (d.km > 2000) deckFarKm++;
    exposure.set(d.p.id, (exposure.get(d.p.id) ?? 0) + 1);
  }
  if (top.length === 0) emptyDeck++;
  const mm = marketEmpty.get(me.market) ?? { v: 0, e: 0 }; mm.v++; if (!top.length) mm.e++; marketEmpty.set(me.market, mm);
  const ck = `${me.city}, ${me.country}`;
  const cc = cityEmpty.get(ck) ?? { v: 0, e: 0 }; cc.v++; if (!top.length) cc.e++; cityEmpty.set(ck, cc);
}

// ───────────────────────────────────────────── report
function corr(xs: number[], ys: number[]) {
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, x) => s + x, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx2 += a * a; dy2 += b * b; }
  return num / Math.sqrt(dx2 * dy2);
}
const totalScored = histo.reduce((a, b) => a + b, 0);
const cumAtLeast = (t: number) => { let s = 0; for (let i = t; i <= 100; i++) s += histo[i]; return s; };
const quant = (p: number) => { let acc = 0; const target = p * totalScored; for (let i = 0; i <= 100; i++) { acc += histo[i]; if (acc >= target) return i; } return 100; };
let Hb = 0; for (const c of histo) if (c) { const p = c / totalScored; Hb -= p * Math.log2(p); }

if (process.env.DUMP_HISTO) { const rows: string[] = []; for (let i = 0; i <= 100; i++) if (histo[i]) rows.push(`${i}:${histo[i]}`); console.error('HISTO ' + rows.join(',')); }
L('='.repeat(96));
L(`  TOGETHER CITY DATING — GLOBAL STRESS TEST · ${SCALE.toLocaleString('en-IN')} users · seed ${SEED} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
L(`  ${shownPairs.toLocaleString('en-IN')} directed pairs scored · ${removedPairs.toLocaleString('en-IN')} removed by a hard filter`);
L(`  weights: ${process.env.DATING_WEIGHTS === 'retuned' ? 'RETUNED' : 'astrology-led (0.50)'} · goal vocabulary: ${process.env.GOAL_VOCAB === 'engine' ? 'ENGINE Title Case' : 'PRODUCTION lookup labels'} · bar: ${process.env.DATING_BAR ?? 'fixed 75'} · core filters: ${process.env.DATING_CORE_FILTERS ?? 'off'}`);
L('='.repeat(96));

L('\n§7 SCORE DISTRIBUTION');
L(`  min ${histo.findIndex((x) => x > 0)} · p05 ${quant(.05)} · p25 ${quant(.25)} · median ${quant(.5)} · p75 ${quant(.75)} · p90 ${quant(.9)} · p99 ${quant(.99)} · max ${100 - [...histo].reverse().findIndex((x) => x > 0)}`);
for (const t of [90, 85, 80, 75, 70, 60]) L(`  share of scored pairs ≥${t}% ......................... ${pct(cumAtLeast(t), totalScored)}`);
L(`  share below 60% ..................................... ${pct(totalScored - cumAtLeast(60), totalScored)}`);
L(`  distinct integer values used ........................ ${histo.filter((x) => x > 0).length} of 101`);
L(`  entropy of the displayed % .......................... ${Hb.toFixed(2)} bits (~${Math.round(2 ** Hb)} distinguishable levels)`);
L(`  astrology → final score correlation ................. r = ${corr(astroX, ovX).toFixed(3)}   (weight ${WEIGHTS.astrology})`);
L(`  relationship goals → final score .................... r = ${corr(goalX, ovX).toFixed(3)}`);
L(`  values → final score ................................ r = ${corr(valX, ovX).toFixed(3)}`);
L(`  location → final score .............................. r = ${corr(locX, ovX).toFixed(3)}`);

L('\n§17 LIQUIDITY — partners at each threshold, extrapolated to the full pool');
L(`  MEAN partners per citizen:  ≥90% ${(liq.ge90 / liq.n * (N / (K_GLOBAL))).toFixed(0)} · ≥85% ${(liq.ge85 / liq.n * (N / K_GLOBAL)).toFixed(0)} · ≥80% ${(liq.ge80 / liq.n * (N / K_GLOBAL)).toFixed(0)} · ≥75% ${(liq.ge75 / liq.n * (N / K_GLOBAL)).toFixed(0)} · ≥70% ${(liq.ge70 / liq.n * (N / K_GLOBAL)).toFixed(0)}`);
const vs = [...viewerGE75].sort((a, b) => a - b);
const vq = (p: number) => Math.round(vs[Math.floor(p * (vs.length - 1))]);
L(`  ≥75% partners per citizen: p10 ${vq(.1)} · median ${vq(.5)} · p90 ${vq(.9)} · p99 ${vq(.99)}`);
L(`  citizens with ZERO partners ≥75% anywhere on earth .. ${pct(vs.filter((x) => x === 0).length, vs.length)}`);
const ls = [...viewerLocalGE75].sort((a, b) => a - b);
L(`  ≥75% partners IN THEIR OWN CITY: median ${Math.round(ls[Math.floor(ls.length / 2)])} · p10 ${Math.round(ls[Math.floor(ls.length * .1)])} · share with zero ${pct(ls.filter((x) => x < 1).length, ls.length)}`);
L(`  empty curated decks ................................. ${pct(emptyDeck, viewers)}`);

L('\n  by market:   viewers   empty deck   mean ≥75% partners   mean ≥90%');
for (const [k, g] of [...byMarket.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const me2 = marketEmpty.get(k)!;
  L(`  ${k.padEnd(8)} ${String(g.n).padStart(9)}  ${pct(me2.e, me2.v).padStart(9)}   ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0).padStart(12)}      ${(g.ge90 / g.n * (N / K_GLOBAL)).toFixed(0).padStart(8)}`);
}
L('\n  by orientation (as the product can express it):');
L('  cohort        viewers   reachable candidates/100 sampled   mean ≥75% partners');
for (const [k, g] of [...byOrient.entries()].sort((a, b) => b[1].n - a[1].n)) {
  L(`  ${k.padEnd(10)} ${String(g.n).padStart(9)}   ${(100 * g.reach / Math.max(1, g.seen)).toFixed(1).padStart(8)}                        ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0).padStart(8)}`);
}
L('\n  by gender:');
for (const [k, g] of byGender) L(`  ${k.padEnd(10)} n=${String(g.n).padStart(8)}  reachable ${(100 * g.reach / Math.max(1, g.seen)).toFixed(1)}%  mean ≥75% ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0)}`);
L('\n§18 by age band:');
for (const k of ['18-21', '22-25', '26-30', '31-35', '36-40', '41-50', '50+']) {
  const g = byAge.get(k); if (!g) continue;
  L(`  ${k.padEnd(8)} n=${String(g.n).padStart(8)}  reachable ${(100 * g.reach / Math.max(1, g.seen)).toFixed(1)}%  mean ≥75% ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0)}  ≥90% ${(g.ge90 / g.n * (N / K_GLOBAL)).toFixed(0)}`);
}
L('\n§14 by profile completeness:');
for (const k of ['full', 'partial', 'thin']) {
  const g = byComplete.get(k); if (!g) continue;
  L(`  ${k.padEnd(8)} n=${String(g.n).padStart(8)}  mean ≥75% partners ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0).padStart(7)}  ≥90% ${(g.ge90 / g.n * (N / K_GLOBAL)).toFixed(0)}`);
}
L('\n§13/§27 by archetype (adversarial cohorts) — as VIEWERS');
L('  archetype        n     reachable%   share of own pool ≥75%   mean ≥75% partners');
for (const [k, g] of [...byArche.entries()].sort((a, b) => (b[1].ge75 / b[1].n) - (a[1].ge75 / a[1].n))) {
  L(`  ${k.padEnd(14)} ${String(g.n).padStart(7)}   ${(100 * g.reach / Math.max(1, g.seen)).toFixed(1).padStart(7)}      ${pct(g.ge75, Math.max(1, g.reach)).padStart(10)}            ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0).padStart(8)}`);
}
L('\n  …and as CANDIDATES (how often each archetype survives someone else\'s filters');
L('  and then clears 75% — the number that decides whether gaming works):');
L('  archetype        appearances   survived filters   cleared 75%   cleared 80%');
for (const [k, v] of [...candArche.entries()].sort((a, b) => (b[1].ge75 / Math.max(1, b[1].shown)) - (a[1].ge75 / Math.max(1, a[1].shown)))) {
  L(`  ${k.padEnd(14)} ${String(v.drawn).padStart(11)}   ${pct(v.shown, v.drawn).padStart(16)}   ${pct(v.ge75, v.drawn).padStart(11)}   ${pct(v.ge80, v.drawn).padStart(11)}`);
}
L('\n  by city tier:');
for (const [k, g] of byTier) L(`  ${k.padEnd(8)} n=${String(g.n).padStart(8)}  mean ≥75% ${(g.ge75 / g.n * (N / K_GLOBAL)).toFixed(0)}`);

L('\n§9/§15 WHAT IS INSIDE A CURATED DECK');
L(`  deck slots filled ................................... ${deckSlots.toLocaleString('en-IN')} of ${(viewers * DECK).toLocaleString('en-IN')} (${pct(deckSlots, viewers * DECK)})`);
L(`  slots split on intent or on children ................ ${pct(deckMismatch, deckSlots)}`);
L(`  slots with NO language in common .................... ${pct(deckCrossLang, deckSlots)}`);
L(`  slots in a different country ........................ ${pct(deckCrossBorder, deckSlots)}`);
L(`  slots more than 2,000 km away ....................... ${pct(deckFarKm, deckSlots)}`);
L('\n  among ALL pairs shown at ≥75%:');
L(`  no language in common ............................... ${pct(hi_noSharedLang, hi_n)}`);
L(`  different country ................................... ${pct(hi_crossBorder, hi_n)}`);
L(`  more than 2,000 km apart ............................ ${pct(hi_over2000km, hi_n)}`);
L(`  opposite sides of the commitment line ............... ${pct(hi_intentSplit, hi_n)}`);
L(`  one wants children, the other does not .............. ${pct(hi_kidSplit, hi_n)}`);
L(`  candidate is a catfish / bot / scammer / age-liar ... ${pct(hi_adversary, hi_n)}`);

L('\n§20 GEOGRAPHY AS THE ENGINE SEES IT');
L(`  pairs where distanceBetween() returns null .......... ${pct(engineKmNull, engineKmTot)}`);
L(`  mean |engine km − true km| where it does resolve .... ${placeablePairs ? (engineKmErrSum / placeablePairs).toFixed(0) : '—'} km`);
L(`  resolved pairs off by more than 300 km .............. ${pct(engineKmWrong, placeablePairs)}`);
L(`  mean location factor, UNPLACEABLE pairs ............. ${(unplaceableSumLoc / Math.max(1, unplaceablePairs)).toFixed(1)}`);
L(`  mean location factor, placeable pairs ............... ${(placeableSumLoc / Math.max(1, placeablePairs)).toFixed(1)}`);

L('\n§26 EXPOSURE CONCENTRATION');
const expo = [...exposure.values()].sort((a, b) => b - a);
const tot = expo.reduce((a, b) => a + b, 0);
const share = (f: number) => pct(expo.slice(0, Math.max(1, Math.floor(expo.length * f))).reduce((a, b) => a + b, 0), tot);
L(`  profiles ever appearing in any deck ................. ${pct(expo.length, N)} of the population`);
L(`  top 1% of those profiles' share of deck slots ....... ${share(0.01)}`);
L(`  top 10% share ....................................... ${share(0.10)}`);

L('\n§24 DOES THE PERCENTAGE PREDICT ANYTHING?');
L('  "workable" = shares a language, survivable distance, same side of the commitment');
L('  line, no children split, age gap ≤8, candidate not fake. Nothing the engine scores on.');
L('  shown band     pairs        workable      lift vs base');
{
  const baseN = [...validity.values()].reduce((a, b) => a + b.n, 0);
  const baseOk = [...validity.values()].reduce((a, b) => a + b.ok, 0);
  const base = baseOk / baseN;
  for (const b of ['90+', '85-89', '80-84', '75-79', '70-74', '60-69', '<60']) {
    const v = validity.get(b); if (!v || !v.n) { L(`  ${b.padEnd(12)} ${'0'.padStart(10)}          —            —`); continue; }
    L(`  ${b.padEnd(12)} ${v.n.toLocaleString('en-IN').padStart(12)}   ${pct(v.ok, v.n).padStart(10)}     ${((v.ok / v.n) / base).toFixed(2)}×`);
  }
  L(`  base rate over all scored pairs ..................... ${pct(baseOk, baseN)}`);
  L(`  correlation between the shown % and workability ..... r = ${corr(workX, workY).toFixed(3)}`);
}

L('\n§15 DIFFERENCE vs CONFLICT');
L(`  same-religion pairs reaching ≥75% ................... ${pct(sameRel.hi, sameRel.n)}  (n=${sameRel.n.toLocaleString('en-IN')})`);
L(`  cross-religion pairs reaching ≥75% .................. ${pct(crossRel.hi, crossRel.n)}  (n=${crossRel.n.toLocaleString('en-IN')})`);
L('\n  hard-filter removals by reason (note whether "intent" appears at all):');
for (const [k, v] of [...removalReason.entries()].sort((a, b) => b[1] - a[1])) L(`    ${k.padEnd(12)} ${pct(v, removedPairs)}  (${v.toLocaleString('en-IN')})`);

const worstCities = [...cityEmpty.entries()].filter(([, v]) => v.v >= 200).sort((a, b) => b[1].e / b[1].v - a[1].e / a[1].v).slice(0, 10);
L('\n  thinnest cities by empty-deck rate (n≥200 viewers):');
for (const [c, v] of worstCities) L(`    ${c.padEnd(34)} ${pct(v.e, v.v)} empty (n=${v.v})`);
L('='.repeat(96));
