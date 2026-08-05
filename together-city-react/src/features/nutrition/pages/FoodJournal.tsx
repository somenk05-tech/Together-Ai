import { useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useJournalDay, useJournalWeek, useAnalyzeMeal, useLogMeal, useRemoveMeal, mealTypeForHour,
  MEAL_LABEL, type JournalItem, type MealType,
} from '../journal.api';

/**
 * AI Food Journal — Nutrition · 06.
 *
 * Photograph, say, or type what you ate; the AI identifies it and ESTIMATES
 * its nutrition; you review — and can change — every line before it is
 * logged. Nothing on this page invents a number: estimates are labelled as
 * estimates, totals come from the server's own arithmetic, targets carry
 * their assumed-inputs disclosure, and a day nobody logged reads as "not
 * recorded", never as zero calories eaten.
 */

const inputS = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' } as const;
const MEAL_TYPES = Object.keys(MEAL_LABEL) as MealType[];

/** Downscale a photo to ≤1280px JPEG data-URL — plenty for recognition. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

/** A slim progress bar with the number beside it — no colour-only meaning. */
function Meter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const over = max > 0 && value > max;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
        <span className="muted">{label}</span>
        <strong style={over ? { color: 'var(--warn-ink)' } : undefined}>
          {Math.round(value).toLocaleString('en-IN')} / {Math.round(max).toLocaleString('en-IN')} {unit}{over ? ' · over' : ''}
        </strong>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--warn-ink)' : 'var(--accent)' }} />
      </div>
    </div>
  );
}

/** One reviewable item row — qty and kcal stay editable until logged. */
function ItemRow({ it, onChange, onRemove }: { it: JournalItem; onChange: (next: JournalItem) => void; onRemove: () => void }) {
  const scaled = (field: 'kcal' | 'proteinG' | 'carbG' | 'fatG' | 'fibreG' | 'sugarG' | 'sodiumMg' | 'waterMl', qty: number) => {
    const base = it.qty > 0 ? (it[field] ?? 0) / it.qty : 0;
    return Math.round(base * qty);
  };
  const setQty = (q: number) => {
    if (!(q > 0)) return;
    onChange({
      ...it, qty: q,
      kcal: scaled('kcal', q), proteinG: scaled('proteinG', q), carbG: scaled('carbG', q), fatG: scaled('fatG', q),
      ...(it.fibreG != null ? { fibreG: scaled('fibreG', q) } : {}),
      ...(it.sugarG != null ? { sugarG: scaled('sugarG', q) } : {}),
      ...(it.sodiumMg != null ? { sodiumMg: scaled('sodiumMg', q) } : {}),
      ...(it.waterMl != null ? { waterMl: scaled('waterMl', q) } : {}),
    });
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {it.grams ? `~${it.grams} g · ` : ''}{it.proteinG}P · {it.carbG}C · {it.fatG}F
          {it.confidence != null && it.confidence < 0.5 ? ' · low-confidence estimate' : ''}
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span className="muted">Qty</span>
        <input aria-label={`Quantity of ${it.name}`} inputMode="decimal" value={String(it.qty)}
          onChange={(e) => setQty(Number(e.target.value))}
          style={{ ...inputS, width: 58, padding: '6px 8px', textAlign: 'center' }} />
        <span className="muted">{it.unit}</span>
      </label>
      <strong style={{ fontSize: 13.5, minWidth: 70, textAlign: 'right' }}>{it.kcal.toLocaleString('en-IN')} kcal</strong>
      <button type="button" onClick={onRemove} aria-label={`Remove ${it.name}`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15, padding: 4 }}>✕</button>
    </div>
  );
}

export function FoodJournal() {
  const day = useJournalDay();
  const week = useJournalWeek();
  const analyze = useAnalyzeMeal();
  const logMeal = useLogMeal();
  const removeMeal = useRemoveMeal();

  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [mealType, setMealType] = useState<MealType>(mealTypeForHour(new Date().getHours()));
  const [items, setItems] = useState<JournalItem[] | null>(null); // null = nothing analyzed yet
  const [aiNote, setAiNote] = useState('');
  const [aiOff, setAiOff] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const [logged, setLogged] = useState('');
  const source = useRef<'photo' | 'text' | 'voice' | 'manual'>('text');

  const reviewTotals = useMemo(() => (items ?? []).reduce(
    (t, it) => ({ kcal: t.kcal + it.kcal, proteinG: t.proteinG + it.proteinG, carbG: t.carbG + it.carbG, fatG: t.fatG + it.fatG }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  ), [items]);

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    try {
      setErr(''); setLogged('');
      const data = await toDataUrl(file);
      setPhoto(data);
      source.current = 'photo';
    } catch { setErr('That image couldn’t be read — try another photo.'); }
  };

  const runAnalyze = () => {
    setErr(''); setLogged(''); setItems(null); setAiNote(''); setAiOff(false);
    analyze.mutate({ ...(photo ? { photo } : {}), ...(text.trim() ? { text: text.trim() } : {}) }, {
      onSuccess: (r) => {
        setItems(r.items);
        setAiNote(r.note);
        setAiOff(!r.available);
      },
      onError: (e) => setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Couldn’t analyse that — please try again.'),
    });
  };

  const startVoice = () => {
    type SR = { new (): { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start(): void } };
    const Ctor = (window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: SR }).webkitSpeechRecognition;
    if (!Ctor) { setErr('Voice input isn’t available in this browser — type the meal instead.'); return; }
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from({ length: e.results.length }, (_, i) => e.results[i][0]?.transcript ?? '').join(' ').trim();
      if (said) { setText((t) => (t ? `${t} ${said}` : said)); source.current = 'voice'; }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const addManualItem = () => {
    source.current = source.current === 'photo' ? 'photo' : 'manual';
    setItems((a) => ([...(a ?? []), { name: '', qty: 1, unit: 'serving', kcal: 0, proteinG: 0, carbG: 0, fatG: 0 }]));
  };

  const logNow = () => {
    const ready = (items ?? []).filter((it) => it.name.trim() && it.kcal >= 0);
    if (!ready.length) { setErr('Add at least one item with a name first.'); return; }
    setErr('');
    logMeal.mutate({
      mealType, source: source.current, items: ready,
      ...(aiNote ? { note: aiNote } : {}),
    }, {
      onSuccess: (r) => {
        setItems(null); setPhoto(null); setText(''); setAiNote('');
        setLogged(`Logged — ${MEAL_LABEL[mealType]} · ${r.entry.totals.kcal.toLocaleString('en-IN')} kcal. ${r.day.coach[0] ?? ''}`);
      },
      onError: (e) => setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Couldn’t log the meal — nothing was saved; try again.'),
    });
  };

  const d = day.data;
  const timeline = useMemo(() => {
    const groups = new Map<MealType, NonNullable<typeof d>['entries']>();
    for (const e of d?.entries ?? []) {
      const k: MealType = e.mealType in MEAL_LABEL ? e.mealType : 'other';
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return MEAL_TYPES.filter((m) => groups.has(m)).map((m) => ({ meal: m, entries: groups.get(m) ?? [] }));
  }, [d]);

  const waterLogged = d?.totals.waterMl ?? 0;
  const quickWater = (ml: number) => {
    logMeal.mutate({
      mealType: 'other', source: 'manual',
      items: [{ name: 'Water', qty: ml / 250, unit: 'glass', kcal: 0, proteinG: 0, carbG: 0, fatG: 0, waterMl: ml }],
    });
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 40px' }}>
      {/*
        THE HEADER PICTURE IS GONE, AND IT WAS WORSE THAN DECORATION.

        It was a screenshot of ANOTHER PAGE in this hub — the daily planner —
        laid behind the words "AI Food
        Journal" as wallpaper. So the largest thing on the page was a picture of
        a different feature, printed at about 380px, pushing the one control
        anybody came here for below the fold. Nothing on the screen was more
        prominent and nothing on the screen was less relevant.

        What replaces it is the page saying what it is. The sentence is the same
        sentence; it is just legible now, on white, instead of in white over a
        photograph of somebody else's screen.
      */}
      <div className="eyebrow">Nutrition Hub · 06</div>
      <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>AI Food Journal</h1>
      <p className="muted" style={{ fontSize: 14.5, margin: '8px 0 26px', maxWidth: '62ch' }}>
        Photograph your meal — or say it, or type it. We identify it, estimate its
        nutrition, and log it into your day. Estimates you can always adjust.
      </p>

      {/* ── Log a meal ─────────────────────────────────────────── */}
      <section className="blk">
        <div className="blk-head"><h2>Log a meal</h2></div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              aria-label="Add a meal photo"
              style={{ width: 128, height: 96, borderRadius: 12, border: photo ? '2px solid var(--accent)' : '1.5px dashed var(--line)', background: 'var(--card)', cursor: 'pointer', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 0 }}>
              {photo
                ? <img src={photo} alt="Your meal" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>📷<br />Photo / camera</span>}
            </button>
            <div style={{ flex: 1, minWidth: 220 }}>
              <textarea aria-label="Describe the meal" rows={3} value={text} onChange={(e) => { setText(e.target.value); if (!photo) source.current = 'text'; }}
                placeholder='e.g. "two chapatis, a bowl of dal, and grilled chicken"' style={inputS} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="line" size="sm" onClick={startVoice} disabled={listening}>{listening ? '🎙 Listening…' : '🎙 Speak it'}</Button>
                <select aria-label="Meal" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} style={{ ...inputS, width: 'auto', padding: '8px 12px' }}>
                  {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
                </select>
                <Button variant="gold" size="sm" disabled={analyze.isPending || (!photo && !text.trim())} onClick={runAnalyze}>
                  {analyze.isPending ? 'Reading your meal…' : '✨ Analyse'}
                </Button>
                {photo && <Button variant="line" size="sm" onClick={() => setPhoto(null)}>Remove photo</Button>}
              </div>
            </div>
          </div>

          {err && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, marginTop: 10 }}>{err}</p>}
          {logged && <div className="note" style={{ marginTop: 10 }}>{logged}</div>}

          {/* Review — the estimate is the AI's; the decision is yours. */}
          {items !== null && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0 }}>Review before logging</h4>
                <span className="muted" style={{ fontSize: 11.5 }}>AI estimates — adjust any quantity; nothing is saved until you log it.</span>
              </div>
              {aiNote && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{aiOff ? '' : 'AI: '}{aiNote}</p>}
              {items.length === 0 && !aiOff && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Nothing recognisable — add the items yourself below.</p>}
              {items.map((it, i) => (
                <ItemRow key={i} it={it}
                  onChange={(next) => setItems((a) => (a ?? []).map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setItems((a) => (a ?? []).filter((_, j) => j !== i))} />
              ))}
              {/* Manual line — name + your own numbers. Honest when AI is off. */}
              {items.some((it) => !it.name) && (
                <ManualItemEditor item={items.find((it) => !it.name) as JournalItem}
                  onChange={(next) => setItems((a) => (a ?? []).map((x) => (!x.name || x === next ? next : x)))} />
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <Button variant="line" size="sm" onClick={addManualItem}>＋ Add an item by hand</Button>
                <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                  <span className="muted">This meal ≈ </span>
                  <strong>{Math.round(reviewTotals.kcal).toLocaleString('en-IN')} kcal</strong>
                  <span className="muted"> · {Math.round(reviewTotals.proteinG)}P / {Math.round(reviewTotals.carbG)}C / {Math.round(reviewTotals.fatG)}F</span>
                </span>
                <Button variant="gold" size="sm" disabled={logMeal.isPending} onClick={logNow}>
                  {logMeal.isPending ? 'Logging…' : 'Log this meal →'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Today ──────────────────────────────────────────────── */}
      <section className="blk">
        <div className="blk-head">
          <h2>Today</h2>
          {d && <span className="muted" style={{ fontSize: 12 }}>{d.date}</span>}
        </div>
        {day.isLoading ? <Spinner label="Opening your journal…" />
          : day.isError || !d ? <EmptyState title="Couldn't open your journal" hint="Please check your connection and try again." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', gap: 16, alignItems: 'start' }}>
              {/* Timeline */}
              <div className="card">
                {timeline.length === 0
                  ? <EmptyState icon="🍽" title="Nothing logged yet today" hint="Photograph your next meal — it takes one tap." />
                  : timeline.map(({ meal, entries }) => (
                    <div key={meal} style={{ marginBottom: 4 }}>
                      <div className="eyebrow" style={{ margin: '10px 0 2px' }}>{MEAL_LABEL[meal]}</div>
                      {entries.map((e) => (
                        <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                          <span className="muted" style={{ fontSize: 11.5, minWidth: 62 }}>
                            {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                              {e.items.map((it) => it.name).filter(Boolean).join(', ') || '—'}
                            </div>
                            <div className="muted" style={{ fontSize: 11.5 }}>{e.totals.proteinG}P · {e.totals.carbG}C · {e.totals.fatG}F{e.source === 'photo' ? ' · 📷' : e.source === 'voice' ? ' · 🎙' : ''}</div>
                          </div>
                          <strong style={{ fontSize: 13.5 }}>{e.totals.kcal.toLocaleString('en-IN')} kcal</strong>
                          <button type="button" aria-label="Delete this entry" disabled={removeMeal.isPending}
                            onClick={() => removeMeal.mutate(e.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 4 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>

              {/* Totals vs targets */}
              <div>
                <div className="card">
                  <div className="eyebrow">Daily totals</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 10px' }}>
                    <span style={{ fontSize: 28, fontWeight: 800 }}>{d.totals.kcal.toLocaleString('en-IN')}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>of {d.target.kcal.toLocaleString('en-IN')} kcal · {d.remainingKcal.toLocaleString('en-IN')} remaining</span>
                  </div>
                  <Meter label="Protein" value={d.totals.proteinG} max={d.target.proteinG} unit="g" />
                  <Meter label="Carbs" value={d.totals.carbG} max={d.target.carbG} unit="g" />
                  <Meter label="Fat" value={d.totals.fatG} max={d.target.fatG} unit="g" />
                  <Meter label="Fibre" value={d.totals.fibreG} max={d.target.fibreG} unit="g" />
                  {d.target.waterMl > 0 && <Meter label="Water" value={waterLogged} max={d.target.waterMl} unit="ml" />}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <Button variant="line" size="sm" disabled={logMeal.isPending} onClick={() => quickWater(250)}>＋ Glass of water</Button>
                    <Button variant="line" size="sm" disabled={logMeal.isPending} onClick={() => quickWater(500)}>＋ 500 ml</Button>
                  </div>
                  <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>{d.basis}</p>
                  {!d.target.personalised && (
                    <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Targets rest partly on assumed inputs ({d.target.assumed.join(', ')}) — complete your Food Preference Profile to make them yours.
                    </p>
                  )}
                </div>
                {d.coach.length > 0 && (
                  <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--accent)' }}>
                    <div className="eyebrow">Where the day stands</div>
                    {d.coach.map((line, i) => <p key={i} style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.55 }}>{line}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}
      </section>

      {/* ── This week ──────────────────────────────────────────── */}
      <section className="blk">
        <div className="blk-head">
          <h2>This week</h2>
          {week.data && <span className="muted" style={{ fontSize: 12 }}>{week.data.loggedDays} of 7 days logged</span>}
        </div>
        {week.isLoading ? <Spinner label="Adding up the week…" />
          : week.isError || !week.data ? <EmptyState title="Couldn't load the week" hint="Please try again in a moment." />
          : week.data.loggedDays === 0 ? <EmptyState icon="📊" title="No meals logged this week yet" hint="Trends appear once you've logged a day or two." />
          : (
            <div className="card">
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
                {week.data.days.map((dd) => {
                  const target = week.data?.targetKcal ?? 0;
                  const h = target > 0 ? Math.min(100, Math.round((dd.kcal / target) * 100)) : 0;
                  const dayName = new Date(`${dd.date}T12:00:00Z`).toLocaleDateString([], { weekday: 'short' });
                  return (
                    <div key={dd.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                      <span className="muted" style={{ fontSize: 10.5 }}>{dd.meals > 0 ? `${dd.kcal.toLocaleString('en-IN')}` : '—'}</span>
                      <div aria-label={`${dayName}: ${dd.meals > 0 ? `${dd.kcal} kcal` : 'not recorded'}`}
                        style={{ width: '60%', maxWidth: 34, borderRadius: 6, background: dd.meals > 0 ? 'var(--accent)' : 'var(--line)', height: dd.meals > 0 ? `${Math.max(6, h)}%` : 6 }} />
                      <span className="muted" style={{ fontSize: 10.5 }}>{dayName}</span>
                    </div>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                Bars are each day's calories against your {week.data.targetKcal.toLocaleString('en-IN')} kcal target. A grey dash is a day with nothing recorded — not a day you ate nothing.
              </p>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5 }}>
                <span><span className="muted">Avg (logged days) </span><strong>{week.data.avg.kcal.toLocaleString('en-IN')} kcal</strong></span>
                <span><span className="muted">Protein </span><strong>{week.data.avg.proteinG} g</strong></span>
                <span><span className="muted">Fibre </span><strong>{week.data.avg.fibreG} g</strong></span>
                <span><span className="muted">Water </span><strong>{week.data.avg.waterMl.toLocaleString('en-IN')} ml</strong></span>
              </div>
            </div>
          )}
      </section>
    </div>
  );
}

/** Editing surface for a hand-added item: your food, your numbers. */
function ManualItemEditor({ item, onChange }: { item: JournalItem; onChange: (next: JournalItem) => void }) {
  const set = (k: keyof JournalItem, v: string) =>
    onChange({ ...item, [k]: k === 'name' || k === 'unit' ? v : Math.max(0, Number(v) || 0) });
  const f = (label: string, k: keyof JournalItem, w = 76) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
      <span className="muted">{label}</span>
      <input aria-label={label} inputMode={k === 'name' || k === 'unit' ? undefined : 'numeric'}
        value={String(item[k] ?? '')} onChange={(e) => set(k, e.target.value)}
        style={{ ...inputS, width: k === 'name' ? 170 : w, padding: '7px 9px' }} />
    </label>
  );
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      {f('Item name', 'name')}
      {f('Qty', 'qty', 56)}
      {f('Unit', 'unit', 76)}
      {f('kcal', 'kcal', 64)}
      {f('Protein g', 'proteinG', 64)}
      {f('Carbs g', 'carbG', 64)}
      {f('Fat g', 'fatG', 64)}
    </div>
  );
}
