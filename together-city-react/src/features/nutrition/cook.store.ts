import { create } from 'zustand';
import type { CookStep, RecipeIngredient } from './api';

/* ---------- step wording heuristics (fallback when backend has no structure) ---------- */

function unitToSec(n: number, unit: string): number {
  if (/hour|hr/.test(unit)) return Math.round(n * 3600);
  if (/sec/.test(unit)) return Math.round(n);
  return Math.round(n * 60);
}

/** Timer (seconds) inferred from a step's wording; 0 = no timer. */
export function stepTimerSeconds(text: string): number {
  const t = text.toLowerCase();
  const U = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';
  let m = t.match(new RegExp(`(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*${U}`));
  if (m) return Math.min(2 * 3600, unitToSec(parseInt(m[2], 10), m[3]));
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) return Math.min(2 * 3600, unitToSec(parseFloat(m[1]), m[2]));
  return 0;
}

/** Does a step need you at the stove (true) or can it run in the background (false)? */
export function classifyActive(text: string, durationSec: number): boolean {
  const t = text.toLowerCase();
  if (/\b(simmer|bake|roast|marinat|chill|refrigerat|soak|proof|prove|boil|steam|slow[- ]?cook|pressure[- ]?cook|cover and cook|set aside|cool|freeze|infuse|rest|leave)\b/.test(t)) return false;
  if (/\b(stir|whisk|saut|fry|flip|toss|fold|beat|knead|scrambl|temper|deglaz|brown|sear|caramel|mix)\b/.test(t)) return true;
  if (durationSec === 0) return true;
  return durationSec < 180;
}

/* ---------- session model ---------- */

export interface Step { kind: 'prep' | 'step'; text: string; durationSec: number; active: boolean; ingredients?: RecipeIngredient[] }

export interface StartPayload {
  name: string;
  ingredients: RecipeIngredient[];
  method?: string[];
  cookSteps?: CookStep[];
}

function buildSteps(p: StartPayload): Step[] {
  const prep: Step = {
    kind: 'prep',
    text: `Get everything ready — gather and prep all your ingredients for ${p.name} before you start cooking.`,
    durationSec: 0, active: true, ingredients: p.ingredients,
  };
  const source: CookStep[] = p.cookSteps && p.cookSteps.length
    ? p.cookSteps
    : (p.method ?? []).map((text) => {
        const durationSec = stepTimerSeconds(text);
        return { text, durationSec, active: classifyActive(text, durationSec) };
      });
  return [prep, ...source.map((s) => ({ kind: 'step' as const, text: s.text, durationSec: s.durationSec, active: s.active }))];
}

interface CookState {
  open: boolean;
  minimized: boolean;
  stopped: boolean;           // timer stopped → method locked until a step is picked
  name: string;
  steps: Step[];
  idx: number;
  remain: number;             // seconds left on the current timer
  endAt: number | null;       // absolute ms the timer ends (drift-free across background)
  ticking: boolean;
  paused: boolean;
  rung: boolean;              // current timer has finished ringing

  start: (p: StartPayload) => void;
  end: () => void;
  minimize: (b: boolean) => void;
  startTimer: () => void;
  addMinute: () => void;
  togglePause: () => void;
  stop: () => void;
  resumeFrom: (completedIdx: number) => void;
  goto: (i: number) => void;
  next: () => void;
  back: () => void;
  tick: (nowMs: number) => void;
}

const stepReset = (steps: Step[], idx: number) => ({
  idx,
  remain: steps[idx]?.durationSec ?? 0,
  endAt: null as number | null,
  ticking: false,
  paused: false,
  rung: false,
});

/** Global cooking session — survives navigation so a simmer keeps timing while
 *  you do other things. The engine hook drives `tick`, the chime and wake lock. */
export const useCookStore = create<CookState>((set, get) => ({
  open: false, minimized: false, stopped: false,
  name: '', steps: [], idx: 0, remain: 0, endAt: null, ticking: false, paused: false, rung: false,

  start: (p) => {
    const steps = buildSteps(p);
    set({ open: true, minimized: false, stopped: false, name: p.name, steps, ...stepReset(steps, 0) });
  },
  end: () => set({ open: false, minimized: false, stopped: false, ticking: false, endAt: null }),
  minimize: (b) => set({ minimized: b }),

  startTimer: () => {
    const { steps, idx } = get();
    const dur = steps[idx]?.durationSec ?? 0;
    if (dur <= 0) return;
    set({ remain: dur, endAt: Date.now() + dur * 1000, ticking: true, paused: false, rung: false });
  },
  addMinute: () => {
    const { endAt, remain, ticking } = get();
    const base = ticking && endAt ? endAt : Date.now() + remain * 1000;
    set({ remain: remain + 60, endAt: base + 60_000, ticking: true, paused: false, rung: false });
  },
  togglePause: () => {
    const { paused, remain } = get();
    if (paused) set({ paused: false, endAt: Date.now() + remain * 1000 });
    else set({ paused: true, endAt: null });
  },

  stop: () => set({ ticking: false, paused: false, endAt: null, stopped: true, minimized: false }),
  resumeFrom: (completedIdx) => {
    const { steps } = get();
    const nextIdx = completedIdx + 1;
    if (nextIdx >= steps.length) { set({ open: false, stopped: false, ticking: false, endAt: null }); return; }
    set({ stopped: false, minimized: false, ...stepReset(steps, nextIdx) });
  },

  goto: (i) => { const { steps } = get(); if (i < 0) return; if (i >= steps.length) { get().end(); return; } set(stepReset(steps, i)); },
  next: () => get().goto(get().idx + 1),
  back: () => get().goto(get().idx - 1),

  tick: (now) => {
    const s = get();
    if (!s.ticking || s.paused || s.endAt == null) return;
    const remain = Math.max(0, Math.round((s.endAt - now) / 1000));
    if (remain <= 0) { set({ remain: 0, ticking: false, endAt: null, rung: true }); return; }
    if (remain !== s.remain) set({ remain });
  },
}));
