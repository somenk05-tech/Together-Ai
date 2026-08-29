import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { useMultivitaminAssessment, type Assessment, type AssessmentState } from '@/api/supplements.api';

/**
 * THE MULTIVITAMIN ASSESSMENT.
 *
 * A different question from the plan page, and it is worth naming the
 * difference at the top of the file so nobody merges the two screens later.
 * The plan asks "what, if anything, should this citizen take". This asks: of
 * the multivitamins actually sold in India, does ANY of them have enough
 * evidence, an appropriate dose, acceptable safety and enough personal fit to
 * be worth considering — and why not, for the ones that don't.
 *
 * THE HONEST ANSWER IS USUALLY NONE, and this page is built to say that
 * clearly rather than to bury it. Pooled across 78 randomised trials and
 * 715,526 participants, multivitamins do not reliably reduce chronic disease
 * risk. That is where every card starts, and a product has to argue upwards
 * from it.
 *
 * ── THREE THINGS THIS PAGE DOES THAT THE CATEGORY DOES NOT ────────────────
 *
 * 1. IT SHOWS THREE SCORES AND NEVER ADDS THEM UP. Evidence, personal fit and
 *    safety answer different questions and routinely disagree — a well-made
 *    product can be badly suited to one person and dangerous to another. One
 *    combined number would hide exactly the disagreement worth reading, so
 *    there is no total on this page and the layout has nowhere to put one.
 *
 * 2. IT SAYS WHERE A PRODUCT SITS AGAINST INDIAN FOOD LAW, which is a
 *    separate question from whether it is safe. India caps a health supplement
 *    at one ICMR requirement, far below any toxicity ceiling — so a product
 *    can be perfectly harmless and still, on its composition, not be a food.
 *    Two of the products here are above that line and sold on food pages
 *    anyway. The card says both sentences and does not blend them.
 *
 * 3. IT REFUSES TO ASSESS WHAT NOBODY WILL DESCRIBE. Eleven of the products
 *    publish no quantified composition at all — including both retailer house
 *    brands, on the same platform that publishes the best composition data in
 *    India for everybody else's products. Those are on the page, named, with
 *    what would settle it. A product this city cannot describe is a product it
 *    will not recommend, and saying so is more useful than leaving it out.
 *
 * NOTHING HERE IS PURCHASABLE. No bag, no price that leads anywhere, no Add.
 * The plan page may sell what it recommends precisely because it can never
 * sell what it refuses — that asymmetry is what stops a refusal getting
 * quieter when it costs money. This screen is almost entirely refusals, so it
 * carries no till at all.
 *
 * AND NO ARITHMETIC HAPPENS IN THIS FILE. Every percentage, ceiling, band and
 * verdict arrived from the server with its source attached.
 */

const STATES: Array<{ id: AssessmentState; dot: string; title: string; blurb: string }> = [
  { id: 'appropriate', dot: '🟢', title: 'Appropriate', blurb: 'Evidence, formulation, fit and safety all hold.' },
  { id: 'may-be-considered', dot: '🟡', title: 'May be considered', blurb: 'A reasonable case, and an incomplete one.' },
  { id: 'test-first', dot: '🔵', title: 'Test first', blurb: 'The answer genuinely depends on a number nobody has.' },
  { id: 'no-clear-benefit', dot: '⚪', title: 'No clear benefit', blurb: 'Nothing in it meets anything known about you. That is a finding, not a gap.' },
  { id: 'clinician-review', dot: '🔴', title: 'Clinician review', blurb: 'An interaction, a contraindication, a dose above a ceiling, or a risk this page cannot assess.' },
];

const BAND_LABEL: Record<string, string> = {
  token: 'Token',
  nutritional: 'Nutritional',
  'above-indian-ceiling': 'Above the Indian ceiling',
  'above-upper-limit': 'Above the upper limit',
  unknown: 'No Indian figure',
};

/** A score with its parts open. The parts are not a disclosure obligation —
 *  they are the score. A number nobody can take apart is a number nobody
 *  should trust, which is the same reason the plan page shows its reasons. */
function ScoreBar({ label, score, of }: { label: string; score: { value: number; parts?: Array<{ label: string; note: string }> }; of: string }) {
  return (
    <div style={{ minWidth: 0, flex: '1 1 190px' }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <b style={{ fontSize: 20, letterSpacing: '-.02em' }}>{score.value}</b>
        <span className="muted" style={{ fontSize: 12 }}>/ 10</span>
      </div>
      <span className="muted" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>{of}</span>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {(score.parts ?? []).map((p, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, paddingBottom: 6 }}>
            <b style={{ fontWeight: 600 }}>{p.label}. </b>
            <span className="muted">{p.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ a }: { a: Assessment }) {
  const dim = a.state === 'no-clear-benefit' || a.state === 'clinician-review';
  const hard = (a.flags ?? []).filter((f) => f.hard);
  return (
    <article className="card rise" style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="eyebrow">{a.brand}</span>
        <b style={{ fontSize: 17, letterSpacing: '-.02em', color: dim ? 'var(--muted)' : 'var(--ink)' }}>{a.productName}</b>
      </div>

      {/* THE HARD FLAGS FIRST, BEFORE ANYTHING ELSE ON THE CARD. A smoker
          reading about beta-carotene should not have to get past three scores
          to find the sentence that matters. */}
      {hard.map((f, i) => (
        <p key={i} style={{
          fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 0', padding: '10px 12px',
          border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', background: 'var(--well)',
        }}>
          {f.text}
          {f.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 4 }}>{f.source}</span> : null}
        </p>
      ))}

      {/* THREE SCORES, SIDE BY SIDE, WITH NO TOTAL UNDER THEM. */}
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
        <ScoreBar label="Evidence" score={a.evidence} of="For this formulation, from a category whose own trials came back null." />
        <ScoreBar label="Personal fit" score={a.personalFit} of="How strongly that applies to you, from your results." />
        <ScoreBar label="Safety" score={a.safety} of="Against your medicines, conditions and what you already take." />
      </div>

      {a.regulatory && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
          <span className="eyebrow">Where it sits in Indian law</span>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0' }}>{a.regulatory.text}</p>
          {(a.regulatory.exceedances ?? []).length > 0 && (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(a.regulatory.exceedances ?? []).map((e) => (
                <li key={e.nutrientId} className="tag" style={{ fontSize: 10.5 }}>
                  {e.name} {e.amount}{e.unit} · {e.times}×
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(a.whyNot ?? []).length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
          <span className="eyebrow">Why not, or why not more strongly</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {(a.whyNot ?? []).map((w, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, paddingBottom: 6 }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {((a.missing ?? []).length > 0 || (a.wouldSettle ?? []).length > 0) && (
        <Fold title="What this city doesn’t know, and what would settle it">
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {(a.missing ?? []).map((m, i) => <li key={i} className="muted" style={{ fontSize: 13, lineHeight: 1.6, paddingBottom: 5 }}>{m}</li>)}
          </ul>
          {(a.wouldSettle ?? []).map((w, i) => (
            <p key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>{w}</p>
          ))}
        </Fold>
      )}

      {(a.doses ?? []).length > 0 && (
        <Fold title="Every dose in it, against the Indian requirement" meta={`${(a.doses ?? []).length} nutrients`}>
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {(a.doses ?? []).map((d) => (
              <li key={d.nutrientId} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--line-2)' }}>
                <b style={{ fontSize: 13, fontWeight: 600, minWidth: 130 }}>{d.name}</b>
                <span style={{ fontSize: 13 }}>{d.amount} {d.unit}</span>
                <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto', textAlign: 'right' }}>
                  {BAND_LABEL[d.band.band] ?? d.band.band}
                  {d.band.pctOfRequirement !== null ? ` · ${d.band.pctOfRequirement}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {(a.monitoring ?? []).length > 0 && (
        <Fold title="If you did take it — the monitoring that would go with it">
          {(a.monitoring ?? []).map((m) => (
            <div key={m.nutrientId} style={{ marginTop: 12 }}>
              <b style={{ fontSize: 14 }}>{m.name}</b>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '4px 0 0' }}>
                {m.baselineTest ? <>Baseline: {m.baselineTest}. </> : <>No usable individual blood marker. </>}
                {m.alongside ? <>{m.alongside} </> : null}
                {m.initialWeeks
                  ? <>Retest after {m.initialWeeks[0]}–{m.initialWeeks[1]} weeks. {m.initialWhy}</>
                  : <>No retest, because {m.retestSource}. {m.insteadWatch ? `Watch instead: ${m.insteadWatch}` : ''}</>}
              </p>
              {(m.afterRetest ?? []).length > 0 && (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {(m.afterRetest ?? []).map((r, i) => (
                    <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, paddingBottom: 5 }}>
                      <b style={{ fontWeight: 600 }}>{r.outcome} → </b><span className="muted">{r.then}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(m.stopRules ?? []).length > 0 && (
                <>
                  <span className="eyebrow" style={{ display: 'block', marginTop: 8 }}>Stop or reassess if</span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {(m.stopRules ?? []).map((s, i) => <li key={i} className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, paddingBottom: 4 }}>{s}</li>)}
                  </ul>
                </>
              )}
            </div>
          ))}
        </Fold>
      )}
    </article>
  );
}

export function Multivitamins() {
  const q = useMultivitaminAssessment();
  const assessments = q.data?.assessments ?? [];
  /* THE GATE IS THE SERVER'S DECISION. The `assessments.length` half is not a
     second opinion — it is the same fact arriving on an older API build, where
     an empty list is the only thing to go on. */
  const gated = Boolean(q.data && (q.data.gated ?? assessments.length === 0));
  const interlock = q.data?.interlock;

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Fitness · 06</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Multivitamins, assessed</h1>
          <p className="lede" style={{ marginTop: 6 }}>
            Thirty-two products sold in India, read against their own labels — what is in them, whether
            the dose means anything, where they sit against Indian food law, and whether any of it has
            anything to do with you. Nothing on this page is for sale.
          </p>
        </div>
      </div>

      {q.isLoading && <Spinner />}
      {q.isError && (
        <section className="card rise" style={{ padding: '22px 24px' }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>This didn’t load</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
            The assessment reads your blood work through the medical hub’s consent gate, and that read
            failed. Nothing is being hidden from you — there is simply nothing to show until it works.
          </p>
        </section>
      )}

      {q.data && (
        <>
          {/* THE VERDICT, FIRST AND UNDECORATED. It is computed rather than
              written, and it is very often "none" — which is the whole point
              of building this rather than a shelf. */}
          <section className="card rise" style={{ padding: '22px 24px', marginBottom: 18 }}>
            <span className="eyebrow">The answer</span>
            <p style={{ fontSize: 16, lineHeight: 1.65, margin: '8px 0 0', maxWidth: '68ch' }}>{q.data.verdict}</p>
          </section>

          {/* THE BIOTIN INTERLOCK, ABOVE EVERYTHING IT WOULD RUIN. This is not
              a footnote: a hair supplement at 10,000 mcg makes B12 read high
              and ferritin read low in the same draw, and neither result looks
              wrong. It goes before the list of tests, because after them it is
              advice nobody acts on. */}
          {interlock && interlock.blocked && (
            <section className="card rise" style={{ padding: '18px 20px', marginBottom: 18 }}>
              <span className="eyebrow">Before you book any blood test</span>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: '8px 0 0', maxWidth: '68ch' }}>{interlock.text}</p>
              {interlock.source ? <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{interlock.source}</p> : null}
            </section>
          )}

          {gated ? (
            <section className="card rise" style={{ padding: '22px 24px' }}>
              <span className="eyebrow">Blood work</span>
              <h2 style={{ fontSize: 22, margin: '6px 0 0' }}>Nothing is assessed until something is measured</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: '10px 0 0', maxWidth: '64ch' }}>{q.data.gateText}</p>

              {(q.data.watching ?? []).length > 0 && (
                <>
                  <span className="eyebrow" style={{ display: 'block', marginTop: 18 }}>What a test would settle</span>
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                    {(q.data.watching ?? []).map((w) => (
                      <li key={w.marker} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0' }}>
                        <span style={{
                          flex: 'none', minWidth: 130, fontSize: 11, letterSpacing: '.04em',
                          fontWeight: 700, paddingTop: 2,
                        }}>{w.marker}</span>
                        <span className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>{w.why}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <Link className="btn" to="/medical/blood">Add a blood test</Link>
                <Link className="btn btn-sm" to="/fitness/supplements">Your supplement plan</Link>
              </div>
            </section>
          ) : (
            STATES.map((s) => {
              const rows = assessments.filter((a) => a.state === s.id);
              if (rows.length === 0) return null;
              return (
                <section key={s.id} style={{ marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span aria-hidden style={{ fontSize: 13 }}>{s.dot}</span>
                    <h2 style={{ fontSize: 19, margin: 0, letterSpacing: '-.02em' }}>{s.title}</h2>
                    <span className="muted" style={{ fontSize: 12.5 }}>{s.blurb}</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{rows.length}</span>
                  </div>
                  {rows.map((a) => <Card key={a.formulationId} a={a} />)}
                </section>
              );
            })
          )}

          {/* WHAT THE SURVEY FOUND ABOUT THE MARKET, kept apart from what it
              found about the reader. A fact about India is not a finding about
              you, and a page that sets them in the same type is lying by
              layout — the same rule the plan page enforces on its reasons. */}
          {(q.data.category ?? []).length > 0 && (
            <Fold title="What the survey found about the category" meta="Not about you">
              {(q.data.category ?? []).map((c, i) => (
                <div key={i} style={{ marginTop: 12 }}>
                  <b style={{ fontSize: 14, lineHeight: 1.5 }}>{c.finding}</b>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '4px 0 0' }}>{c.detail}</p>
                </div>
              ))}
            </Fold>
          )}

          {(q.data.trialLength ?? []).length > 0 && (
            <Fold title="How long before “it didn’t work” is a conclusion" meta="Outcomes with no blood test">
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
                The minimum honest trial is set by the turnover time of the tissue, or by how often the
                thing being counted happens. Twenty-eight days for skin. About a hundred and twenty for a
                red cell and for the hair cycle. A whole season for an infection count. Any product
                promising a thirty-day verdict on hair or immunity is promising something the biology
                cannot deliver.
              </p>
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {(q.data.trialLength ?? []).map((t) => (
                  <li key={t.outcome} style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                    <b style={{ fontSize: 13.5 }}>{t.outcome}</b>
                    <span className="muted" style={{ fontSize: 12.5 }}> · {t.weeks[0] === t.weeks[1] ? `${t.weeks[0]} weeks` : `${t.weeks[0]}–${t.weeks[1]} weeks`}</span>
                    <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '3px 0 0' }}>{t.note}</p>
                    <p className="muted" style={{ fontSize: 11.5, margin: '3px 0 0' }}>{t.source}</p>
                  </li>
                ))}
              </ul>
            </Fold>
          )}

          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.65, marginTop: 22, maxWidth: '70ch' }}>
            Compositions were read from retailer and brand product-detail panels on 29 August 2026, not
            from photographs of labels — so a chemical form the panel dropped is missing here too, and
            formulations change. Where a product publishes nothing, this page says so rather than
            guessing. Nothing here is a dose, a diagnosis, or a substitute for the doctor who ordered
            your test. Together City takes no cut of anything named on this page, and nothing on it can
            be bought from it.
          </p>
        </>
      )}
    </div>
  );
}
