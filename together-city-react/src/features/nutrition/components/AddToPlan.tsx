import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useComposedPlan, usePinMeal, useUnpinMeal } from '../composed.api';

const SLOTS: Array<[string, string]> = [['b', 'Breakfast'], ['l', 'Lunch'], ['s', 'Snack'], ['d', 'Dinner']];

const selectS: React.CSSProperties = {
  padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10,
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
};

/**
 * Put this dish in your week.
 *
 * The day list comes from the saved plan, so it can only offer days that exist
 * in the block the citizen is actually following. Everything the server says
 * about the choice is shown: an allergen arrives as an error and the pin does
 * not happen, and a diet mismatch arrives as a warning and the pin is kept but
 * will not be served while their profile says otherwise. Neither is swallowed —
 * a citizen who is not told is a citizen who believes it worked.
 */
export function AddToPlan({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const plan = useComposedPlan();
  const pin = usePinMeal();
  const unpin = useUnpinMeal();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState('l');
  const [done, setDone] = useState<{ warnings: string[]; day: number; slot: string } | null>(null);

  const days = plan.data?.days ?? [];

  if (plan.isLoading) return null;
  if (days.length === 0) {
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

  const errorMessage = pin.isError
    ? ((pin.error as { response?: { data?: { message?: string } } })?.response?.data?.message
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
                {days.map((_, i) => <option key={i} value={i}>Day {i + 1}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Meal{' '}
              <select aria-label="Meal" style={selectS} value={slot} onChange={(e) => setSlot(e.target.value)}>
                {SLOTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <Button variant="accent" size="sm" disabled={pin.isPending}
              onClick={() => pin.mutate({ day, slot, recipeId }, {
                onSuccess: (wk) => { setDone({ warnings: wk.warnings ?? [], day, slot }); setOpen(false); },
              })}>
              {pin.isPending ? 'Adding…' : 'Add it'}
            </Button>
            <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
            This becomes your choice for that slot and stays there — the rest of the day is built
            around it. You can hand the slot back straight after, from here.
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
            <p key={i} style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.6, color: '#b0803a' }}>{w}</p>
          ))}
          {/* A choice you cannot undo is a trap, so the undo lives beside the
              confirmation rather than somewhere they have to go and find. */}
          <Button variant="line" size="sm" style={{ marginTop: 10 }} disabled={unpin.isPending}
            onClick={() => unpin.mutate({ day: done.day, slot: done.slot }, { onSuccess: () => setDone(null) })}>
            {unpin.isPending ? 'Undoing…' : 'Actually, choose for me again'}
          </Button>
        </div>
      )}
    </Card>
  );
}
