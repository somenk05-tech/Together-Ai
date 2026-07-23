import { useEffect, useState } from 'react';
import { useFamilyMealPlanning } from './hooks';

/**
 * Planner mode — the single switch between the household's shared Family Plan
 * and this user's own Individual Plan. The choice is remembered for the session
 * (localStorage) and shared across the Weekly and Daily planners so switching in
 * one carries to the other. Switching is instant: it only changes which plan the
 * planner requests (React Query caches each mode), never a page reload.
 */
export type PlannerMode = 'family' | 'individual';

const KEY = 'tc:nutrition:plannerMode';
const EVT = 'tc:plannerMode:change';

function read(): PlannerMode | null {
  try { const v = localStorage.getItem(KEY); return v === 'family' || v === 'individual' ? v : null; } catch { return null; }
}
function write(v: PlannerMode): void {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

/**
 * Resolve the effective planner mode + whether the Family Plan option is even
 * available. Family mode is only offered when the user belongs to a household
 * that has Family Meal Planning ON; otherwise the toggle is hidden and the view
 * is forced to Individual.
 */
export function usePlannerMode(): {
  mode: PlannerMode;
  canUseFamily: boolean;
  ready: boolean;
  setMode: (m: PlannerMode) => void;
} {
  const { query } = useFamilyMealPlanning();
  const ctx = query.data;
  const canUseFamily = Boolean(ctx?.hasFamily && ctx.familyMealPlanning);

  const [stored, setStored] = useState<PlannerMode | null>(read);
  useEffect(() => {
    const refresh = () => setStored(read());
    window.addEventListener('storage', refresh);
    window.addEventListener(EVT, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(EVT, refresh); };
  }, []);

  // Default to the shared Family Plan when it's available (that matches how the
  // household plans together); otherwise the user's own Individual Plan.
  const preferred: PlannerMode = stored ?? (canUseFamily ? 'family' : 'individual');
  const mode: PlannerMode = canUseFamily ? preferred : 'individual';

  return {
    mode,
    canUseFamily,
    ready: query.isSuccess || query.isError,
    setMode: (m: PlannerMode) => { setStored(m); write(m); },
  };
}
