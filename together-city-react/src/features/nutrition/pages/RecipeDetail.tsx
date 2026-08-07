import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useRecipe, useRecipes, useBuildCart, useSavedRecipes, useToggleSave, useRecipeVariants } from '../hooks';
import { stepTimerSeconds } from '../components/CookMode';
import { useCookStore } from '../cook.store';
import { DIET_META } from '../dietMeta';
import { AddToPlan } from '../components/AddToPlan';
import { recipeImageUrl } from '../recipeImages';
import { VegMark, dietKind } from '../components/VegMark';
import { setTitle } from '../recipeTitle';
import type { DietKey } from '../types';
import type { RecipeDetail as RecipeDetailT } from '../api';

/**
 * THE RECIPE, SET AS A CARD.
 *
 * This page used to be nine rounded cards stacked down a column — the shape
 * every other hub uses, applied to the one document in the application that
 * has a five-hundred-year-old printed form of its own. A recipe card puts what
 * to buy and what to do SIDE BY SIDE, because you cook with your eyes moving
 * between two columns, not scrolling between two cards.
 *
 * So it wears the press: the display serif and the monospace figures that the
 * meal plan was granted, on the same paper, for the same reason. relief.spec
 * names this file as the third wearer with that argument written out — the
 * exception is scoped or it is not an exception.
 *
 * WHAT DID NOT CHANGE. Every number, every step, every badge and every warning
 * comes from exactly where it came from before: the recipe row, the computed
 * nutrients, and whyForYou. This is a redesign of the paper, not of the
 * findings, and a redesign that quietly relaxed one of them would be the worst
 * possible version of it. The caution line still says the dish is heavy when it
 * is heavy, the nutrient table still prints "—" for what nobody has data for,
 * and the badges are still derived rather than decorative.
 */

/* ─────────────────────────── helpers ─────────────────────────── */

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const gLabel = (g: number) => (g <= 0 ? 'To taste' : g < 1 ? '<1 g' : `${g % 1 === 0 ? g : g.toFixed(1)} g`);
/**
 * A step's timer, in words.
 *
 * Rounding FIRST and testing the result was wrong and the card render is what
 * showed it: `Math.round(30/60)` is 1, so a thirty-second fry — "until the raw
 * smell goes" — printed as "1 min", which is twice as long as the recipe says
 * and long enough to burn garlic. Anything under a minute is said in seconds.
 */
const mmss = (s: number) => (s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`);

/** FDA-style Daily Values for %DV (adult reference). */
const DV = { protein: 50, carbs: 275, fat: 78, fiber: 28, sugar: 50, satFat: 20, sodium: 2300, potassium: 4700, phosphorus: 1250, iron: 18, calcium: 1300, vitC: 90, vitD: 20 };

const difficultyFor = (min: number) => (min <= 15 ? 'Easy' : min <= 35 ? 'Medium' : 'Involved');

/** One-tap variant actions — each returns real, matching dataset recipes. */
const VARIANTS: [string, string][] = [
  ['higher_protein', 'Higher protein'], ['reduce_calories', 'Fewer calories'], ['reduce_carbs', 'Lower carb'],
  ['kidney', 'Kidney-friendly'], ['liver', 'Liver-friendly'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'],
  ['jain', 'Jain'], ['gluten_free', 'Gluten-free'], ['budget', 'Budget'], ['premium', 'Premium'], ['similar', 'Similar recipes'],
];

/** Grocery aisle for an ingredient (keyword heuristic — honest grouping, no data needed). */
function aisleFor(name: string): string {
  const n = name.toLowerCase();
  if (/chicken|mutton|fish|prawn|egg|paneer|tofu|meat|lamb|beef|pork|turkey|salmon|tuna|soya|lentil|dal|bean|chickpea|rajma/.test(n)) return 'Protein';
  if (/milk|curd|yogurt|yoghurt|cheese|butter|ghee|cream|buttermilk|khoya/.test(n)) return 'Dairy';
  if (/rice|wheat|flour|bread|roti|oats|poha|quinoa|pasta|noodle|millet|rava|semolina|bulgur|barley|maida/.test(n)) return 'Grains';
  if (/apple|banana|orange|mango|grape|berry|melon|pomegranate|pineapple|papaya|lemon|lime|fruit|date|raisin/.test(n)) return 'Fruits';
  if (/salt|pepper|masala|cumin|turmeric|chilli|chili|coriander|spice|clove|cardamom|cinnamon|bay|mustard seed|hing|asafoet|garam|powder/.test(n)) return 'Spices';
  if (/onion|tomato|potato|spinach|carrot|beans|peas|capsicum|pepper|cabbage|cauliflower|broccoli|okra|brinjal|gourd|pumpkin|cucumber|garlic|ginger|chilli|coriander leaf|mint|curry leaf|mushroom|beet|radish|greens|kale|lettuce|vegetable/.test(n)) return 'Vegetables';
  if (/oil|sugar|jaggery|honey|sauce|vinegar|stock|paste|nut|seed|coconut/.test(n)) return 'Pantry';
  return 'Pantry';
}

/* ─────────────────────────── inline line-icons ─────────────────────────── */
const PATHS: Record<string, string> = {
  arrowLeft: 'M15 6l-6 6 6 6',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
  share: 'M12 15V3m0 0L8 7m4-4l4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  chef: 'M7 21h10M8 21v-4h8v4M6 13a4 4 0 0 1 1-8 4 4 0 0 1 10 0 4 4 0 0 1 1 8H6z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  utensils: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M18 3c-2 0-3 2-3 5s1 4 3 4v9',
  pulse: 'M3 12h4l2 5 4-12 2 7h6',
  sparkle: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  dot: 'M12 12h.01',
};
function Ic({ name, size = 16, stroke = 1.6, style }: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', ...style }} aria-hidden>
      <path d={PATHS[name] ?? PATHS.dot} />
    </svg>
  );
}

/* ─────────────────────────── derived health signals ─────────────────────────── */
interface Nutr { sodiumMg: number; potassiumMg: number; phosphorusMg: number; sugarG: number; addedSugarG: number; satFatG: number; complete: boolean }

function deriveBadges(m: { kcal: number; protein: number; carbs: number; fiber: number }, n?: Nutr): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const pEnergy = m.kcal > 0 ? (m.protein * 4) / m.kcal : 0;
  if (m.protein >= 12 && pEnergy >= 0.2) out.push({ key: 'protein', label: 'High Protein' });
  if (!n) return out;
  if (n.addedSugarG <= 5 && (m.fiber >= 3 || m.carbs <= 30)) out.push({ key: 'diab', label: 'Diabetes Friendly' });
  if (n.satFatG <= 5 && n.sodiumMg <= 600) out.push({ key: 'heart', label: 'Heart Healthy' });
  if (n.potassiumMg > 0 && n.potassiumMg <= 400 && n.phosphorusMg <= 250 && n.sodiumMg <= 500) out.push({ key: 'kidney', label: 'Kidney Friendly' });
  if (n.satFatG <= 6 && n.addedSugarG <= 8) out.push({ key: 'liver', label: 'Liver Friendly' });
  return out;
}

function deriveBenefits(m: { kcal: number; protein: number; fiber: number }, micros: { vitCMg: number } | undefined, badges: { key: string }[]): string[] {
  const has = (k: string) => badges.some((b) => b.key === k);
  const out: string[] = [];
  if (m.kcal <= 400 && m.fiber >= 3) out.push('Supports weight loss');
  if (has('diab')) out.push('Helps control blood sugar');
  if (has('heart')) out.push('Heart healthy');
  if (has('protein')) out.push('High protein');
  if (m.protein >= 20) out.push('Supports muscle growth');
  if (m.fiber >= 5) out.push('Gut health');
  if (has('liver')) out.push('Good for the liver');
  if (has('kidney')) out.push('Kidney friendly');
  if ((micros?.vitCMg ?? 0) >= 20) out.push('Healthy skin (vitamin C)');
  return out;
}

/* ─────────────────────────── small press atoms ─────────────────────────── */

function NutriBar({ label, value, unit, dv }: { label: string; value: number | null; unit: string; dv: number }) {
  const known = value != null && value > 0;
  const pct = known ? Math.min(100, Math.round((value / dv) * 100)) : 0;
  return (
    <div className="press-bar">
      <span className="press-lab">{label}</span>
      <span className="press-track"><i style={{ width: `${pct}%` }} /></span>
      <span className="press-val">
        {known ? <>{value % 1 === 0 ? value : value.toFixed(1)}{unit}<em>{pct}%</em></> : <em>—</em>}
      </span>
    </div>
  );
}

/** Calorie ring with macro segments, drawn in the press's own three greens. */
function Ring({ kcal, p, c, f }: { kcal: number; p: number; c: number; f: number }) {
  const pk = p * 4, ck = c * 4, fk = f * 9; const tot = pk + ck + fk || 1;
  const R = 46, C = 2 * Math.PI * R; let off = 0;
  const segs = [
    { v: pk, col: 'var(--press-macro-1)' },
    { v: ck, col: 'var(--press-macro-2)' },
    { v: fk, col: 'var(--press-macro-3)' },
  ];
  return (
    <svg width="128" height="128" viewBox="0 0 120 120" role="img" aria-label={`${kcal} calories`}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--press-macro-0)" strokeWidth="9" />
      {segs.map((s, i) => {
        const dash = (s.v / tot) * C;
        const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={s.col} strokeWidth="9" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />;
        off += dash; return el;
      })}
      <text x="60" y="57" textAnchor="middle" fontSize="23" fill="var(--press-ink)" fontFamily="var(--press-mono)">{kcal}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="9" fill="var(--press-ink-3)" letterSpacing="1.6">KCAL</text>
    </svg>
  );
}

/** A rule with a stop in it — the references' botanical, drawn rather than set. */
const Ornament = () => <div className="press-r-orn" aria-hidden><i /></div>;

/* ─────────────────────────── active-section tabs ─────────────────────────── */
const TABS = [['card', 'The card'], ['nutrition', 'Nutrition'], ['benefits', 'Health benefits'], ['variants', 'Make it yours'], ['foryou', 'For you'], ['grocery', 'Grocery']] as const;
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids.join(',')]);
  return active;
}

/* ─────────────────────────── page ─────────────────────────── */
export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipe(id);
  const others = useRecipes('everything');
  const startCooking = useCookStore((s) => s.start);
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFrom = (location.state as { from?: string } | null)?.from;

  const savedQ = useSavedRecipes();
  const toggleSaveM = useToggleSave();
  const [plates, setPlates] = useState(1);
  const [heroOk, setHeroOk] = useState(true);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const variantsQ = useRecipeVariants(id, variant);
  const active = useActiveSection(TABS.map((t) => t[0]));

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  if (recipe.isLoading) return <Spinner label="Plating up…" />;
  if (recipe.isError || !recipe.data) return <EmptyState title="Recipe not found" hint="It may have been removed." />;
  const r: RecipeDetailT = recipe.data;
  const meta = DIET_META[r.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
  const heroSrc = r.imageUrl ?? recipeImageUrl(r.recipeNo);
  const title = setTitle(r.name);

  const scaledIngredients = r.ingredients.map((i) => ({ name: i.name, grams: round1(i.grams * plates), priceInr: Math.round(i.priceInr * plates) }));
  const costPerPlate = r.ingredients.reduce((s, i) => s + i.priceInr, 0);
  const m = { kcal: Math.round(r.kcal * plates), protein: Math.round(r.protein * plates), carbs: Math.round(r.carbs * plates), fat: Math.round(r.fat * plates), fiber: Math.round(r.fiber * plates) };
  const n0 = r.nutrients;
  const n = n0 ? { sodiumMg: Math.round(n0.sodiumMg * plates), potassiumMg: Math.round(n0.potassiumMg * plates), phosphorusMg: Math.round(n0.phosphorusMg * plates), sugarG: round1(n0.sugarG * plates), addedSugarG: round1(n0.addedSugarG * plates), satFatG: round1(n0.satFatG * plates), complete: n0.complete } : undefined;
  const mic = r.micros ? { ironMg: round1(r.micros.ironMg * plates), calciumMg: Math.round(r.micros.calciumMg * plates), vitDUg: round1(r.micros.vitDUg * plates), vitCMg: Math.round(r.micros.vitCMg * plates) } : undefined;

  const badges = deriveBadges(m, n);
  const benefits = deriveBenefits(m, mic, badges);
  const healthScore = r.healthPercent && r.healthPercent > 0 ? Math.round(r.healthPercent) : null;
  const perPlate = plates === 1 ? 'per serving' : `for ${plates} servings`;
  const vegWord = dietKind(r.diet) === 'nonveg' ? 'Non-veg' : dietKind(r.diet) === 'egg' ? 'Egg' : 'Veg';

  /**
   * The line under the rule, where the printed card puts its tagline.
   *
   * The references say things like "RICH. CREAMY. COMFORTING." — a copywriter's
   * line about a dish somebody chose to photograph. There is no copywriter
   * here and 4,000 dishes, so this prints what is actually known: the badges
   * this recipe's own nutrients earned, and failing that, what it is and where
   * it is from. An invented adjective in this slot would be the exact failure
   * the beauty hub had, dressed as typography.
   */
  const lede = badges.length > 0
    ? badges.map((b) => b.label).join(' · ')
    : [meta.label, r.country, difficultyFor(r.minutes)].filter(Boolean).join(' · ');

  // Honest, recipe-intrinsic caution (not user-specific): flag genuinely heavy nutrients.
  const caution = n?.complete && (n.sodiumMg > 700 || n.addedSugarG > 12 || n.satFatG > 10)
    ? [n.sodiumMg > 700 && 'sodium', n.addedSugarG > 12 && 'added sugar', n.satFatG > 10 && 'saturated fat'].filter(Boolean).join(' & ')
    : null;

  const saved = (savedQ.data?.ids ?? []).includes(r.id);
  const toGrocery = () => buildCart.mutate({ recipeIds: [r.id] }, { onSuccess: () => { setAdded(true); setToast('Added to your grocery list'); } });
  const toggleSave = () => { const next = !saved; toggleSaveM.mutate({ id: r.id, saved: next }, { onSuccess: () => setToast(next ? 'Saved' : 'Removed from saved') }); };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) { await navigator.share({ title: r.name, url }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); setToast('Link copied'); } catch { setToast('Copy failed'); }
  };
  const cook = () => startCooking({ name: r.name, ingredients: scaledIngredients, method: r.method!, cookSteps: r.cookSteps });

  const sectionStyle: React.CSSProperties = { scrollMarginTop: 84 };
  const blockStyle: React.CSSProperties = { marginTop: 'clamp(30px, 4vw, 50px)' };

  const aislesMap = new Map<string, typeof scaledIngredients>();
  for (const ing of scaledIngredients) { if (ing.grams <= 0) continue; const k = aisleFor(ing.name); (aislesMap.get(k) ?? aislesMap.set(k, []).get(k)!).push(ing); }
  const aisleOrder = ['Vegetables', 'Fruits', 'Protein', 'Dairy', 'Grains', 'Spices', 'Pantry'];
  const aisles = [...aislesMap.entries()].sort((a, b) => aisleOrder.indexOf(a[0]) - aisleOrder.indexOf(b[0]));

  return (
    <div data-press style={{ maxWidth: 1080, margin: '0 auto', padding: '26px 16px 80px' }}>

      {/* ── masthead ─────────────────────────────────────────────────── */}
      <div className="press-r-bar">
        <button type="button" className="press-r-act" onClick={() => (cameFrom ? navigate(-1) : navigate('/nutrition/recipes'))}>
          <Ic name="arrowLeft" size={15} /> Back to recipes
        </button>
        <div className="press-r-acts">
          <button type="button" className={`press-r-act${saved ? ' is-on' : ''}`} onClick={toggleSave} aria-pressed={saved}>
            <Ic name="bookmark" size={14} /> {saved ? 'Saved' : 'Save'}
          </button>
          <button type="button" className="press-r-act" onClick={() => void share()} aria-label="Share this recipe">
            <Ic name="share" size={14} /> Share
          </button>
        </div>
      </div>

      {/* ── the card ─────────────────────────────────────────────────── */}
      <section id="card" style={sectionStyle}>
        <div className="press-r-head">
          <p className="press-r-eyebrow">{r.country} · {vegWord}</p>
          {/* One h1. The two pieces are spans so the accessible name is the
              whole dish name, exactly as it is stored, in reading order — the
              split is a way of setting it, not a way of renaming it. The lead
              is the small line above and the tail is the large one below,
              which is the order the reference sets them in. */}
          <h1 className="press-r-title">
            {title.lead && <span className="press-r-lead">{title.lead}</span>}
            <span className="press-r-tail">{title.tail}</span>
          </h1>
          <p className="press-r-lede">{lede}</p>

          {/* One rule of facts, on a band, the way a printed card carries them.
              The servings cell is the CONTROL — it is the one number on a
              printed card you always wish you could change. */}
          <div className="press-r-spec">
            <div><span>Total time</span><b>{r.minutes}<small>min</small></b></div>
            <div>
              <span>Serves</span>
              <b>
                <select value={plates} onChange={(e) => setPlates(Number(e.target.value))} aria-label="Servings"
                  style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', minHeight: 44 }}>
                  {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </b>
            </div>
            <div><span>Calories</span><b>{m.kcal}<small>kcal</small></b></div>
            <div><span>Protein</span><b>{m.protein}<small>g</small></b></div>
            <div><span>Difficulty</span><b style={{ fontFamily: 'var(--sans)', fontSize: 12 }}>{difficultyFor(r.minutes)}</b></div>
            <div>
              <span>{meta.label}</span>
              <b style={{ display: 'flex', alignItems: 'center' }}><VegMark diet={r.diet} size={15} /></b>
            </div>
          </div>

          <figure className="press-r-photo" style={{ margin: 0 }}>
            {heroSrc && heroOk
              ? <img src={heroSrc} alt={r.name} loading="lazy" onError={() => setHeroOk(false)} />
              : <Ic name="utensils" size={40} stroke={1.2} />}
          </figure>
        </div>

        {caution && (
          <p style={{ margin: '18px 0 0', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--press-ink-2)' }}>
            <span>Matches your taste, but higher in {caution}. Your Optimal Health plan picks a lighter option.</span>
            <Link to="/nutrition?mode=optimal" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontSize: 10, fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--press-green)', textDecoration: 'none', borderBottom: '1px solid var(--press-green)' }}>
              <Ic name="sparkle" size={13} /> View optimal version
            </Link>
          </p>
        )}

        <div style={{ marginTop: 20 }}><AddToPlan recipeId={r.id} recipeName={r.name} /></div>

        <Ornament />

        {/* ── what to buy | what to do ───────────────────────────────── */}
        <div className="press-r-cols">
          <section>
            <div className="press-r-sechead">
              <h2>Ingredients</h2>
              <span className="press-r-aside">{perPlate}</span>
            </div>
            {scaledIngredients.map((ing) => (
              <div key={ing.name} className="press-r-ing">
                <span className="press-r-ing-mark" aria-hidden>{ing.name.trim().charAt(0)}</span>
                <span className="press-r-ing-name">{ing.name}</span>
                <span className="press-r-ing-q">{gLabel(ing.grams)}</span>
              </div>
            ))}
            <div className="press-r-tot">
              <span>Est. grocery cost</span>
              <b>{fmtINR(costPerPlate * plates)}</b>
            </div>
            <button type="button" onClick={toGrocery} disabled={buildCart.isPending}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, marginTop: 16, cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 10.5, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', border: '1px solid var(--press-ink)', borderRadius: 4, background: added ? 'var(--press-green)' : 'transparent', color: added ? 'var(--press-paper)' : 'var(--press-ink)' }}>
              <Ic name={added ? 'check' : 'plus'} size={14} /> {added ? 'Added to grocery' : 'Add all to grocery'}
            </button>
          </section>

          <section id="directions" style={sectionStyle}>
            <div className="press-r-sechead">
              <h2>Instructions</h2>
              {r.method && r.method.length > 0 && (
                <button type="button" onClick={cook} className="press-r-act" style={{ color: 'var(--press-green)' }}>
                  <Ic name="chef" size={14} /> Cook mode
                </button>
              )}
            </div>
            {r.method && r.method.length > 0 ? (
              <div className="press-r-steps">
                {r.method.map((step, i) => {
                  const secs = r.cookSteps?.[i]?.durationSec ?? stepTimerSeconds(step);
                  const isDone = done.has(i);
                  return (
                    <button key={i} type="button" className={`press-r-step${isDone ? ' is-done' : ''}`} aria-pressed={isDone}
                      onClick={() => setDone((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; })}>
                      <span className="press-r-step-n">{isDone ? <Ic name="check" size={14} stroke={2.2} /> : i + 1}</span>
                      <span className="press-r-step-t">
                        {step}
                        {secs > 0 && <span className="press-r-step-time">{mmss(secs)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--press-ink-3)', margin: 0 }}>
                No method was published with this recipe. The ingredients and quantities are complete.
              </p>
            )}

            {/* the boxed panel the references close their column with — here it
                is the two things this hub can actually do next, not a list of
                serving suggestions somebody made up */}
            <div className="press-r-box">
              <h3>Make it even better</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--press-ink-2)' }}>
                <li>Change the servings above — quantities, cost and nutrition all rescale.</li>
                <li>Cook mode reads each step aloud, keeps the screen awake and times the steps that need it.</li>
                <li>Tap a step to strike it out as you go.</li>
              </ul>
            </div>
          </section>
        </div>
      </section>

      {/* ── sticky index ─────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 6, marginTop: 'clamp(30px, 4vw, 50px)', background: 'var(--press-paper)', borderTop: '1px solid var(--press-ink)', borderBottom: '1px solid var(--press-rule)' }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(([tid, label]) => {
            const on = active === tid;
            return (
              <button key={tid} type="button" onClick={() => document.getElementById(tid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ position: 'relative', minHeight: 44, border: 0, background: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 9.5, fontWeight: 500, letterSpacing: '.17em', textTransform: 'uppercase', color: on ? 'var(--press-green)' : 'var(--press-ink-3)', padding: '0 16px', whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── nutrition ────────────────────────────────────────────────── */}
      <section id="nutrition" style={{ ...sectionStyle, ...blockStyle }}>
        <div className="press-r-sechead">
          <h2>Nutrition</h2>
          <span className="press-r-aside">{perPlate}</span>
        </div>
        <div className="press-ring" style={{ alignItems: 'flex-start', gap: 'clamp(24px, 4vw, 48px)' }}>
          <div style={{ flex: '0 0 auto' }}>
            <Ring kcal={m.kcal} p={m.protein} c={m.carbs} f={m.fat} />
            <div className="press-key" style={{ marginTop: 16 }}>
              <div><i style={{ background: 'var(--press-macro-1)' }} /><span className="press-l">Protein</span><span className="press-n">{m.protein}g</span></div>
              <div><i style={{ background: 'var(--press-macro-2)' }} /><span className="press-l">Carbs</span><span className="press-n">{m.carbs}g</span></div>
              <div><i style={{ background: 'var(--press-macro-3)' }} /><span className="press-l">Fat</span><span className="press-n">{m.fat}g</span></div>
            </div>
          </div>
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <NutriBar label="Protein" value={m.protein} unit="g" dv={DV.protein} />
            <NutriBar label="Carbs" value={m.carbs} unit="g" dv={DV.carbs} />
            <NutriBar label="Fat" value={m.fat} unit="g" dv={DV.fat} />
            <NutriBar label="Fibre" value={m.fiber} unit="g" dv={DV.fiber} />
            {n && <NutriBar label="Sugar" value={n.sugarG} unit="g" dv={DV.sugar} />}
            {n && <NutriBar label="Sat fat" value={n.satFatG} unit="g" dv={DV.satFat} />}
            {n && <NutriBar label="Sodium" value={n.sodiumMg} unit="mg" dv={DV.sodium} />}
            {n && n.potassiumMg > 0 && <NutriBar label="Potassium" value={n.potassiumMg} unit="mg" dv={DV.potassium} />}
            {mic && <NutriBar label="Iron" value={mic.ironMg > 0 ? mic.ironMg : null} unit="mg" dv={DV.iron} />}
            {mic && <NutriBar label="Calcium" value={mic.calciumMg > 0 ? mic.calciumMg : null} unit="mg" dv={DV.calcium} />}
            {mic && <NutriBar label="Vitamin C" value={mic.vitCMg > 0 ? mic.vitCMg : null} unit="mg" dv={DV.vitC} />}
            {mic && <NutriBar label="Vitamin D" value={mic.vitDUg > 0 ? mic.vitDUg : null} unit="µg" dv={DV.vitD} />}
            {healthScore != null && (
              <div className="press-r-tot" style={{ marginTop: 14 }}>
                <span>Health score</span><b>{healthScore}</b>
              </div>
            )}
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--press-ink-3)', margin: '16px 0 0', lineHeight: 1.6 }}>
          % Daily Value against a 2,000 kcal reference. {n && !n.complete ? 'Some values are estimated from recognised ingredients. ' : ''}“—” means we don’t yet have reliable data for that nutrient.
        </p>
      </section>

      {/* ── health benefits ──────────────────────────────────────────── */}
      {benefits.length > 0 && (
        <section id="benefits" style={{ ...sectionStyle, ...blockStyle }}>
          <div className="press-r-sechead">
            <h2>Health benefits</h2>
            <span className="press-r-aside">Derived from this recipe</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', columnGap: 28 }}>
            {benefits.map((b) => (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--press-rule-2)', fontSize: 13.5, color: 'var(--press-ink-2)' }}>
                <span style={{ color: 'var(--press-green)' }}><Ic name="check" size={14} stroke={2} /></span>{b}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── make it yours ────────────────────────────────────────────── */}
      <section id="variants" style={{ ...sectionStyle, ...blockStyle }}>
        <div className="press-r-sechead">
          <h2>Make it yours</h2>
          <span className="press-r-aside">Real recipes, not substitutions</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {VARIANTS.map(([key, label]) => {
            const on = variant === key;
            return (
              <button key={key} type="button" onClick={() => setVariant(on ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 10.5, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', borderRadius: 4, border: `1px solid ${on ? 'var(--press-green)' : 'var(--press-rule)'}`, background: on ? 'var(--press-green)' : 'transparent', color: on ? 'var(--press-paper)' : 'var(--press-ink-2)' }}>
                {on && <Ic name="check" size={13} stroke={2.2} />}{label}
              </button>
            );
          })}
        </div>
        {variant && (
          <div style={{ marginTop: 20 }}>
            {variantsQ.isLoading && <p style={{ fontSize: 13, color: 'var(--press-ink-3)' }}>Finding {VARIANTS.find((v) => v[0] === variant)?.[1].toLowerCase()} options…</p>}
            {variantsQ.data && variantsQ.data.items.length === 0 && <p style={{ fontSize: 13, color: 'var(--press-ink-3)' }}>No close {variantsQ.data.label.toLowerCase()} match found for this dish.</p>}
            {variantsQ.data && variantsQ.data.items.length > 0 && (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--press-ink-2)', margin: '0 0 14px' }}>{variantsQ.data.note}</p>
                <RecipeRail items={variantsQ.data.items} from={location.pathname + location.search} />
              </>
            )}
          </div>
        )}
      </section>

      {/* ── for you ──────────────────────────────────────────────────── */}
      <section id="foryou" style={{ ...sectionStyle, ...blockStyle }}>
        <div className="press-r-sechead">
          <h2>For you</h2>
          <span className="press-r-aside">{r.whyForYou?.personalised ? 'From your blood report' : 'Not personalised yet'}</span>
        </div>
        {r.whyForYou ? (
          <>
            <h3 style={{ margin: '0 0 10px', fontFamily: 'var(--press-serif)', fontWeight: 400, fontSize: 26, lineHeight: 1.2, letterSpacing: '-.01em' }}>{r.whyForYou.headline}</h3>
            <p className="press-note" style={{ maxWidth: '62ch' }}>{r.whyForYou.summary}</p>
            {r.whyForYou.points.length > 0 && (
              <div style={{ marginTop: 18, display: 'grid', gap: 0, maxWidth: '72ch' }}>
                {r.whyForYou.points.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '11px 0', borderBottom: '1px solid var(--press-rule-2)', fontSize: 13.5, lineHeight: 1.6 }}>
                    <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--press-green)', minWidth: 106 }}>{p.label}</span>
                    <span style={{ color: 'var(--press-ink-2)' }}>{p.text}</span>
                  </div>
                ))}
              </div>
            )}
            {r.whyForYou.cites.length > 0 && <p style={{ fontSize: 11, color: 'var(--press-ink-3)', marginTop: 14 }}>Evidence: {r.whyForYou.cites.map((c) => c.label).join(' · ')}</p>}
            {!r.whyForYou.personalised && (
              <Link to="/nutrition/blood" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, minHeight: 44, fontSize: 10.5, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--press-green)', textDecoration: 'none' }}>
                <Ic name="pulse" size={15} /> Connect a blood report
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="press-note" style={{ maxWidth: '58ch' }}>
              Connect a blood report and Together City shows how this recipe reads against your own markers — blood sugar, cholesterol, kidney function.
            </p>
            <Link to="/nutrition/blood" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, minHeight: 44, fontSize: 10.5, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--press-green)', textDecoration: 'none' }}>
              <Ic name="pulse" size={15} /> Connect a blood report
            </Link>
          </>
        )}
      </section>

      {/* ── grocery, by aisle ────────────────────────────────────────── */}
      <section id="grocery" style={{ ...sectionStyle, ...blockStyle }}>
        <div className="press-r-sechead">
          <h2>Grocery list</h2>
          <span className="press-r-aside">Est. {fmtINR(costPerPlate * plates)}</span>
        </div>
        <div className="press-shop">
          {aisles.map(([aisle, items]) => (
            <div className="press-grp" key={aisle}>
              <h4>{aisle}</h4>
              <p>{items.map((it) => <span key={it.name} style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--press-ink-2)' }}>{it.name} <span>{gLabel(it.grams)}</span></span>)}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={toGrocery} disabled={buildCart.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 20, padding: '0 20px', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 10.5, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', borderRadius: 4, border: '1px solid var(--press-ink)', background: added ? 'var(--press-green)' : 'transparent', color: added ? 'var(--press-paper)' : 'var(--press-ink)' }}>
          <Ic name={added ? 'check' : 'plus'} size={14} /> {added ? 'Added — view grocery list' : 'Add all ingredients to grocery'}
        </button>
      </section>

      {/* ── related ──────────────────────────────────────────────────── */}
      {(() => {
        const recs = (others.data ?? []).filter((x) => x.id !== r.id).slice(0, 8);
        if (!recs.length) return null;
        return (
          <section style={blockStyle}>
            <div className="press-r-sechead"><h2>More from the kitchen</h2></div>
            <RecipeRail items={recs} />
          </section>
        );
      })()}

      <p className="press-r-colophon">
        Quantities, cost and nutrition are computed for {plates === 1 ? 'one serving' : `${plates} servings`} from the ingredients above.
      </p>

      {toast && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', background: 'var(--press-ink)', color: 'var(--press-paper)', fontSize: 12, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', padding: '12px 22px', borderRadius: 4, zIndex: 40 }}>{toast}</div>
      )}
    </div>
  );
}

/* ─────────────────────────── the rail ─────────────────────────── */
interface RailItem { id: string; name: string; diet: string; recipeNo?: number | null; imageUrl?: string | null; kcal: number; protein: number; minutes: number }

/**
 * Related dishes, set as a row of plates rather than a row of cards. On paper
 * a cross-reference is a picture and a name — the calorie and time figures
 * stay because they are the two anybody scans for, and they sit in the mono so
 * they line up across the row.
 */
function RecipeRail({ items, from }: { items: RailItem[]; from?: string }) {
  return (
    <div style={{ display: 'flex', gap: 22, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x proximity' }}>
      {items.map((x) => {
        const src = x.imageUrl ?? (x.recipeNo != null ? recipeImageUrl(x.recipeNo) : null);
        return (
          <Link key={x.id} to={`/nutrition/recipes/${x.id}`} state={from ? { from } : undefined}
            style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 190px', scrollSnapAlign: 'start' }}>
            <div className="press-r-plate">
              {src && <img src={src} alt={x.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              <span style={{ position: 'absolute', top: 7, left: 7, background: 'var(--press-paper)', padding: 2, lineHeight: 0 }}><VegMark diet={x.diet} size={13} /></span>
            </div>
            <div style={{ marginTop: 11, fontSize: 14, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.name}</div>
            <div style={{ marginTop: 6, fontFamily: 'var(--press-mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--press-ink-3)' }}>
              {x.kcal} KCAL · {x.protein}G · {x.minutes} MIN
            </div>
          </Link>
        );
      })}
    </div>
  );
}
