import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, EmptyState } from '@/components/ui';

type View = 'month' | 'week' | 'day';

interface Activity {
  id: string;
  date: string;        // YYYY-MM-DD
  time?: string;
  title: string;
  where?: string;
  category: CategoryKey;
}
type CategoryKey = 'travel' | 'restaurants' | 'movies' | 'medical' | 'fitness';

const CATEGORIES: { key: CategoryKey; icon: string; label: string; color: string }[] = [
  { key: 'travel', icon: '✈', label: 'Travel', color: '#2f9fe0' },
  { key: 'restaurants', icon: '🍽', label: 'Restaurants', color: '#e0872f' },
  { key: 'movies', icon: '🎬', label: 'Movies', color: '#8b5cf6' },
  { key: 'medical', icon: '✚', label: 'Medical', color: '#e0342b' },
  { key: 'fitness', icon: '◆', label: 'Fitness', color: '#22a06b' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Master Calendar — every hub's scheduled items in one view. Bookings, tables,
 * tests, workouts and dates flow in here as you make them across Together City.
 * Real data only: nothing is pre-populated.
 */
export function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<View>('month');
  const [active, setActive] = useState<Set<CategoryKey>>(() => new Set(CATEGORIES.map((c) => c.key)));

  // Scheduled activities across all hubs. Empty until real bookings arrive.
  const activities: Activity[] = [];
  const shown = activities.filter((a) => active.has(a.category));

  const toggleCat = (k: CategoryKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = (dstr: string) => shown.filter((a) => a.date === dstr);

  // "This week" = Sun–Sat containing today.
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const weekEvents = shown.filter((a) => a.date >= iso(weekDays[0]) && a.date <= iso(weekDays[6]));

  const catColor = (k: CategoryKey) => CATEGORIES.find((c) => c.key === k)?.color ?? 'var(--accent)';

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 18px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Together City</div>
          <h1 style={{ margin: '2px 0 4px' }}>Master Calendar</h1>
          <p className="lede" style={{ margin: 0 }}>Everything scheduled, one calendar.</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Flights, tables, tests, workouts and dates — every hub in one view.</p>
        </div>
        <Link to="/restaurants/book"><Button variant="accent" size="sm">+ Add</Button></Link>
      </div>

      {/* View toggle + category filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '18px 0 14px' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              style={{ border: 'none', cursor: 'pointer', padding: '7px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                textTransform: 'capitalize', background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? '#fff' : 'var(--muted)' }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {CATEGORIES.map((c) => {
          const on = active.has(c.key);
          return (
            <button key={c.key} type="button" onClick={() => toggleCat(c.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', borderRadius: 999,
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? c.color : 'var(--line)'}`,
                background: on ? `${c.color}18` : 'transparent', color: on ? c.color : 'var(--muted)' }}>
              <span aria-hidden>{c.icon}</span>{c.label}
            </button>
          );
        })}
      </div>

      {view === 'month' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'inherit' }}>‹ {MONTHS[(month + 11) % 12].slice(0, 3)}</button>
            <h3 style={{ margin: 0 }}>{MONTHS[month]} {year}</h3>
            <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'inherit' }}>{MONTHS[(month + 1) % 12].slice(0, 3)} ›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {DOW.map((d) => <div key={d} className="muted" style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0' }}>{d}</div>)}
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const dstr = iso(new Date(year, month, day));
              const isToday = dstr === iso(today);
              const evs = byDate(dstr);
              return (
                <div key={i} style={{ minHeight: 64, borderRadius: 8, padding: 6, border: '1px solid var(--line)',
                  background: isToday ? 'rgba(47,159,224,.10)' : 'transparent', outline: isToday ? '1px solid var(--accent)' : 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--accent)' : 'var(--ink)' }}>{day}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                    {evs.map((e) => <span key={e.id} title={e.title} style={{ width: 6, height: 6, borderRadius: '50%', background: catColor(e.category) }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(view === 'week' || view === 'day') && (
        <Card>
          <h3 style={{ margin: '0 0 10px' }}>{view === 'week' ? 'This week' : today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {(view === 'week' ? weekDays : [today]).map((d) => {
            const evs = byDate(iso(d));
            return (
              <div key={iso(d)} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
                {evs.length === 0
                  ? <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Nothing scheduled</div>
                  : evs.map((e) => (
                    <div key={e.id} style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 13 }}>
                      <span style={{ color: catColor(e.category) }}>●</span>
                      <span style={{ fontWeight: 600 }}>{e.time}</span> {e.title}{e.where ? ` · ${e.where}` : ''}
                    </div>
                  ))}
              </div>
            );
          })}
        </Card>
      )}

      {/* This week's agenda */}
      <h3 style={{ margin: '24px 0 10px' }}>This week's agenda</h3>
      {weekEvents.length === 0 ? (
        <Card>
          <EmptyState icon="🗓" title="Nothing scheduled this week"
            hint="Book a table, flight, test, workout or date across Together City and it lands here automatically." />
        </Card>
      ) : (
        <Card>
          {weekEvents.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: 18 }}>{CATEGORIES.find((c) => c.key === e.category)?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{new Date(e.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' })}{e.time ? ` · ${e.time}` : ''}{e.where ? ` · ${e.where}` : ''}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
