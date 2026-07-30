import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useRecipe, useRecipes, useBuildCart, useSavedRecipes, useToggleSave, useRecipeVariants } from '../hooks';
import { stepTimerSeconds } from '../components/CookMode';
import { useCookStore } from '../cook.store';
import { DIET_META } from './Recipes';
import { recipeImageUrl } from '../recipeImages';
import { VegMark, dietKind } from '../components/VegMark';
import type { DietKey } from '../types';
import type { RecipeDetail as RecipeDetailT } from '../api';

/* ─────────────────────────── helpers ─────────────────────────── */

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const gLabel = (g: number) => (g <= 0 ? 'To taste' : g < 1 ? '<1 g' : `${g % 1 === 0 ? g : g.toFixed(1)} g`);
const mmss = (s: number) => { const m = Math.round(s / 60); return m >= 1 ? `${m} min` : `${s} sec`; };

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
  flame: 'M13 3c0 3 3 4 3 8a4 4 0 1 1-8 0c0-2 2-3 2-5 0 0 3 1 3-3z',
  leaf: 'M5 20c7 1 14-4 15-16C11 3 4 9 5 20zM9 16c2-4 5-6 8-7',
  wheat: 'M12 21V8M12 10c-2-1-4-1-5 1 2 1 4 1 5-1zM12 10c2-1 4-1 5 1-2 1-4 1-5-1zM12 15c-2-1-4-1-5 1 2 1 4 1 5-1zM12 15c2-1 4-1 5 1-2 1-4 1-5-1z',
  drop: 'M12 3s6 6 6 10a6 6 0 1 1-12 0c0-4 6-10 6-10z',
  sprout: 'M12 21v-7M12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 14c0-3 2-5 5-5 0 3-2 5-5 5z',
  cube: 'M4 8l8-4 8 4-8 4-8-4zM4 8v8l8 4 8-4V8',
  shaker: 'M8 21h8l-1-8H9l-1 8zM9 13V8a3 3 0 0 1 6 0v5M10 5h4',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  shield: 'M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 0 0 0-6',
  star: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  share: 'M12 15V3m0 0L8 7m4-4l4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
  chef: 'M7 21h10M8 21v-4h8v4M6 13a4 4 0 0 1 1-8 4 4 0 0 1 10 0 4 4 0 0 1 1 8H6z',
  scale: 'M12 3v3M7 6h10M6 6l-3 7a3 3 0 0 0 6 0L6 6zM18 6l-3 7a3 3 0 0 0 6 0l-3-7zM9 21h6',
  sparkle: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  pulse: 'M3 12h4l2 5 4-12 2 7h6',
  utensils: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M18 3c-2 0-3 2-3 5s1 4 3 4v9',
  calendar: 'M4 8h16M7 3v3M17 3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  arrowLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  dot: 'M12 12h.01',
};
function Ic({ name, size = 18, stroke = 1.7, style }: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', ...style }} aria-hidden>
      <path d={PATHS[name] ?? PATHS.dot} />
    </svg>
  );
}

/* ─────────────────────────── derived health signals ─────────────────────────── */
interface Nutr { sodiumMg: number; potassiumMg: number; phosphorusMg: number; sugarG: number; addedSugarG: number; satFatG: number; complete: boolean }

function deriveBadges(m: { kcal: number; protein: number; carbs: number; fiber: number }, n?: Nutr): { key: string; label: string; icon: string }[] {
  const out: { key: string; label: string; icon: string }[] = [];
  const pEnergy = m.kcal > 0 ? (m.protein * 4) / m.kcal : 0;
  if (m.protein >= 12 && pEnergy >= 0.2) out.push({ key: 'protein', label: 'High Protein', icon: 'leaf' });
  if (!n) return out;
  if (n.addedSugarG <= 5 && (m.fiber >= 3 || m.carbs <= 30)) out.push({ key: 'diab', label: 'Diabetes Friendly', icon: 'drop' });
  if (n.satFatG <= 5 && n.sodiumMg <= 600) out.push({ key: 'heart', label: 'Heart Healthy', icon: 'heart' });
  if (n.potassiumMg > 0 && n.potassiumMg <= 400 && n.phosphorusMg <= 250 && n.sodiumMg <= 500) out.push({ key: 'kidney', label: 'Kidney Friendly', icon: 'shield' });
  if (n.satFatG <= 6 && n.addedSugarG <= 8) out.push({ key: 'liver', label: 'Liver Friendly', icon: 'sprout' });
  return out;
}

function deriveBenefits(m: { kcal: number; protein: number; fiber: number }, micros: { vitCMg: number } | undefined, badges: { key: string }[]): { label: string; icon: string }[] {
  const has = (k: string) => badges.some((b) => b.key === k);
  const out: { label: string; icon: string }[] = [];
  if (m.kcal <= 400 && m.fiber >= 3) out.push({ label: 'Supports Weight Loss', icon: 'scale' });
  if (has('diab')) out.push({ label: 'Helps Control Blood Sugar', icon: 'drop' });
  if (has('heart')) out.push({ label: 'Heart Healthy', icon: 'heart' });
  if (has('protein')) out.push({ label: 'High Protein', icon: 'leaf' });
  if (m.protein >= 20) out.push({ label: 'Supports Muscle Growth', icon: 'users' });
  if (m.fiber >= 5) out.push({ label: 'Gut Health', icon: 'sprout' });
  if (has('liver')) out.push({ label: 'Good for the Liver', icon: 'sprout' });
  if (has('kidney')) out.push({ label: 'Kidney Friendly', icon: 'shield' });
  if ((micros?.vitCMg ?? 0) >= 20) out.push({ label: 'Healthy Skin (Vitamin C)', icon: 'star' });
  return out;
}

/* ─────────────────────────── small UI atoms ─────────────────────────── */
const TINT: Record<string, string> = { flame: '#c9772e', leaf: 'var(--green)', wheat: '#b08d3e', drop: '#6b7280', sprout: 'var(--green)', cube: '#b76e79', shaker: '#3a6ea5', shield: 'var(--green)', heart: '#b76e79' };

function StatCard({ icon, value, unit, label }: { icon: string; value: string; unit?: string; label: string }) {
  const tint = TINT[icon] ?? 'var(--green)';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, color: tint, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}><Ic name={icon} size={17} /></span>
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1 }}>{value}{unit && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}> {unit}</span>}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

function NutriBar({ label, value, unit, dv }: { label: string; value: number | null; unit: string; dv: number }) {
  const known = value != null && value > 0;
  const pct = known ? Math.min(100, Math.round((value / dv) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '108px 1fr 64px', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{label}</span>
      <span style={{ height: 6, borderRadius: 4, background: 'var(--paper)', overflow: 'hidden', display: 'block' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 4 }} />
      </span>
      <span style={{ fontSize: 12.5, textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {known ? <>{value % 1 === 0 ? value : value.toFixed(1)}{unit} <span style={{ color: 'var(--muted)' }}>· {pct}%</span></> : <span style={{ color: 'var(--muted)' }}>—</span>}
      </span>
    </div>
  );
}

/** Calorie donut with macro segments. */
function Donut({ kcal, p, c, f }: { kcal: number; p: number; c: number; f: number }) {
  const pk = p * 4, ck = c * 4, fk = f * 9; const tot = pk + ck + fk || 1;
  const R = 46, C = 2 * Math.PI * R; let off = 0;
  const segs = [{ v: ck, col: '#c79a3a' }, { v: pk, col: 'var(--green)' }, { v: fk, col: '#6b7280' }];
  return (
    <svg width="132" height="132" viewBox="0 0 120 120" role="img" aria-label={`${kcal} calories`}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="12" />
      {segs.map((s, i) => { const dash = (s.v / tot) * C; const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={s.col} strokeWidth="12" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += dash; return el; })}
      <text x="60" y="56" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--ink)">{kcal}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="11" fill="var(--muted)">Calories</text>
    </svg>
  );
}

/* ─────────────────────────── active-section tabs ─────────────────────────── */
const TABS = [['overview', 'Overview'], ['ingredients', 'Ingredients'], ['directions', 'Directions'], ['nutrition', 'Nutrition'], ['benefits', 'Health Benefits'], ['variants', 'Make it Yours'], ['foryou', 'For You']] as const;
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

  const sectionStyle: React.CSSProperties = { scrollMarginTop: 84 };
  const cardStyle: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 22, padding: 24, boxShadow: 'var(--shadow)' };
  const h2: React.CSSProperties = { fontSize: 19, margin: 0, letterSpacing: '-.01em', fontWeight: 700 };

  const aislesMap = new Map<string, typeof scaledIngredients>();
  for (const ing of scaledIngredients) { if (ing.grams <= 0) continue; const k = aisleFor(ing.name); (aislesMap.get(k) ?? aislesMap.set(k, []).get(k)!).push(ing); }
  const aisleOrder = ['Vegetables', 'Fruits', 'Protein', 'Dairy', 'Grains', 'Spices', 'Pantry'];
  const aisles = [...aislesMap.entries()].sort((a, b) => aisleOrder.indexOf(a[0]) - aisleOrder.indexOf(b[0]));

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '18px 16px 72px' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button type="button" onClick={() => (cameFrom ? navigate(-1) : navigate('/nutrition/recipes'))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink-soft)', fontWeight: 600 }}>
          <Ic name="arrowLeft" size={18} /> Back to Recipes
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={toggleSave} aria-pressed={saved}
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line)', background: saved ? 'var(--green-soft)' : 'var(--card)', color: saved ? 'var(--green)' : 'var(--ink-soft)' }}>
            <Ic name="bookmark" size={16} style={saved ? { fill: 'var(--green)' } : undefined} /> {saved ? 'Saved' : 'Save Recipe'}
          </button>
          <button type="button" onClick={() => void share()} aria-label="Share recipe"
            style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, cursor: 'pointer', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}>
            <Ic name="share" size={16} />
          </button>
        </div>
      </div>

      {/* HERO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: 28, alignItems: 'start' }} className="tc-recipe-hero">
        <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 24, overflow: 'hidden', background: `linear-gradient(140deg, ${meta.color}14, ${meta.color}30)`, boxShadow: 'var(--shadow)' }}>
          {heroSrc && heroOk
            ? <img src={heroSrc} alt={r.name} loading="lazy" onError={() => setHeroOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: meta.color }}><Ic name="utensils" size={44} stroke={1.4} /></div>}
        </div>
        <div>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.02em', margin: '2px 0 8px', fontWeight: 700 }}>{r.name}</h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
            {r.whyForYou?.summary ?? `A ${meta.label.toLowerCase()} ${r.country} recipe, ready in about ${r.minutes} minutes.`}
          </p>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', color: 'var(--ink-soft)', fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><VegMark diet={r.diet} size={16} /> {dietKind(r.diet) === 'nonveg' ? 'Non-veg' : dietKind(r.diet) === 'egg' ? 'Egg' : 'Veg'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="users" size={17} /> {plates} serving{plates > 1 ? 's' : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="clock" size={17} /> {r.minutes} min</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="flame" size={17} /> {m.kcal} kcal</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="scale" size={17} /> {difficultyFor(r.minutes)}</span>
          </div>

          {badges.length > 0 && (
            <div style={{ marginTop: 18, background: 'var(--green-soft)', borderRadius: 18, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--green)', fontWeight: 700, fontSize: 14 }}><Ic name="leaf" size={17} /> Great choice for you</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {badges.map((b) => (
                  <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-soft)' }}>
                    <span style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 999, background: 'var(--green)', color: '#fff' }}><Ic name="check" size={12} stroke={2.4} /></span>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {caution && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fbf6ec', border: '1px solid #efe1c4', borderRadius: 14, padding: '12px 16px' }}>
              <span style={{ fontSize: 13, color: 'var(--gold-ink)', lineHeight: 1.45 }}>Matches your taste, but higher in {caution}. Your Optimal Health plan picks a lighter option.</span>
              <Link to="/nutrition?mode=optimal" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--green)', textDecoration: 'none', whiteSpace: 'nowrap' }}><Ic name="sparkle" size={15} /> View optimal version</Link>
            </div>
          )}
        </div>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 12, marginTop: 26 }} className="tc-recipe-stats">
        <StatCard icon="flame" value={`${m.kcal}`} label="Calories" />
        <StatCard icon="leaf" value={`${m.protein}`} unit="g" label="Protein" />
        <StatCard icon="wheat" value={`${m.carbs}`} unit="g" label="Carbs" />
        <StatCard icon="drop" value={`${m.fat}`} unit="g" label="Fat" />
        <StatCard icon="sprout" value={`${m.fiber}`} unit="g" label="Fibre" />
        <StatCard icon="cube" value={n ? `${n.sugarG}` : '—'} unit={n ? 'g' : undefined} label="Sugar" />
        <StatCard icon="shaker" value={n ? `${n.sodiumMg}` : '—'} unit={n ? 'mg' : undefined} label="Sodium" />
        <StatCard icon="shield" value={healthScore != null ? `${healthScore}` : '—'} label="Health Score" />
      </div>

      {/* STICKY TABS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'color-mix(in srgb, var(--card) 88%, transparent)', backdropFilter: 'saturate(1.4) blur(10px)', WebkitBackdropFilter: 'saturate(1.4) blur(10px)', borderBottom: '1px solid var(--line)', margin: '26px 0 0' }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(([tid, label]) => {
            const on = active === tid;
            return (
              <button key={tid} type="button" onClick={() => document.getElementById(tid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ position: 'relative', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 500, color: on ? 'var(--green)' : 'var(--muted)', padding: '13px 14px', whiteSpace: 'nowrap' }}>
                {label}
                {on && <span style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 2, background: 'var(--green)' }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* OVERVIEW + INGREDIENTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, marginTop: 22 }} className="tc-recipe-two">
        <section id="overview" style={{ ...sectionStyle, ...cardStyle }}>
          <h2 style={h2}>About this recipe</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '10px 0 18px' }}>
            {r.whyForYou?.summary ?? `A ${meta.label.toLowerCase()} recipe from ${r.country}, balanced for everyday eating.`}
          </p>
          <div style={{ display: 'grid', gap: 2 }}>
            {([['clock', 'Time', `${r.minutes} min`], ['utensils', 'Cuisine', r.country], ['leaf', 'Diet', meta.label], ['scale', 'Difficulty', difficultyFor(r.minutes)], ['users', 'Suitable for', badges.length ? badges.map((b) => b.label).join(', ') : 'Everyday meals']] as const).map(([ic, k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)', fontSize: 14 }}>
                <span style={{ color: 'var(--muted)' }}><Ic name={ic} size={17} /></span>
                <span style={{ color: 'var(--muted)', minWidth: 92 }}>{k}</span>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            {r.method && r.method.length > 0 && (
              <button type="button" onClick={() => startCooking({ name: r.name, ingredients: scaledIngredients, method: r.method!, cookSteps: r.cookSteps })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '11px 18px', borderRadius: 12, border: 'none', background: 'var(--green)', color: '#fff' }}>
                <Ic name="chef" size={17} /> Cook Mode
              </button>
            )}
            <button type="button" onClick={toGrocery} disabled={buildCart.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}>
              <Ic name="plus" size={16} /> {added ? 'Added to grocery' : 'Add to Grocery List'}
            </button>
            <button type="button" onClick={toggleSave}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}>
              <Ic name="bookmark" size={16} /> {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        <section id="ingredients" style={{ ...sectionStyle, ...cardStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <h2 style={h2}>Ingredients</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 10px' }}>
              <select value={plates} onChange={(e) => setPlates(Number(e.target.value))} aria-label="Servings"
                style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', outline: 'none' }}>
                {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c} serving{c > 1 ? 's' : ''}</option>)}
              </select>
            </label>
          </div>
          <div>
            {scaledIngredients.map((ing) => (
              <div key={ing.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: 'var(--paper)', color: 'var(--green)', fontSize: 14, fontWeight: 700, flex: '0 0 auto', textTransform: 'uppercase' }}>{ing.name.trim().charAt(0)}</span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>{ing.name}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{gLabel(ing.grams)}{ing.priceInr > 0 ? ` · ${fmtINR(ing.priceInr)}` : ''}</span>
                <button type="button" onClick={toGrocery} aria-label={`Add ${ing.name} to grocery list`}
                  style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${added ? 'var(--green)' : 'var(--line)'}`, background: added ? 'var(--green)' : 'var(--card)', color: added ? '#fff' : 'var(--green)', cursor: 'pointer', flex: '0 0 auto' }}>
                  <Ic name={added ? 'check' : 'plus'} size={15} stroke={2.2} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Est. grocery cost <strong style={{ color: 'var(--ink)' }}>{fmtINR(costPerPlate * plates)}</strong> {perPlate}</span>
            <button type="button" onClick={toGrocery} disabled={buildCart.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '9px 15px', borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff' }}>
              <Ic name="plus" size={15} /> Add all
            </button>
          </div>
        </section>
      </div>

      {/* DIRECTIONS */}
      {r.method && r.method.length > 0 && (
        <section id="directions" style={{ ...sectionStyle, ...cardStyle, marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
            <h2 style={h2}>Directions</h2>
            <button type="button" onClick={() => startCooking({ name: r.name, ingredients: scaledIngredients, method: r.method!, cookSteps: r.cookSteps })}
              style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '9px 15px', borderRadius: 10, border: '1px solid var(--green)', background: 'var(--card)', color: 'var(--green)' }}>
              <Ic name="chef" size={16} /> Cook Mode
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>Cook Mode reads each step aloud, keeps the screen awake, and times the steps that need it.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {r.method.map((step, i) => {
              const secs = r.cookSteps?.[i]?.durationSec ?? stepTimerSeconds(step);
              const isDone = done.has(i);
              return (
                <button key={i} type="button" onClick={() => setDone((s) => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x; })}
                  style={{ display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'inherit', background: isDone ? 'var(--green-soft)' : 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, flex: '0 0 auto', fontSize: 13, fontWeight: 700, background: isDone ? 'var(--green)' : 'var(--card)', color: isDone ? '#fff' : 'var(--ink-soft)', border: isDone ? 'none' : '1px solid var(--line)' }}>
                    {isDone ? <Ic name="check" size={15} stroke={2.4} /> : i + 1}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink)', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>{step}</span>
                    {secs > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 10, fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-soft)', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}><Ic name="clock" size={12} /> {mmss(secs)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* NUTRITION */}
      <section id="nutrition" style={{ ...sectionStyle, ...cardStyle, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={h2}>Nutrition</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{perPlate}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 26, alignItems: 'center', marginTop: 16 }} className="tc-recipe-nutri">
          <div style={{ display: 'grid', placeItems: 'center' }}><Donut kcal={m.kcal} p={m.protein} c={m.carbs} f={m.fat} /></div>
          <div>
            <NutriBar label="Protein" value={m.protein} unit="g" dv={DV.protein} />
            <NutriBar label="Carbohydrates" value={m.carbs} unit="g" dv={DV.carbs} />
            <NutriBar label="Fat" value={m.fat} unit="g" dv={DV.fat} />
            <NutriBar label="Fibre" value={m.fiber} unit="g" dv={DV.fiber} />
            {n && <NutriBar label="Sugar" value={n.sugarG} unit="g" dv={DV.sugar} />}
            {n && <NutriBar label="Saturated fat" value={n.satFatG} unit="g" dv={DV.satFat} />}
            {n && <NutriBar label="Sodium" value={n.sodiumMg} unit="mg" dv={DV.sodium} />}
            {n && n.potassiumMg > 0 && <NutriBar label="Potassium" value={n.potassiumMg} unit="mg" dv={DV.potassium} />}
            {mic && <NutriBar label="Iron" value={mic.ironMg > 0 ? mic.ironMg : null} unit="mg" dv={DV.iron} />}
            {mic && <NutriBar label="Calcium" value={mic.calciumMg > 0 ? mic.calciumMg : null} unit="mg" dv={DV.calcium} />}
            {mic && <NutriBar label="Vitamin C" value={mic.vitCMg > 0 ? mic.vitCMg : null} unit="mg" dv={DV.vitC} />}
            {mic && <NutriBar label="Vitamin D" value={mic.vitDUg > 0 ? mic.vitDUg : null} unit="µg" dv={DV.vitD} />}
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.5 }}>
          % Daily Value based on a 2,000 kcal reference. {n && !n.complete ? 'Some values are estimated from recognised ingredients. ' : ''}“—” means we don’t yet have reliable data for that nutrient.
        </p>
      </section>

      {/* HEALTH BENEFITS */}
      {benefits.length > 0 && (
        <section id="benefits" style={{ ...sectionStyle, ...cardStyle, marginTop: 20 }}>
          <h2 style={h2}>Health Benefits</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 16px' }}>Derived from this recipe’s calories, protein, fibre and computed nutrients.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {benefits.map((b) => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, border: '1.5px solid var(--green)', color: 'var(--green)', flex: '0 0 auto' }}><Ic name={b.icon} size={18} /></span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{b.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MAKE IT YOURS — one-tap variants (real matching recipes) */}
      <section id="variants" style={{ ...sectionStyle, ...cardStyle, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 9, background: 'var(--green-soft)', color: 'var(--green)', flex: '0 0 auto' }}><Ic name="sparkle" size={18} /></span>
          <div><h2 style={h2}>Make it yours</h2><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>One tap finds real recipes that match — nutrition stays accurate.</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {VARIANTS.map(([key, label]) => {
            const on = variant === key;
            return (
              <button key={key} type="button" onClick={() => setVariant(on ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${on ? 'var(--green)' : 'var(--line)'}`, background: on ? 'var(--green)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-soft)' }}>
                {on && <Ic name="check" size={14} stroke={2.4} />}{label}
              </button>
            );
          })}
        </div>
        {variant && (
          <div style={{ marginTop: 18 }}>
            {variantsQ.isLoading && <div style={{ fontSize: 13.5, color: 'var(--muted)', padding: '8px 0' }}>Finding {VARIANTS.find((v) => v[0] === variant)?.[1].toLowerCase()} options…</div>}
            {variantsQ.data && variantsQ.data.items.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--muted)', padding: '8px 0' }}>No close {variantsQ.data.label.toLowerCase()} match found for this dish.</div>}
            {variantsQ.data && variantsQ.data.items.length > 0 && (
              <>
                <div style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>{variantsQ.data.note}</div>
                <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x proximity' }}>
                  {variantsQ.data.items.map((x) => {
                    const mm = DIET_META[x.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
                    const src = x.imageUrl ?? recipeImageUrl(x.recipeNo);
                    return (
                      <Link key={x.id} to={`/nutrition/recipes/${x.id}`} state={{ from: location.pathname + location.search }} style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 230px', scrollSnapAlign: 'start' }}>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                          <div style={{ aspectRatio: '16 / 9', background: `linear-gradient(140deg, ${mm.color}14, ${mm.color}30)`, position: 'relative' }}>
                            {src && <img src={src} alt={x.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}><VegMark diet={x.diet} size={14} /></span>
                          </div>
                          <div style={{ padding: 14 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.name}</div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="flame" size={13} /> {x.kcal}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="leaf" size={13} /> {x.protein}g</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="clock" size={13} /> {x.minutes}m</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* FOR YOU — blood-marker intelligence (from whyForYou) */}
      <section id="foryou" style={{ ...sectionStyle, marginTop: 20 }}>
        {r.whyForYou ? (
          <div style={{ ...cardStyle, background: r.whyForYou.personalised ? 'linear-gradient(180deg, var(--green-soft), var(--card))' : 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: 'var(--green)', color: '#fff', flex: '0 0 auto' }}><Ic name="pulse" size={18} /></span>
              <div>
                <h2 style={h2}>{r.whyForYou.headline}</h2>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{r.whyForYou.personalised ? 'Personalised from your blood report' : 'Connect a blood report to personalise this'}</div>
              </div>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0' }}>{r.whyForYou.summary}</p>
            {r.whyForYou.points.length > 0 && (
              <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                {r.whyForYou.points.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 999, background: 'var(--green)', color: '#fff', flex: '0 0 auto', marginTop: 1 }}><Ic name="check" size={13} stroke={2.4} /></span>
                    <span style={{ fontSize: 14, lineHeight: 1.55 }}><strong style={{ color: 'var(--green)' }}>{p.label}.</strong> <span style={{ color: 'var(--ink-soft)' }}>{p.text}</span></span>
                  </div>
                ))}
              </div>
            )}
            {r.whyForYou.cites.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 14 }}>Evidence: {r.whyForYou.cites.map((c) => c.label).join(' · ')}</p>}
            {!r.whyForYou.personalised && (
              <Link to="/nutrition/blood" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 13.5, fontWeight: 700, color: 'var(--green)', textDecoration: 'none' }}>Connect blood report →</Link>
            )}
          </div>
        ) : (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: 'var(--green-soft)', color: 'var(--green)', marginBottom: 10 }}><Ic name="pulse" size={22} /></span>
            <h2 style={h2}>See how this affects your blood markers</h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 14px', maxWidth: 460, marginInline: 'auto', lineHeight: 1.55 }}>Connect a blood report and Together City shows how this recipe supports markers like blood sugar, cholesterol and kidney function.</p>
            <Link to="/nutrition/blood" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--green)', textDecoration: 'none' }}>Connect blood report →</Link>
          </div>
        )}
      </section>

      {/* GROCERY — grouped */}
      <section style={{ ...cardStyle, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <h2 style={h2}>Grocery list</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Est. <strong style={{ color: 'var(--ink)' }}>{fmtINR(costPerPlate * plates)}</strong></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginTop: 8 }}>
          {aisles.map(([aisle, items]) => (
            <div key={aisle}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>{aisle}</div>
              {items.map((it) => <div key={it.name} style={{ fontSize: 13.5, color: 'var(--ink-soft)', padding: '3px 0' }}>{it.name} <span style={{ color: 'var(--muted)' }}>· {gLabel(it.grams)}</span></div>)}
            </div>
          ))}
        </div>
        <button type="button" onClick={toGrocery} disabled={buildCart.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--green)', color: '#fff', marginTop: 18 }}>
          <Ic name="plus" size={16} /> {added ? 'Added — view grocery list' : 'Add all ingredients to grocery'}
        </button>
      </section>

      {/* RELATED */}
      {(() => {
        const recs = (others.data ?? []).filter((x) => x.id !== r.id).slice(0, 8);
        if (!recs.length) return null;
        return (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ ...h2, marginBottom: 14 }}>Related recipes</h2>
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x proximity' }}>
              {recs.map((x) => {
                const mm = DIET_META[x.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
                const src = x.imageUrl ?? recipeImageUrl(x.recipeNo);
                return (
                  <Link key={x.id} to={`/nutrition/recipes/${x.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 230px', scrollSnapAlign: 'start' }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                      <div style={{ aspectRatio: '16 / 9', background: `linear-gradient(140deg, ${mm.color}14, ${mm.color}30)`, position: 'relative' }}>
                        {src && <img src={src} alt={x.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}><VegMark diet={x.diet} size={14} /></span>
                      </div>
                      <div style={{ padding: 14 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.name}</div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="flame" size={13} /> {x.kcal}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="leaf" size={13} /> {x.protein}g</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="clock" size={13} /> {x.minutes}m</span>
                          {x.healthPercent ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic name="shield" size={13} /> {Math.round(x.healthPercent)}</span> : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}

      {toast && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', fontSize: 13.5, fontWeight: 600, padding: '11px 20px', borderRadius: 999, boxShadow: 'var(--shadow-deep)', zIndex: 40 }}>{toast}</div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tc-recipe-hero { grid-template-columns: 1fr !important; gap: 18px !important; }
          .tc-recipe-two { grid-template-columns: 1fr !important; }
          .tc-recipe-stats { grid-template-columns: repeat(4, 1fr) !important; }
          .tc-recipe-nutri { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .tc-recipe-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
