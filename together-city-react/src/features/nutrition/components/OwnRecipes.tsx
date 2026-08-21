import { useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  useMyRecipes, useSaveOwnRecipe, useDeleteOwnRecipe,
  type MyRecipe, type OwnIngredient, type OwnRecipeInput,
} from '../own.api';

/**
 * Your own recipes — the add form and everything you have added.
 *
 * A COMPONENT, not a page, since 1 Aug. It used to be /nutrition/recipes/own,
 * a second destination for a thing the library page was already inviting you to
 * do ("Cook something that isn't in here? Add your own recipe →"). Building a
 * plan meant bouncing between two screens; now the library page adds and lists
 * in place, and the old URL redirects so shared links still work.
 *
 * Two things this screen will not do, and both are the point.
 *
 * It does not ask what diet the dish is. The server reads that off the
 * ingredients, because these recipes go into the AI planner's pool and a
 * label somebody typed could put chicken in front of a vegetarian.
 *
 * It does not invent nutrition. The server works it out from the ingredients
 * and says how much of the dish it recognised. When it cannot recognise
 * enough, it says so and asks for the numbers rather than saving a dish
 * confidently recorded as nothing.
 */

const SLOTS: Array<{ key: OwnRecipeInput['slot']; label: string }> = [
  { key: 'b', label: 'Breakfast' }, { key: 'l', label: 'Lunch' },
  { key: 's', label: 'Snack' }, { key: 'd', label: 'Dinner' },
];

const inputS: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)',
  borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
};
const labelS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5 };
const rowS: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 110px 44px', gap: 8, alignItems: 'end', marginBottom: 8 };

const EMPTY: OwnRecipeInput = {
  name: '', country: 'Home', slot: 'l', minutes: 30, servings: 2,
  ingredients: [{ name: '', grams: 100 }], steps: [],
};

function DietTag({ diet }: { diet: string }) {
  return <span className="tag" style={{ textTransform: 'capitalize' }}>{diet === 'jainvegan' ? 'Jain + vegan' : diet}</span>;
}

export function OwnRecipes() {
  const mine = useMyRecipes();
  const save = useSaveOwnRecipe();
  const remove = useDeleteOwnRecipe();

  const [form, setForm] = useState<OwnRecipeInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [numbers, setNumbers] = useState({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  const [saved, setSaved] = useState<{ name: string; notes: string[]; source: string; coverage: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);

  const set = <K extends keyof OwnRecipeInput>(k: K, v: OwnRecipeInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setIngredient = (i: number, patch: Partial<OwnIngredient>) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));

  const reset = () => {
    setForm(EMPTY); setEditing(null); setShowNumbers(false);
    setNumbers({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  };

  const numbersComplete = Object.values(numbers).every((v) => v.trim() !== '' && Number.isFinite(Number(v)));
  const ready = form.name.trim().length >= 2
    && form.ingredients.some((i) => i.name.trim() && i.grams > 0)
    && (!showNumbers || numbersComplete);

  const submit = () => {
    setError(null); setSaved(null);
    const input: OwnRecipeInput = {
      ...form,
      name: form.name.trim(),
      country: form.country.trim() || 'Home',
      ingredients: form.ingredients.filter((i) => i.name.trim() && i.grams > 0).map((i) => ({ name: i.name.trim(), grams: i.grams })),
      ...(showNumbers && numbersComplete
        ? { nutrition: {
            kcal: Math.round(Number(numbers.kcal)), protein: Number(numbers.protein),
            carbs: Number(numbers.carbs), fat: Number(numbers.fat), fiber: Number(numbers.fiber),
          } }
        : {}),
    };
    save.mutate({ id: editing ?? undefined, input }, {
      onSuccess: (res) => {
        setSaved({ name: res.recipe.name, notes: res.notes, source: res.recipe.nutritionSource, coverage: res.recipe.coveragePct });
        reset();
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg ?? 'That didn’t save. Your recipe is still here — try again.');
        // The commonest refusal is "we can't read enough of these ingredients",
        // and the answer to it is the numbers box, so open it rather than making
        // them find it.
        if (msg && /nutrition/i.test(msg)) setShowNumbers(true);
      },
    });
  };

  const edit = (r: MyRecipe) => {
    // The ingredient list is not on the card, so editing starts from what we
    // can honestly restore and asks for the rest rather than inventing rows.
    setEditing(r.id);
    setForm({
      name: r.name, country: r.country, slot: (r.slot as OwnRecipeInput['slot']) ?? 'l',
      minutes: r.minutes, servings: 2, ingredients: [{ name: '', grams: 100 }], steps: [],
    });
    setSaved(null); setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section id="your-own-recipes" style={{ marginTop: 34, borderTop: '1px solid var(--line)', paddingTop: 26 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>Your own recipes</h2>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 4px', lineHeight: 1.6 }}>
        Add a dish you cook. List what goes in it and how much, and we’ll work out the calories and
        macros the same way we do for every recipe in the library — from the ingredients, not from a
        number anybody typed.
      </p>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px', lineHeight: 1.6 }}>
        Your recipes are yours alone. Nobody else can see them, and they can turn up in your own
        weekly plan alongside everything else.
      </p>

      {saved && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Saved — {saved.name}</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.6 }}>
            {saved.source === 'author'
              ? 'Using the figures you entered. They’re marked as yours wherever this dish appears.'
              : `Worked out from your ingredients — we recognised ${saved.coverage}% of them by weight.`}
          </p>
          {saved.notes.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              {saved.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </Card>
      )}

      <Card style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{editing ? 'Edit a recipe' : 'Add a recipe'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
          <label><span style={labelS}>What is it called?</span>
            <input style={inputS} value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ma’s tomato rice" /></label>
          <label><span style={labelS}>Cuisine</span>
            <input style={inputS} value={form.country} maxLength={60} onChange={(e) => set('country', e.target.value)} placeholder="Home" /></label>
          <label><span style={labelS}>Usually eaten as</span>
            <select aria-label="Usually eaten as" style={inputS} value={form.slot} onChange={(e) => set('slot', e.target.value as OwnRecipeInput['slot'])}>
              {SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select></label>
          <label><span style={labelS}>Minutes to cook</span>
            <input style={inputS} type="number" min={1} max={600} value={form.minutes} onChange={(e) => set('minutes', Number(e.target.value) || 1)} /></label>
          <label><span style={labelS}>Serves how many</span>
            <input style={inputS} type="number" min={1} max={20} value={form.servings} onChange={(e) => set('servings', Number(e.target.value) || 1)} /></label>
        </div>

        <div style={{ marginBottom: 6 }}>
          <span style={labelS}>What goes in it, and how much</span>
          <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>
            Weights for the whole dish, not per plate — we divide by the servings above.
          </p>
        </div>
        {form.ingredients.map((ing, i) => (
          <div key={i} style={rowS}>
            <input style={inputS} value={ing.name} maxLength={80} aria-label={`Ingredient ${i + 1}`}
              placeholder="e.g. toor dal" onChange={(e) => setIngredient(i, { name: e.target.value })} />
            <input style={inputS} type="number" min={1} max={5000} value={ing.grams} aria-label={`Grams of ingredient ${i + 1}`}
              onChange={(e) => setIngredient(i, { grams: Number(e.target.value) || 0 })} />
            <button type="button" aria-label={`Remove ingredient ${i + 1}`}
              disabled={form.ingredients.length === 1}
              onClick={() => set('ingredients', form.ingredients.filter((_, k) => k !== i))}
              style={{ minHeight: 44, minWidth: 44, border: '1px solid var(--line)', borderRadius: 'var(--r-1)', background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', opacity: form.ingredients.length === 1 ? 0.4 : 1 }}>×</button>
          </div>
        ))}
        <Button variant="line" size="sm" onClick={() => set('ingredients', [...form.ingredients, { name: '', grams: 100 }])}>+ Another ingredient</Button>

        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {!showNumbers ? (
            <>
              <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px', lineHeight: 1.6 }}>
                We’ll work the nutrition out from the list above. If you have the figures from a
                packet or a recipe card and would rather use those, you can.
              </p>
              <Button variant="line" size="sm" onClick={() => setShowNumbers(true)}>Enter the nutrition myself</Button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <span style={labelS}>Your figures, for the whole dish</span>
                <button type="button" onClick={() => { setShowNumbers(false); setNumbers({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' }); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  Work it out from the ingredients instead
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginTop: 8 }}>
                {([['kcal', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'], ['fiber', 'Fibre (g)']] as const).map(([k, l]) => (
                  <label key={k}><span style={labelS}>{l}</span>
                    <input style={inputS} type="number" min={0} value={numbers[k]}
                      onChange={(e) => setNumbers((n) => ({ ...n, [k]: e.target.value }))} /></label>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
                All five, or none — three real numbers beside two blanks would be worse than none at
                all. We’ll still check them against your ingredients and tell you if they look far off.
              </p>
            </>
          )}
        </div>

        {error && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <Button variant="accent" disabled={!ready || save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save this recipe'}
          </Button>
          {editing && <Button variant="line" onClick={reset}>Cancel</Button>}
        </div>
      </Card>

      <h2 style={{ fontSize: 20, marginBottom: 10 }}>What you’ve added</h2>
      {mine.isLoading && <Spinner label="Loading your recipes…" />}
      {mine.isError && <EmptyState title="Couldn’t load your recipes" hint="Check your connection and reload." />}
      {!mine.isLoading && !mine.isError && (mine.data ?? []).length === 0 && (
        <EmptyState icon="🍲" title="Nothing yet" hint="Add the first dish above — it’ll show up here, in the library, and in your weekly plan." />
      )}

      {/* Laid out by meal, in the weekly planner's language — the same section
          captions and the same responsive card grid. These dishes end up in
          that planner, so a dish should not look like one thing here and
          another thing there. A slot with nothing in it is not drawn: an empty
          "DINNER" heading states an absence nobody asked about. */}
      {SLOTS.map(({ key, label }) => {
        const inSlot = (mine.data ?? []).filter((r) => (r.slot || 'l') === key);
        if (!inSlot.length) return null;
        return (
          <div key={key} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
              {label} · {inSlot.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {inSlot.map((r) => (
                <Card key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.country} · {r.minutes} min · {r.gramsPerServing} g/plate · <DietTag diet={r.diet} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                    <span><strong>{r.kcal}</strong> kcal</span><span>P {r.protein}g</span><span>C {r.carbs}g</span><span>F {r.fat}g</span><span>Fibre {r.fiber}g</span>
                  </div>
                  <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                    {r.nutritionSource === 'author'
                      ? 'Figures you entered.'
                      : `Worked out from your ingredients (${r.coveragePct}% recognised).`}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <Button variant="line" size="sm" onClick={() => edit(r)}>Edit</Button>
                    <Button variant="line" size="sm" disabled={remove.isPending}
                      onClick={() => remove.mutate(r.id, { onSuccess: (res) => setRemoved(res.note) })}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
      {removed && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>{removed}</p>
      )}
      {remove.isError && (
        <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          {(remove.error as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'That didn’t delete. Try again.'}
        </p>
      )}
    </section>
  );
}
