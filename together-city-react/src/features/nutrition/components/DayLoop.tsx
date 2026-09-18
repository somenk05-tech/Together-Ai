import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { VegMark } from './VegMark';
import type { Advice, DayRead, DayTarget, NutrientLine, ProteinFix, Recommended } from '../day.api';

/**
 * BUILD YOUR DAY — the loop, drawn.
 *
 * Four pieces, top to bottom on the page: the target (what the day is
 * measured against, and what kind of number each figure is), the reading
 * (what is on the day against that target, one line per nutrient), what to
 * eat now (three plates chosen to close the gaps, at the portion that fits),
 * and the advice (the sentences under the numbers, with the fixes computed).
 *
 * Nothing here computes. Every figure and every sentence arrives from
 * /nutrition/day, so the page cannot say one thing in the header and another
 * in the advice — they are the same object.
 */

const n = (v: number | null | undefined, d = 0): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: d }) : '—';

/* ── the target ─────────────────────────────────────────────────────────── */

export function DayTargetHead({ t }: { t: DayTarget }) {
  return (
    <section className="byd-target" aria-labelledby="byd-target-h">
      <div className="byd-eyebrow" id="byd-target-h">Your daily target</div>
      <dl className="byd-target-row">
        <div><dd>{n(t.kcal)}<small>kcal</small></dd><dt>{t.estimate ? 'Estimated energy budget' : 'Energy budget'}</dt></div>
        <div><dd>{n(t.protein)}<small>g</small></dd><dt>Protein · target</dt></div>
        <div><dd>{n(t.carb)}<small>g</small></dd><dt>Carbohydrate · range</dt></div>
        <div><dd>{n(t.fat)}<small>g</small></dd><dt>Fat · range</dt></div>
        <div><dd>{n(t.fiber)}<small>g</small></dd><dt>Fibre · target</dt></div>
      </dl>
      <p className="byd-basis">
        {t.basis}
        {t.estimate && ' This is an estimate: '}
        {t.estimate && t.readiness && !t.readiness.ok && t.readiness.missing?.length
          ? <>we do not have your {t.readiness.missing.map((m) => m.label.toLowerCase()).join(', ')} yet — <Link to={t.readiness.missing[0].href}>add it</Link> and the figures become yours.</>
          : t.estimate ? 'some of your body details are not on file yet, so a reference body stands in for them.' : null}
      </p>
    </section>
  );
}

/* ── the reading ────────────────────────────────────────────────────────── */

function tone(l: NutrientLine): string {
  if (l.status === 'ok') return 'is-ok';
  if (l.kind === 'budget' || l.kind === 'range') return l.status === 'over' ? 'is-over' : 'is-under';
  return 'is-under';
}

export function DayLines({ lines, next, priorities }: { lines: NutrientLine[]; next: string; priorities: DayRead['priorities'] }) {
  return (
    <section className="byd-lines" aria-labelledby="byd-lines-h">
      <div className="byd-eyebrow" id="byd-lines-h">Your day</div>
      <div className="byd-line-list">
        {lines.map((l) => {
          const width = l.target > 0 ? Math.max(0, Math.min(100, (l.eaten / l.target) * 100)) : 0;
          return (
            <div className={`byd-line ${tone(l)}`} key={l.key}>
              <span className="byd-line-label">{l.label}<small>{l.kindLabel}{l.kind === 'range' && l.low != null ? ` · ${n(l.low)}–${n(l.high)}${l.unit === 'kcal' ? ' kcal' : ' g'}` : ''}</small></span>
              <span className="byd-line-fig">{n(l.eaten)} <em>/ {n(l.target)}{l.unit === 'kcal' ? ' kcal' : ' g'}</em></span>
              <span className="byd-line-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
              <span className="byd-line-said">{l.said}</span>
            </div>
          );
        })}
      </div>
      <p className="byd-next">
        <strong>What to do next.</strong> {next}
        {priorities.length > 0 && (
          <span className="byd-pri">{priorities.map((p) => <span key={p.key}>{p.label}</span>)}</span>
        )}
      </p>
    </section>
  );
}

/* ── what should I eat now ──────────────────────────────────────────────── */

export function EatNow({ read, onAdd, busy }: {
  read: DayRead;
  onAdd: (recipeId: string, portionPct: number) => void;
  busy: boolean;
}) {
  const r = read.remaining;
  const filled = read.day?.meals ?? [];
  return (
    <section className="byd-now" aria-labelledby="byd-now-h">
      <div className="byd-now-head">
        <div>
          <div className="byd-eyebrow" id="byd-now-h">What should I eat now?</div>
          <h2 className="byd-now-title">{read.nextSlot.label}{read.live && read.nextSlot.open ? ' · now' : ''}</h2>
        </div>
        <div className="byd-now-state">
          {filled.length > 0 && (
            <div className="byd-eaten">
              {filled.map((m) => <span key={m.slot}>{m.label} ✓</span>)}
            </div>
          )}
          <div className="byd-remaining">
            <span><b>{r.kcal <= 0 ? '0' : n(r.kcal)}</b> kcal{r.kcal < 0 ? ' (over)' : ''}</span>
            <span><b>{Math.max(0, r.protein)}</b> g protein</span>
            <span><b>{Math.max(0, r.fiber)}</b> g fibre</span>
            <small>remaining</small>
          </div>
        </div>
      </div>

      {read.recommend.length === 0 ? (
        <p className="byd-muted">Nothing in the database fits this course under your profile. Try a search below, or add what you ate.</p>
      ) : (
        <div className="byd-recs">
          {read.recommend.map((c) => <RecCard key={c.recipeId} c={c} onAdd={() => onAdd(c.recipeId, c.portionPct)} busy={busy} />)}
        </div>
      )}
    </section>
  );
}

function RecCard({ c, onAdd, busy }: { c: Recommended; onAdd: () => void; busy: boolean }) {
  return (
    <article className="byd-rec">
      <figure className="byd-rec-fig">
        {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : <figcaption>{c.name}</figcaption>}
      </figure>
      <div className="byd-rec-body">
        <h3 className="byd-rec-name"><VegMark diet={c.diet} size={14} /><Link to={`/nutrition/recipes/${c.recipeId}`}>{c.name}</Link></h3>
        <div className="byd-rec-macros">{n(c.kcal)} kcal · {n(c.protein)} g protein · {n(c.fiber)} g fibre</div>
        <div className="byd-rec-portion">
          <span>Your portion</span>
          <b>{n(c.grams)} g{c.portionPct < 100 ? ` · ${c.portionPct}% of a serving` : ''}</b>
        </div>
        <p className="byd-rec-why"><span>Why?</span> {c.why}</p>
        <Button variant="accent" size="sm" disabled={busy} onClick={onAdd}>{busy ? 'Adding…' : 'Add to today'}</Button>
      </div>
    </article>
  );
}

/* ── the advice ─────────────────────────────────────────────────────────── */

export function AdviceList({ advice, onQuickAdd, busy }: {
  advice: Advice[];
  onQuickAdd: (fix: ProteinFix) => void;
  busy: boolean;
}) {
  return (
    <section className="byd-advice" aria-label="What the numbers mean">
      {advice.map((a, i) => (
        <article className={`byd-adv is-${a.kind}`} key={`${a.kind}-${i}`}>
          <h3>{a.headline}</h3>
          <p>{a.body}</p>
          {a.options && (
            <ul className="byd-options">{a.options.map((o) => <li key={o}>{o}</li>)}</ul>
          )}
          {a.fixes && a.fixes.length > 0 && (
            <div className="byd-fixes">
              <div className="byd-fixes-head"><span>Quick fixes</span><span>≈ protein</span><span>≈ kcal</span><span /></div>
              {a.fixes.map((f) => (
                <div className={`byd-fix${f.kind === 'supplement' ? ' is-supplement' : ''}`} key={f.name}>
                  <span className="byd-fix-name">{f.name} <small>{f.amount}{f.kind === 'supplement' ? ' · another option' : ''}</small></span>
                  <span className="byd-fix-n">{f.proteinG} g{f.closes ? ' ✓' : ''}</span>
                  <span className="byd-fix-n">{f.kcal}</span>
                  <button type="button" disabled={busy} onClick={() => onQuickAdd(f)}>Add to today</button>
                </div>
              ))}
            </div>
          )}
          {a.priorities && a.priorities.length > 0 && (a.kind === 'fat' || a.kind === 'carbs' || a.kind === 'over-budget') && (
            <p className="byd-adv-pri">For your next meal we are prioritising: {a.priorities.map((p) => ({ protein: 'Protein ↑', fibre: 'Fibre ↑', 'lower-fat': 'Lower fat', 'lower-carb': 'Lower carbohydrate', light: 'Light' }[p])).join(' · ')}</p>
          )}
        </article>
      ))}
    </section>
  );
}
