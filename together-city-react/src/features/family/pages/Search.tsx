import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Button, EmptyState, Spinner } from '@/components/ui';
import { useSearchRecipes, useFamilyMembers, useBuildCart } from '@/features/nutrition/hooks';
import { recipeImageUrl } from '@/features/nutrition/recipeImages';
import type { Recipe, DietKey } from '@/features/nutrition/types';
import { useFamily, headcount } from '../members';

/**
 * Search by Ingredients — the FAMILY view of the same real recipe search that
 * powers Nutrition Hub · 10 (`/nutrition/recipes/search`). It queries the live
 * world database by ingredient, then layers on the household context: results
 * respect every member's diet (family-safe toggle → veg-only when any member is
 * vegetarian), lighter dishes are flagged Kid-Friendly, and every recipe is
 * portioned + basketed for the whole household.
 */

const STAPLES = ['onion', 'tomato', 'rice', 'chicken', 'yogurt', 'banana', 'paneer', 'spinach', 'egg', 'oats'];

const VEG_DIETS: DietKey[] = ['veg', 'vegan', 'jain'];
const DIET_LABEL: Record<DietKey, string> = {
  everything: '', veg: 'Veg', vegan: 'Vegan', jain: 'Jain', nonveg: 'Non-veg', pesc: 'Fish', egg: 'Egg',
};

const chipStyle: React.CSSProperties = { cursor: 'pointer' };

/** A recipe card in the family matches grid — photo-led like the individual hub,
 *  but portioned "for N" and basket-ready. */
function FamilyRecipeCard({ r, headN, onBasket, basketing }: { r: Recipe; headN: number; onBasket: () => void; basketing: boolean }) {
  const [imgOk, setImgOk] = useState(true);
  const img = r.imageUrl ?? recipeImageUrl(r.recipeNo);
  const hasImg = Boolean(img) && imgOk;
  const veg = VEG_DIETS.includes(r.diet);
  const kid = r.kcal <= 350; // lighter dish → kid-appropriate
  const dietLbl = DIET_LABEL[r.diet] || (veg ? 'Veg' : 'Non-veg');

  return (
    <div className="pcard card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--well)' }}>
        {hasImg ? (
          <img src={img} alt={r.name} loading="lazy" onError={() => setImgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, opacity: 0.45 }}>🍲</div>
        )}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h4 style={{ marginBottom: 4 }}>{r.name}</h4>
        <p className="meta" style={{ margin: '0 0 6px' }}>
          {r.country} · {r.minutes} min · {dietLbl}
          {kid && <span className="tag green" style={{ marginLeft: 6 }}>Kid-Friendly</span>}
        </p>
        <span className="kcal" style={{ fontWeight: 700 }}>{r.kcal} kcal</span>
        <span className="muted" style={{ fontSize: 11 }}> · {r.gramsPerServing} g/plate · {r.protein}g protein</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12, flexWrap: 'wrap' }}>
          <Link to={`/nutrition/recipes/${r.id}`} className="btn btn-accent btn-sm">Recipe (for {headN})</Link>
          <button type="button" className="btn btn-line btn-sm" onClick={onBasket} disabled={basketing}>
            {basketing ? 'Adding…' : 'Add to Basket'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FamilySearch() {
  const { state } = useFamily();
  const membersQ = useFamilyMembers();
  const members = membersQ.data ?? [];
  const navigate = useNavigate();

  const [ings, setIngs] = useState<string[]>(['paneer', 'spinach']);
  const [safe, setSafe] = useState(true);
  const [draft, setDraft] = useState('');

  // Real household context (falls back to the local family model when the
  // backend household is empty, e.g. a solo user).
  const headN = members.length || headcount(state) || 1;
  const hasVegMember = members.some((m) => VEG_DIETS.includes(m.diet as DietKey));

  // Family-safe → constrain the world search to vegetarian dishes so nothing
  // non-veg reaches a household with vegetarian members.
  const diet: DietKey | undefined = safe && hasVegMember ? 'veg' : undefined;

  const searching = ings.length > 0;
  const search = useSearchRecipes(ings, diet);
  const shown: Recipe[] = useMemo(() => (search.data ?? []).slice(0, 24), [search.data]);
  const busy = searching && search.isLoading;

  const buildCart = useBuildCart();
  const [basketingId, setBasketingId] = useState<string | null>(null);

  const addIng = (v: string) => {
    const t = v.trim().toLowerCase();
    if (t && ings.indexOf(t) < 0) setIngs((x) => [...x, t]);
  };
  const removeIng = (v: string) => setIngs((x) => x.filter((i) => i !== v));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); addIng(draft); setDraft(''); }
  };

  const basketOne = (r: Recipe) => {
    setBasketingId(r.id);
    buildCart.mutate(
      { recipeIds: [r.id], people: headN, mode: 'family' },
      { onSuccess: () => navigate('/family/grocery'), onSettled: () => setBasketingId(null) },
    );
  };
  const basketAll = () => {
    if (!shown.length) return;
    buildCart.mutate(
      { recipeIds: shown.map((r) => r.id), people: headN, mode: 'family' },
      { onSuccess: () => navigate('/family/grocery') },
    );
  };

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 06"
        title="Search by Ingredients"
        sub="Tell us what's in the kitchen — we search the Together City world database and respect every member's diet, flag kid-friendly recipes, and portion ingredients for the whole family." />

      <div className="card" style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {ings.map((ing) => (
            <span key={ing} className="pill" style={chipStyle} onClick={() => removeIng(ing)}>
              {ing}<span style={{ marginLeft: 6, opacity: 0.6 }}>✕</span>
            </span>
          ))}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
            placeholder="Type an ingredient and press Enter…"
            style={{ flex: 1, minWidth: 180, border: '1px solid var(--line)', borderRadius: 999, padding: '12px 18px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }} />
          <Button variant="accent" size="sm" onClick={() => { if (draft.trim()) { addIng(draft); setDraft(''); } }}>Search →</Button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', marginTop: 16 }}>
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Family-safe results only — excludes non-vegetarian dishes for vegetarian members
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <h2>Matches</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {shown.length > 0 && (
                <Button variant="line" size="sm" onClick={basketAll} disabled={buildCart.isPending}>
                  🛒 Family basket ({shown.length})
                </Button>
              )}
              <span className="meta">{shown.length} recipe{shown.length === 1 ? '' : 's'} found</span>
            </div>
          </div>

          {busy ? (
            <Spinner label="Matching your ingredients…" />
          ) : !searching ? (
            <EmptyState title="Add an ingredient to start" hint="Type what's in your kitchen — or tap a staple on the right." />
          ) : search.isError ? (
            // "No recipes use those ingredients — try fewer or different ones"
            // told somebody their kitchen was the problem when the search had
            // simply not run. They would then remove ingredients they have, and
            // get the same answer for the same reason.
            <EmptyState title="That search didn’t reach us" hint="It’s not your ingredients — we couldn’t run the search. Try again in a moment." />
          ) : shown.length === 0 ? (
            <EmptyState title="No recipes use those ingredients" hint="Try fewer or different ingredients." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
              {shown.map((r) => (
                <FamilyRecipeCard key={r.id} r={r} headN={headN}
                  onBasket={() => basketOne(r)} basketing={basketingId === r.id} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Kitchen Staples</h4>
            <div className="pill-row" style={{ marginTop: 12 }}>
              {STAPLES.filter((s) => !ings.includes(s)).map((s) => (
                <span key={s} className="pill" style={chipStyle} onClick={() => addIng(s)}>+ {s}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <h4>Long-Term Memory</h4>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>
              {members.length > 1
                ? <>Cooking for <strong>{headN}</strong>{hasVegMember ? ' — vegetarian members are honoured, so non-veg dishes are auto-excluded while “Family-safe” is on' : ''}. Lighter meals are flagged <span className="tag green">Kid-Friendly</span>.</>
                : <>Dietary needs you set for each family member are remembered — non-veg and high-sugar dishes are auto-excluded for those who need it, and lighter meals are flagged <span className="tag green">Kid-Friendly</span>.</>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
