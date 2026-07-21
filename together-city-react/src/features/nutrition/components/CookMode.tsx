import { useEffect, useRef } from 'react';
import { useCookStore } from '../cook.store';

export { stepTimerSeconds } from '../cook.store';

/* ---------- helpers ---------- */

const mmss = (s: number) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), ss = s % 60; return `${m}:${ss < 10 ? '0' : ''}${ss}`; };

/**
 * Pick the best voice the device offers, once, and reuse it. Preference:
 * Indian English (natural/neural build first), then any premium/natural
 * English voice (Google/Microsoft "Natural", Apple "Enhanced"), then any
 * English. Voices load asynchronously, so re-rank when the list arrives.
 */
let chosenVoice: SpeechSynthesisVoice | null = null;
function rankVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase().replace('_', '-');
  const premium = /natural|neural|premium|enhanced|google/.test(name);
  if (lang === 'en-in' && premium) return 6;
  if (lang === 'en-in') return 5;
  if (lang.startsWith('en') && premium) return 4;
  if (lang === 'en-gb') return 3;
  if (lang.startsWith('en')) return 2;
  return 0;
}
function pickVoice(): void {
  try {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    chosenVoice = [...voices].sort((a, b) => rankVoice(b) - rankVoice(a))[0] ?? null;
    if (chosenVoice && rankVoice(chosenVoice) === 0) chosenVoice = null; // nothing English — let the OS decide
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch { /* ignore */ }
}

function speak(txt: string) {
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(txt);
      u.rate = 0.96; // a touch slower — clearer over kitchen noise
      u.pitch = 1;
      if (!chosenVoice) pickVoice();
      if (chosenVoice) { u.voice = chosenVoice; u.lang = chosenVoice.lang; }
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  } catch { /* ignore */ }
}

/** Three-note chime (WebAudio — no asset). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1108, 1318].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.start(t0); o.stop(t0 + 0.52);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1400);
  } catch { /* ignore */ }
}

async function requestNotify(): Promise<void> {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* ignore */ }
}
async function notify(title: string, body: string): Promise<void> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/favicon.svg', badge: '/favicon.svg', tag: 'cook', renotify: true } as NotificationOptions);
    else new Notification(title, { body });
  } catch { /* ignore */ }
}

type WakeSentinel = { release: () => Promise<void> } | null;

/* ---------- engine: interval, chime-on-ring, wake lock ---------- */

function useCookEngine() {
  const open = useCookStore((s) => s.open);
  const rung = useCookStore((s) => s.rung);
  const idx = useCookStore((s) => s.idx);
  const minimized = useCookStore((s) => s.minimized);
  const stopped = useCookStore((s) => s.stopped);

  // 1s-ish tick, drift-free (tick recomputes from an absolute end time).
  useEffect(() => {
    const iv = window.setInterval(() => useCookStore.getState().tick(Date.now()), 500);
    const onVis = () => useCookStore.getState().tick(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Speak each step as we arrive on it.
  useEffect(() => {
    if (!open || stopped) return;
    const s = useCookStore.getState();
    const step = s.steps[s.idx];
    if (step) speak(step.kind === 'prep' ? 'Prep. Gather your ingredients, then tap start.' : step.text);
  }, [idx, open, stopped]);

  // Chime + notification on the moment a timer finishes.
  const wasRung = useRef(false);
  useEffect(() => {
    if (rung && !wasRung.current) {
      chime();
      const s = useCookStore.getState();
      const nxt = s.steps[s.idx + 1];
      speak(nxt ? 'Timer done. Ready for the next step.' : 'Timer done. Your dish is ready.');
      void notify('Together City · Kitchen', nxt ? `Ready — next: ${nxt.text.slice(0, 90)}` : `${s.name} is ready to plate!`);
    }
    wasRung.current = rung;
  }, [rung]);

  // Screen wake lock: hold only for hands-on (active) steps in the foreground.
  const sentinel = useRef<WakeSentinel>(null);
  useEffect(() => {
    const s = useCookStore.getState();
    const step = s.steps[s.idx];
    const want = open && !minimized && !stopped && !!step?.active;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeSentinel> } }).wakeLock;
    let active = true;
    const acquire = async () => { try { if (wl && want && !sentinel.current) sentinel.current = await wl.request('screen'); } catch { /* ignore */ } };
    const release = async () => { try { await sentinel.current?.release(); } catch { /* ignore */ } sentinel.current = null; };
    if (want) { void acquire(); const onVis = () => { if (document.visibilityState === 'visible' && active) void acquire(); }; document.addEventListener('visibilitychange', onVis); return () => { active = false; document.removeEventListener('visibilitychange', onVis); void release(); }; }
    void release();
    return () => { active = false; };
  }, [open, minimized, stopped, idx]);
}

/* ---------- UI ---------- */

const ctrl: React.CSSProperties = { borderRadius: 999, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff' };
const ACCENT = '#8fd3a6';

function Overlay() {
  const s = useCookStore();
  const step = s.steps[s.idx];
  const next = s.steps[s.idx + 1];
  const cookingSteps = s.steps.filter((x) => x.kind === 'step').length;
  if (!step) return null;

  // Stopped → method locked until the cook picks the step they finished.
  if (s.stopped) {
    return (
      <div style={shell}>
        <div style={topBar}><span>Paused recipe · {s.name}</span>
          <button type="button" onClick={s.end} className="btn btn-sm" style={endBtn}>✕ Exit</button></div>
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: 620, margin: '0 auto', width: '100%', paddingTop: 8 }}>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e0b96a', fontWeight: 700 }}>Timer stopped</div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(20px,4vw,30px)', margin: '6px 0' }}>Which step have you finished?</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.75)' }}>Tell us where you got to and we'll pick the method back up from the next step — with its timer.</p>
          </div>
          {s.steps.map((st, i) => (
            <button key={i} type="button" onClick={() => s.resumeFrom(i)}
              style={{ display: 'block', width: '100%', textAlign: 'left', margin: '0 0 8px', padding: '13px 15px', borderRadius: 12, cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.18)', fontFamily: 'inherit', fontSize: 14 }}>
              <span style={{ color: ACCENT, fontWeight: 700 }}>{st.kind === 'prep' ? 'Prep' : `Step ${i}`} ✓ </span>{st.text.slice(0, 110)}{st.text.length > 110 ? '…' : ''}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const timed = step.durationSec > 0;
  const eyebrow = step.kind === 'prep' ? 'Get ready' : s.rung ? 'Timer done ✓' : s.ticking ? (step.active ? 'Cooking — stay here' : 'Running on its own') : timed ? 'Ready when you are' : 'Do this';
  const progress = Math.round((s.idx / Math.max(1, s.steps.length - 1)) * 100);

  return (
    <div style={shell}>
      <div style={topBar}>
        <span>{step.kind === 'prep' ? 'Prep' : `Step ${s.idx} of ${cookingSteps}`} · {s.name}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { void requestNotify(); s.minimize(true); }} className="btn btn-sm" style={endBtn}>▁ Minimise</button>
          <button type="button" onClick={s.end} className="btn btn-sm" style={endBtn}>✕ Exit</button>
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e0b96a', fontWeight: 700 }}>{eyebrow}</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(22px,4.4vw,38px)', lineHeight: 1.25, maxWidth: 760 }}>{step.text}</div>

        {/* attention hint */}
        {step.kind === 'step' && (
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {step.active ? '👨‍🍳 Hands-on — screen stays on' : '🕑 You can leave this running — we\'ll chime when it\'s done'}
          </div>
        )}

        {/* prep ingredient list */}
        {step.kind === 'prep' && step.ingredients && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 620 }}>
            {step.ingredients.map((ing) => (
              <span key={ing.name} style={{ fontSize: 13, padding: '7px 13px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }}>{ing.name} · {ing.grams} g</span>
            ))}
          </div>
        )}

        {/* timer */}
        {timed && (
          <>
            <div style={{ fontSize: 'clamp(48px,15vw,110px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', color: s.rung ? ACCENT : '#fff' }}>{mmss(s.remain)}</div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.15)', overflow: 'hidden', width: 260 }}>
              <div style={{ height: '100%', background: ACCENT, width: `${step.durationSec ? Math.round((1 - s.remain / step.durationSec) * 100) : 0}%`, transition: 'width .4s linear' }} />
            </div>
            {!s.ticking && !s.rung && (
              <button type="button" style={{ ...ctrl, background: ACCENT, color: '#123', borderColor: ACCENT }} onClick={() => { if (!step.active) void requestNotify(); s.startTimer(); }}>▶ Start {mmss(step.durationSec)} timer</button>
            )}
            {s.ticking && !step.active && (
              <button type="button" style={ctrl} onClick={() => { void requestNotify(); s.minimize(true); }}>⤵ Do other things — I'll chime you</button>
            )}
          </>
        )}

        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>
          {next ? `Up next: ${next.kind === 'prep' ? 'Prep' : next.text.slice(0, 80)}${next.text.length > 80 ? '…' : ''}` : 'Final step — plate up!'}
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden', margin: '6px 0 14px' }}>
        <div style={{ height: '100%', background: '#e0b96a', width: `${progress}%`, transition: 'width .3s' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" style={ctrl} disabled={s.idx === 0} onClick={s.back}>◀ Back</button>
        {timed && s.ticking && <button type="button" style={ctrl} onClick={s.togglePause}>{s.paused ? '▶ Resume' : '⏸ Pause'}</button>}
        {timed && (s.ticking || s.rung) && <button type="button" style={ctrl} onClick={s.addMinute}>＋1 min</button>}
        {timed && (s.ticking || s.paused) && <button type="button" style={{ ...ctrl, borderColor: '#e58e8e', color: '#ffd9d9' }} onClick={s.stop}>⏹ Stop</button>}
        <button type="button" style={{ ...ctrl, background: ACCENT, color: '#123', borderColor: ACCENT }} onClick={s.next}>{next ? 'Next step ▸' : 'Finish ✓'}</button>
      </div>
    </div>
  );
}

function Pill() {
  const name = useCookStore((s) => s.name);
  const idx = useCookStore((s) => s.idx);
  const remain = useCookStore((s) => s.remain);
  const ticking = useCookStore((s) => s.ticking);
  const rung = useCookStore((s) => s.rung);
  const cookingSteps = useCookStore((s) => s.steps.filter((x) => x.kind === 'step').length);
  const active = useCookStore((s) => s.steps[s.idx]?.active);
  const minimize = useCookStore((s) => s.minimize);
  const label = rung ? 'Timer done — next step ready' : ticking ? `${active ? 'Cooking' : 'Timer'} · ${mmss(remain)}` : `Step ${idx} of ${cookingSteps}`;
  return (
    <button type="button" onClick={() => minimize(false)}
      style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9998, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        background: rung ? '#2e7d4f' : 'linear-gradient(160deg,#241a0c,#171207)', color: '#fff', border: '1px solid rgba(255,255,255,.25)',
        borderRadius: 999, padding: '11px 18px', boxShadow: '0 8px 24px rgba(0,0,0,.35)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5 }}>
      <span style={{ fontSize: 18 }}>🍳</span>
      <span style={{ textAlign: 'left' }}><span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>{name}</span>{label}</span>
      <span style={{ fontSize: 12, color: '#8fd3a6' }}>Open ▸</span>
    </button>
  );
}

const shell: React.CSSProperties = { position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#171207,#241a0c)', color: '#fff', display: 'flex', flexDirection: 'column', zIndex: 9999, padding: 22 };
const topBar: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,.7)' };
const endBtn: React.CSSProperties = { background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' };

/** Mounted once at the app root: the timing engine + the overlay/pill. */
export function CookRoot() {
  useCookEngine();
  const open = useCookStore((s) => s.open);
  const minimized = useCookStore((s) => s.minimized);
  if (!open) return null;
  return minimized ? <Pill /> : <Overlay />;
}
