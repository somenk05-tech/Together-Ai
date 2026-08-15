import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { useSupplementPlan, type Bucket, type Recommendation } from '@/api/supplements.api';

/**
 * YOUR SUPPLEMENT PLAN.
 *
 * WHAT THIS PAGE USED TO BE. Eight products with a price and a sentence,
 * ordered by a hardcoded `HEALTH = { weightKg: 65 }` that belonged to nobody —
 * and three of the eight were a daily multivitamin, D3+K2 and BCAA/EAA, all
 * three of which the owner's own evidence review puts on its skip list, two of
 * them beside trials that found harm. It was a shop that used the word
 * "recommended". Nothing about it was personal and nothing in it was cited.
 *
 * WHAT IT IS NOW. A read of `GET /fitness/supplements`, which resolves the
 * citizen's blood work (through the medical hub's consent gate), diet,
 * medicines, conditions and goal against a knowledge base built from that
 * review. This file renders the answer and NOTHING ELSE — there is no
 * arithmetic here, no threshold, no dose, no "if low then". Every number and
 * every claim on this screen arrived from the server with a source attached,
 * because a rule enforced in one place is a rule, and a rule enforced in two
 * is a coincidence waiting to end.
 *
 * FOUR BUCKETS, AND THE FOURTH IS THE POINT. Priority, consider, optional —
 * and the things the evidence says NOT to take, with the trial that says so.
 * A supplement screen that can only ever suggest buying something is an
 * advertisement with a chart on it.
 *
 * WHERE THE MONEY WENT. There is no price and no "add to kit" anywhere on this
 * page. Selling is a different act from advising, and a page that does both at
 * once cannot be trusted with the second — the moment a refusal costs revenue,
 * the refusals get quieter. The shelf can come back as its own screen.
 */

const BUCKETS: Array<{ id: Bucket; dot: string; title: string; blurb: string }> = [
  { id: 'priority', dot: '🔴', title: 'Needs attention', blurb: 'Your own data points at a gap here.' },
  { id: 'consider', dot: '🟠', title: 'Worth considering', blurb: 'A reasonable fit for your diet, goal or medicines — not essential.' },
  { id: 'optional', dot: '🟢', title: 'Supporting your goal', blurb: 'May help. Your fundamentals matter more.' },
  { id: 'not-recommended', dot: '⚪', title: 'Mira doesn’t recommend these', blurb: 'The most useful part of this page.' },
];

const FROM_LABEL: Record<string, string> = {
  lab: 'Blood work', diet: 'Diet', goal: 'Goal', fitness: 'Training',
  medicine: 'Medicines', population: 'India', evidence: 'Evidence',
};

const GRADE_LABEL: Record<string, string> = {
  strong: 'Strong evidence', moderate: 'Moderate evidence',
  emerging: 'Emerging — unproven', 'null-or-harm': 'Null or harmful',
};

/** A reason, with the thing it came from named beside it. The tag is the whole
 *  point: "67% of Indian adults" and "your ferritin is 9" are different kinds
 *  of statement, and a page that sets them in the same type is lying by
 *  layout. */
function Why({ from, text, source }: { from: string; text: string; source?: string | null }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0' }}>
      <span style={{
        flex: 'none', minWidth: 78, fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase',
        fontWeight: 700, color: 'var(--muted)', paddingTop: 3,
      }}>{FROM_LABEL[from] ?? from}</span>
      <span style={{ minWidth: 0, fontSize: 14, lineHeight: 1.55 }}>
        {text}
        {source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>{source}</span> : null}
      </span>
    </li>
  );
}

function Card({ r }: { r: Recommendation }) {
  const refused = r.bucket === 'not-recommended';
  return (
    <article className="card rise" style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 17, letterSpacing: '-.02em', color: refused ? 'var(--muted)' : 'var(--ink)' }}>{r.name}</b>
        <span className="muted" style={{ fontSize: 11.5 }}>{GRADE_LABEL[r.grade]}{r.gradeFor ? ` · ${r.gradeFor}` : ''}</span>
        {r.fit && !refused ? (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>
            Personal fit <b style={{ color: 'var(--ink)' }}>{r.fit.score}</b>/100
          </span>
        ) : null}
      </div>

      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {(r.why ?? []).map((w, i) => <Why key={i} from={w.from} text={w.text} source={w.source ?? undefined} />)}
      </ul>

      {/* THE DOSE, OR THE HONEST ABSENCE OF ONE. `dose: null` is not a missing
          value to paper over with a placeholder — it is the engine saying a
          clinician sets this number, and the page says exactly that. */}
      {!refused && (
        <div style={{
          display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12, paddingTop: 12,
          borderTop: '1px solid var(--line-2)',
        }}>
          <span>
            <span className="eyebrow">Dose</span>
            <span style={{ display: 'block', fontSize: 14 }}>
              {r.dose ?? <span className="muted">Set by your doctor — not by this app</span>}
            </span>
          </span>
          {r.form ? <span><span className="eyebrow">Form worth buying</span><span style={{ display: 'block', fontSize: 14 }}>{r.form}</span></span> : null}
          {r.upperLimit ? <span><span className="eyebrow">Upper limit</span><span style={{ display: 'block', fontSize: 14 }}>{r.upperLimit}</span></span> : null}
        </div>
      )}

      {r.testFirst && !refused ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
          A blood test belongs before the first dose here, not after it.
        </p>
      ) : null}

      {r.needsClinician ? (
        <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: 600 }}>
          ⚠︎ Take this one to your doctor before you start.
        </p>
      ) : null}

      {(r.flags ?? []).length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {(r.flags ?? []).map((f, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.55, padding: '9px 11px', background: 'var(--well)', borderRadius: 'var(--r-2)' }}>
              <b style={{ textTransform: 'capitalize' }}>{f.kind === 'harm' ? 'Harm signal' : f.kind}</b> — {f.text}
              {f.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>{f.source}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function Supplements() {
  const q = useSupplementPlan();
  const plan = q.data?.plan ?? [];
  const basis = q.data?.basis;

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Fitness · 07</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Your supplement plan</h1>
          <p className="lede" style={{ marginTop: 6 }}>
            Built from your blood work, your diet, your medicines and your goal — and from an evidence
            review, not a catalogue. About a third of it is what to stop buying.
          </p>
        </div>
      </div>

      {q.isLoading ? <Spinner label="Reading your plan…" /> : q.isError ? (
        <section className="card rise" style={{ padding: '18px 20px' }}>
          <b style={{ display: 'block', fontSize: 16 }}>We couldn’t build your plan</b>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            Nothing has changed and nothing was lost — we just couldn’t reach your health data just now.
            An empty plan here would read as “you need nothing”, which is a claim we haven’t checked.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()}>Try again</button>
        </section>
      ) : (
        <>
          {/* WHAT THIS PLAN WAS BUILT FROM — first, and plainly. A plan made
              without blood work and one made with it are different objects,
              and the citizen is the one who has to be able to tell. */}
          <section className="card rise" style={{ padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <span>
                <span className="eyebrow">Blood work</span>
                <span style={{ display: 'block', fontSize: 14 }}>
                  {basis?.bloodWork?.takenOn
                    ? `Read from your test of ${basis.bloodWork.takenOn}`
                    : <Link to="/medical/blood">Not on file — a test changes most of this</Link>}
                </span>
              </span>
              <span>
                <span className="eyebrow">Medicines checked</span>
                <span style={{ display: 'block', fontSize: 14 }}>{basis?.medicines ?? 0}</span>
              </span>
              {basis?.diet ? <span><span className="eyebrow">Diet</span><span style={{ display: 'block', fontSize: 14, textTransform: 'capitalize' }}>{basis.diet}</span></span> : null}
              {basis?.goal ? <span><span className="eyebrow">Goal</span><span style={{ display: 'block', fontSize: 14, textTransform: 'capitalize' }}>{basis.goal}</span></span> : null}
            </div>
          </section>

          {BUCKETS.map((b) => {
            const items = plan.filter((r) => r.bucket === b.id);
            if (!items.length) return null;
            return (
              <section key={b.id} style={{ marginBottom: 26 }}>
                <div className="blk-head">
                  <h2 style={{ fontSize: 19 }}><span aria-hidden>{b.dot}</span> {b.title}</h2>
                  <span className="muted" style={{ fontSize: 12 }}>{b.blurb}</span>
                </div>
                {items.map((r) => <Card key={r.id} r={r} />)}
              </section>
            );
          })}

          {/* WHAT MIRA IS WATCHING — the tests whose ABSENCE is shaping the
              plan, named before the results exist. This is the honest version
              of a dashboard: it says what would change the answer. */}
          {q.data && (q.data.watching ?? []).length > 0 && (
            <section className="card rise" style={{ padding: '16px 18px', marginBottom: 18 }}>
              <b style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>What Mira is watching</b>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                Not gaps in you — gaps in what this plan was allowed to know.
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {(q.data.watching ?? []).map((w, i) => <Why key={i} from={w.from} text={w.text} source={w.source ?? undefined} />)}
              </ul>
            </section>
          )}

          {q.data && (
            <Fold title="Where all of this came from" meta={`${q.data.source.assessed} supplements assessed`}>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
                <b>{q.data.source.title}</b>
                {q.data.source.reviewed ? ` · reviewed ${q.data.source.reviewed}` : ''}
              </p>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
                {q.data.source.note} Dietary supplements are not pre-approved for safety or effectiveness the
                way medicines are. Every dose on this page is a published range read off that review — this
                app does not calculate a dose for you, and where one is needed it says to ask your doctor.
              </p>
            </Fold>
          )}
        </>
      )}
    </div>
  );
}
