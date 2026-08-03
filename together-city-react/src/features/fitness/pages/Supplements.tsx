import { useMemo, useState } from 'react';
import { Button, Tag } from '@/components/ui';

type Priority = 'core' | 'goal' | 'opt';
interface Supp { id: string; ic: string; hue: number; name: string; pri: Priority; price: number; why: string; dose: string }

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// Local body profile (defaults mirror the static site; Nutrition profile would override in a fuller build).
const HEALTH = { weightKg: 65, goal: 'maintain' as 'lose' | 'maintain' | 'gain' };

const GOAL_LABEL: Record<string, string> = { gain: 'Muscle gain', lose: 'Fat loss & tone', maintain: 'Maintain & stay strong' };

/** Supplements — sports & recovery supplements matched to your training goal, with a build-your-kit rail. */
export function Supplements() {
  const ppk = HEALTH.goal === 'gain' ? 1.8 : HEALTH.goal === 'lose' ? 1.6 : 1.4;
  const proteinTarget = Math.round(ppk * HEALTH.weightKg);
  const goalLabel = GOAL_LABEL[HEALTH.goal] ?? 'General fitness';

  const supps = useMemo<Supp[]>(() => {
    const base: Supp[] = [
      { id: 'whey', ic: '🥛', hue: 210, name: 'Whey Protein Isolate', pri: 'core', price: 2499, why: `Fast-absorbing protein to help hit your ${proteinTarget} g/day target and recover after training.`, dose: '1 scoop (~24 g protein) post-workout or as needed' },
      { id: 'creatine', ic: '💪', hue: 20, name: 'Creatine Monohydrate', pri: 'goal', price: 899, why: 'The most-researched supplement for strength, power and lean-muscle gains.', dose: '3–5 g daily, any time' },
      { id: 'multi', ic: '💊', hue: 280, name: 'Daily Multivitamin', pri: 'core', price: 599, why: 'Covers micronutrient gaps that training and calorie control can create.', dose: '1 tablet with breakfast' },
      { id: 'omega', ic: '🐟', hue: 190, name: 'Omega-3 Fish Oil', pri: 'core', price: 749, why: 'EPA/DHA for joint comfort, recovery and heart health.', dose: '1–2 g daily with a meal' },
      { id: 'd3', ic: '☀️', hue: 45, name: 'Vitamin D3 + K2', pri: 'goal', price: 499, why: 'Supports bone strength, immunity and muscle function — commonly low in India.', dose: '1 capsule daily with fat' },
      { id: 'electro', ic: '🧂', hue: 170, name: 'Electrolyte Hydration', pri: 'goal', price: 399, why: 'Replaces sodium, potassium & magnesium lost in sweat during your workout + walk.', dose: '1 sachet in water around training' },
      { id: 'bcaa', ic: '🧬', hue: 330, name: 'BCAA / EAA', pri: 'opt', price: 1199, why: 'Essential aminos to reduce soreness on harder or fasted sessions.', dose: '1 serving intra-workout (optional)' },
      { id: 'mag', ic: '🌙', hue: 250, name: 'Magnesium Glycinate', pri: 'opt', price: 549, why: 'Aids muscle relaxation, recovery and sleep quality.', dose: '200–400 mg in the evening' },
    ];
    if (HEALTH.goal === 'gain') { const c = base.find((x) => x.id === 'creatine'); if (c) c.pri = 'core'; }
    if (HEALTH.goal === 'lose') { const e = base.find((x) => x.id === 'electro'); if (e) e.pri = 'core'; }
    return base;
  }, [proteinTarget]);

  const [kit, setKit] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setKit((k) => { const n = { ...k }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  const kitItems = supps.filter((s) => kit[s.id]);
  const subtotal = kitItems.reduce((s, x) => s + x.price, 0);

  const priBadge = (p: Priority) => {
    const cfg: Record<Priority, { bg: string; c: string; l: string }> = {
      core: { bg: 'var(--ok-soft)', c: 'var(--ok-ink)', l: 'Essential' },
      goal: { bg: 'var(--accent-soft)', c: 'var(--accent)', l: 'For your goal' },
      opt: { bg: 'var(--line)', c: 'var(--ink-soft)', l: 'Optional' },
    };
    const s = cfg[p];
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.c }}>{s.l}</span>;
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow">Fitness · 02</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Supplements</h1>
        <p className="lede" style={{ marginTop: 6 }}>Sports &amp; recovery supplements matched to your training goal — protein to hit your target, plus the essentials for strength, recovery and daily health.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div><div className="eyebrow">Your goal</div><div style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{goalLabel}</div></div>
          <div>
            <div className="eyebrow">Daily protein target</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{proteinTarget} g</div>
            <span className="muted" style={{ fontSize: 11 }}>≈ {ppk} g/kg · {HEALTH.weightKg} kg</span>
          </div>
          <div>
            <div className="eyebrow">Whey tops up</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>~{Math.max(1, Math.round((proteinTarget * 0.25) / 24))} scoop/day</div>
            <span className="muted" style={{ fontSize: 11 }}>if food falls short</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Set from your body profile — adjust weight & goal in Nutrition and this updates.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 26, alignItems: 'start' }}>
        <section>
          <div className="blk-head"><h2>Recommended for you</h2><span className="muted" style={{ fontSize: 12 }}>{goalLabel}</span></div>
          {supps.map((s) => {
            const on = !!kit[s.id];
            return (
              <div key={s.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: `hsl(${s.hue},46%,92%)`, color: `hsl(${s.hue},50%,40%)` }}>{s.ic}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h4 style={{ margin: 0, fontSize: 15 }}>{s.name}</h4>{priBadge(s.pri)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 4px', lineHeight: 1.5 }}>{s.why}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>◈ {s.dose}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{inr(s.price)}</span>
                  <Button variant={on ? 'line' : 'accent'} size="sm" onClick={() => toggle(s.id)}>{on ? '✓ In kit — remove' : 'Add to kit'}</Button>
                </div>
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, background: 'var(--accent-soft)', borderRadius: 10, padding: '11px 14px' }}>
            <b>Not medical advice.</b> These are general wellness suggestions. Check with your doctor or a registered dietitian before starting any supplement — especially if pregnant, nursing, on medication, or managing a health condition. Protein needs can usually be met with food first.
          </p>
        </section>

        <aside style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)' }}>
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>Your supplement kit</h4>
            {kitItems.length === 0
              ? <p className="muted" style={{ fontSize: 12.5 }}>Your kit is empty. Add the essentials for your goal.</p>
              : (
                <>
                  {kitItems.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                      <span>{s.ic} {s.name}</span>
                      <b style={{ marginLeft: 'auto' }}>{inr(s.price)}</b>
                      <button type="button" onClick={() => toggle(s.id)} aria-label="Remove" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--serif)', fontSize: 18, borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 8 }}>
                    <span>Total</span><span>{inr(subtotal)}</span>
                  </div>
                  <Button variant="accent" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>Proceed to checkout →</Button>
                  <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Auto-refill every 30 days · cancel anytime</p>
                </>
              )}
          </div>
        </aside>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 0' }}>
        <Tag>◈ Third-party Tested</Tag><Tag>◈ Goal-matched</Tag><Tag>◈ Synced to Fitness</Tag><Tag>◈ Auto-refill available</Tag>
      </div>
    </div>
  );
}
