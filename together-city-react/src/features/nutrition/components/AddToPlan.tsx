import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useWeeklyPlan, useSetMeal } from '../hooks';

const SLOTS: Array<[string, string]> = [['b', 'Breakfast'], ['l', 'Lunch'], ['s', 'Snack'], ['d', 'Dinner']];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const selectS: React.CSSProperties = {
  padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10,
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
};

/**
 * Put this dish in your week.
 *
 * The day list comes from the saved plan rather than from a calendar, so it can
 * only offer days that actually exist in the block the citizen is following.
 * Anything the server did with reservations — a dish outside their diet, a
 * lunch dish landing on a dinner — comes back as a warning and is shown. The
 * one thing that does not come back is an allergen: that is refused server-side
 * and arrives here as an error, because it is the only thing in this hub that
 * can put somebody in hospital.
 */
export function AddToPlan({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const plan = useWeeklyPlan();
  const setMeal = useSetMeal();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState('l');
  const [done, setDone] = useState<{ warnings: string[] } | null>(null);

  const wk = plan.data;
  const days = wk?.days ?? [];
  const planKey = wk?.key ?? '';

  if (plan.isLoading) return null;
  if (!planKey || days.length === 0) {
    return (
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Add this to your week</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px', lineHeight: 1.6 }}>
          You don’t have a plan yet, so there’s nowhere to put it. Build one and this dish can go
          straight into a day.
        </p>
        <Link to="/nutrition/weekly"><Button variant="line" size="sm">Open the weekly planner →</Button></Link>
      </Card>
    );
  }

  const errorMessage = setMeal.isError
    ? ((setMeal.error as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? 'That didn’t go through. Try again.')
    : null;

  return (
    <Card style={{ marginTop: 16 }}>
      {!open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Add this to your week</div>
          <Button variant="accent" size="sm" style={{ marginLeft: 'auto' }} onClick={() => { setOpen(true); setDone(null); }}>
            Choose a day
          </Button>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Where should {recipeName} go?</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Day{' '}
              <select aria-label="Day" style={selectS} value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {days.map((_, i) => <option key={i} value={i}>Day {i + 1} · {DAY_NAMES[(i) % 7]}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Meal{' '}
              <select aria-label="Meal" style={selectS} value={slot} onChange={(e) => setSlot(e.target.value)}>
                {SLOTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <Button variant="accent" size="sm" disabled={setMeal.isPending}
              onClick={() => setMeal.mutate({ planKey, dayIndex: day, slot, recipeId }, {
                onSuccess: (res) => { setDone({ warnings: res.warnings }); setOpen(false); },
              })}>
              {setMeal.isPending ? 'Adding…' : 'Add it'}
            </Button>
            <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
            This replaces whatever is in that slot today, and the rest of the day is re-portioned
            around it so your targets still add up.
          </p>
        </>
      )}

      {errorMessage && <p style={{ color: '#b0503e', fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{errorMessage}</p>}

      {done && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, margin: 0, fontWeight: 600, color: '#2e7d4f' }}>
            Added. <Link to="/nutrition/weekly" style={{ color: 'var(--accent)' }}>See it in your plan →</Link>
          </p>
          {done.warnings.map((w, i) => (
            <p key={i} className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.6 }}>{w}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
