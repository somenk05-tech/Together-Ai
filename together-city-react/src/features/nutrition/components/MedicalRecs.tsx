import { useState } from 'react';
import { Button } from '@/components/ui';
import { useMedicalRecs, useDecideMedicalRec } from '../hooks';

/**
 * WHAT THE NUMBER MEASURES, IN ITS OWN NAME (28 Aug audit).
 *
 * "Glucose-control score: 80% → 86%" reads as a clinical outcome. Measured, the
 * six points were the chip `Lentils & Dal` being added to a preference list:
 * `diabetesScore` starts at 92 and subtracts only for which protein checkboxes
 * are ticked. It reads no marker, no portion, no calorie and nothing the person
 * eats — tick two more legume chips on the same blood panel and the same
 * citizen's "glucose control" reads 92.
 *
 * As a MEAL-PLAN QUALITY heuristic that is defensible, and it is what the
 * function's own comment calls it. Two of these five names already said "meal
 * quality"; the other three now do too, and the row below says what is being
 * compared rather than promising an improvement in the person.
 */
const SCORE_LABEL: Record<string, string> = {
  ckd: 'kidney-friendly',
  cholesterol: 'cholesterol-friendly',
  diabetes: 'blood-sugar-friendly',
  fattyLiver: 'liver-friendly',
  uricAcid: 'uric-acid-friendly',
};

/**
 * Medical Nutrition Recommendation cards — shown above the meal plan when a
 * condition's guidelines conflict with the user's selected preferences.
 * The user stays in control: one-tap Apply, or Keep My Preferences with a
 * respectful acknowledgement. Decided cards never reappear (no nagging).
 */
export function MedicalRecs() {
  const recs = useMedicalRecs();
  const decide = useDecideMedicalRec();
  const [ack, setAck] = useState<string | null>(null);

  const cards = recs.data?.cards ?? [];
  if (!cards.length && !ack) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
      {ack && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}>{ack}</p>
        </div>
      )}
      {cards.map((c) => (
        <div key={c.condition} className="card" style={{ borderLeft: '4px solid var(--danger-ink)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 17 }}>{c.icon}</span>
            <h3 style={{ margin: 0, fontSize: 17 }}>{c.title}</h3>
          </div>
          {/* The basis first, because it is the fact — and the card is only
              worth reading once you know whether a lab or a checkbox put it
              there. Then the caveat, which the server sends on every card so
              this screen cannot be the one that drops it. */}
          <p className="mn-basis">{c.basis}</p>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px', lineHeight: 1.5 }}>{c.intro}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {c.recs.map((r) => (
              <div key={r.key} style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{r.applyable ? '🟢' : '✓'}</span>{' '}
                <b>{r.label}</b>
                <div className="muted" style={{ fontSize: 11.5, marginLeft: 22, lineHeight: 1.45 }}>{r.reason}</div>
              </div>
            ))}
          </div>

          {c.scoreAfter > c.scoreBefore && (
            <div style={{ marginTop: 12, padding: '9px 12px', background: 'var(--paper)', borderRadius: 'var(--r-1)', fontSize: 12.5 }}>
              <span className="muted">
                How well your food preferences match {SCORE_LABEL[c.condition] ?? 'the'} guidance:
              </span>{' '}
              <b>{c.scoreBefore}%</b> → <b style={{ color: 'var(--accent-ink)' }}>{c.scoreAfter}%</b>
              <div className="muted mn-scope">Scores your saved preferences, not your health.</div>
            </div>
          )}

          <p className="muted mn-caveat">{c.caveat}</p>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button variant="accent" size="sm" disabled={decide.isPending}
              onClick={() => decide.mutate({ condition: c.condition, choice: 'apply' }, { onSuccess: (r) => setAck(r.message) })}>
              Apply Recommendations
            </Button>
            <Button variant="line" size="sm" disabled={decide.isPending}
              onClick={() => decide.mutate({ condition: c.condition, choice: 'keep' }, { onSuccess: (r) => setAck(r.message) })}>
              Keep My Preferences
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
