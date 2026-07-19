import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecipeIngredient } from '../api';

/* ---------- helpers ---------- */

const mmss = (s: number) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
};

function unitToSec(n: number, unit: string): number {
  if (/hour|hr/.test(unit)) return Math.round(n * 3600);
  if (/sec/.test(unit)) return Math.round(n);
  return Math.round(n * 60); // minutes
}

/**
 * Pull a cook timer out of a method step's wording.
 * "simmer for 10–12 minutes" → 720s, "bake 25 mins" → 1500s, "rest 30 sec" → 30s.
 * Ranges take the upper bound; unmatched steps return 0 (manual, tap-to-advance).
 */
export function stepTimerSeconds(text: string): number {
  const t = text.toLowerCase();
  const U = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';
  let m = t.match(new RegExp(`(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*${U}`));
  if (m) return Math.min(2 * 3600, unitToSec(parseInt(m[2], 10), m[3]));
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) return Math.min(2 * 3600, unitToSec(parseFloat(m[1]), m[2]));
  return 0;
}

function speak(txt: string) {
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(txt);
      u.rate = 0.98;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  } catch { /* ignore */ }
}

/** Short three-note chime when a timer finishes (WebAudio — no asset needed). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1108, 1318].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.start(t0); o.stop(t0 + 0.52);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1400);
  } catch { /* ignore */ }
}

/* ---------- step model ---------- */

interface CookStep {
  kind: 'prep' | 'step';
  text: string;
  seconds: number;       // 0 → manual step (no timer)
  ingredients?: RecipeIngredient[];
}

function buildSteps(method: string[], ingredients: RecipeIngredient[], name: string): CookStep[] {
  const prep: CookStep = {
    kind: 'prep',
    text: `Mise en place — gather and prep everything for ${name} before you start cooking.`,
    seconds: 0,
    ingredients,
  };
  const steps: CookStep[] = method.map((text) => ({ kind: 'step', text, seconds: stepTimerSeconds(text) }));
  return [prep, ...steps];
}

/* ---------- component ---------- */

export function CookMode({
  name, method, ingredients, onClose,
}: {
  name: string;
  method: string[];
  ingredients: RecipeIngredient[];
  onClose: () => void;
}) {
  const steps = useMemo(() => buildSteps(method, ingredients, name), [method, ingredients, name]);
  const [idx, setIdx] = useState(0);
  const [remain, setRemain] = useState(0);
  const [ticking, setTicking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);        // this step's timer has rung
  const firedRef = useRef(false);

  const step = steps[idx];
  const next = steps[idx + 1];
  const total = steps.length;
  const cookingSteps = steps.filter((s) => s.kind === 'step').length;

  // Entering a step: reset timer state and read the step aloud.
  useEffect(() => {
    setTicking(false); setPaused(false); setDone(false);
    firedRef.current = false;
    setRemain(step.seconds);
    speak(step.kind === 'prep' ? 'Prep. Gather your ingredients, then tap start.' : step.text);
  }, [idx, step.kind, step.seconds, step.text]);

  // Countdown — one setTimeout per second, re-armed as remain changes.
  useEffect(() => {
    if (!ticking || paused) return;
    if (remain <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        setTicking(false); setDone(true);
        chime();
        speak(next ? 'Timer done. Ready for the next step.' : 'Timer done. Your dish is ready.');
      }
      return;
    }
    const t = window.setTimeout(() => setRemain((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
  }, [ticking, paused, remain, next]);

  // Stop any speech when the overlay unmounts.
  useEffect(() => () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } }, []);

  const startTimer = () => { setRemain(step.seconds); firedRef.current = false; setDone(false); setPaused(false); setTicking(true); };
  const addMinute = () => { setRemain((r) => r + 60); setDone(false); firedRef.current = false; if (!ticking) setTicking(true); };
  const go = (i: number) => { if (i < 0) return; if (i >= total) { finish(); return; } setIdx(i); };
  const finish = () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } onClose(); };

  const progress = Math.round((idx / Math.max(1, total - 1)) * 100);
  const accent = '#8fd3a6';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#171207,#241a0c)', color: '#fff', display: 'flex', flexDirection: 'column', zIndex: 9999, padding: 22 }}>
      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
        <span>{step.kind === 'prep' ? 'Prep' : `Step ${idx} of ${cookingSteps}`} · {name}</span>
        <button type="button" onClick={finish} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }}>✕ End</button>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e0b96a', fontWeight: 700 }}>
          {step.kind === 'prep' ? 'Get ready' : done ? 'Timer done ✓' : ticking ? 'Cooking…' : step.seconds ? 'Ready when you are' : 'Do this'}
        </div>

        <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(22px,4.4vw,38px)', lineHeight: 1.25, maxWidth: 760 }}>{step.text}</div>

        {/* prep ingredient checklist */}
        {step.kind === 'prep' && step.ingredients && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 620, marginTop: 4 }}>
            {step.ingredients.map((ing) => (
              <span key={ing.name} style={{ fontSize: 13, padding: '7px 13px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }}>
                {ing.name} · {ing.grams} g
              </span>
            ))}
          </div>
        )}

        {/* timer */}
        {step.seconds > 0 && (
          <>
            <div style={{ fontSize: 'clamp(48px,15vw,110px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', color: done ? accent : '#fff' }}>
              {mmss(remain)}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.15)', overflow: 'hidden', width: 260 }}>
              <div style={{ height: '100%', background: accent, width: `${step.seconds ? Math.round((1 - remain / step.seconds) * 100) : 0}%`, transition: 'width .3s linear' }} />
            </div>
            {!ticking && !done && (
              <button type="button" style={{ ...ctrl, background: accent, color: '#123', borderColor: accent, marginTop: 4 }} onClick={startTimer}>▶ Start {mmss(step.seconds)} timer</button>
            )}
          </>
        )}

        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 6 }}>
          {next ? `Up next: ${next.kind === 'prep' ? 'Prep' : next.text.slice(0, 80)}${next.text.length > 80 ? '…' : ''}` : 'Final step — plate up!'}
        </div>
      </div>

      {/* progress rail */}
      <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden', margin: '6px 0 14px' }}>
        <div style={{ height: '100%', background: '#e0b96a', width: `${progress}%`, transition: 'width .3s' }} />
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" style={ctrl} disabled={idx === 0} onClick={() => go(idx - 1)}>◀ Back</button>
        {step.seconds > 0 && ticking && (
          <button type="button" style={ctrl} onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
        )}
        {step.seconds > 0 && (ticking || done) && (
          <button type="button" style={ctrl} onClick={addMinute}>＋1 min</button>
        )}
        {step.text && <button type="button" style={{ ...ctrl, background: accent, color: '#123', borderColor: accent }} onClick={() => go(idx + 1)}>{next ? 'Next step ▸' : 'Finish ✓'}</button>}
      </div>
    </div>
  );
}

const ctrl: React.CSSProperties = { borderRadius: 999, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff' };
