import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, EmptyState } from '@/components/ui';
import { useDaybookMonth } from '@/api/daybook.api';

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
 * MY DAYBOOK — the month as a MAP, not a container.
 *
 * This page used to promise every hub's bookings in one view, over a grid with
 * `const activities: Activity[] = []` behind it: no API, no model, no data, and
 * a subtitle describing all of it. The owner's answer (15 Aug) was not to go
 * and fetch the bookings — a calendar tells you what is SCHEDULED, and what
 * people actually want is the record of the day.
 *
 * So every date is a door into `features/daybook`, and the only thing the grid
 * is allowed to show is a MARK: a count of the lines on a day, a dot if it was
 * written in. Never a title, never a mood, never a word of the page — a diary
 * you can read over somebody's shoulder from across the room is not private.
 * Opening a day is a second, deliberate act.
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
  /* WHICH DAYS HOLD SOMETHING. Counts, never contents — the grid is allowed to
     say that a day has a page, never what the page says. Reading it is a
     second, deliberate act: you open the day. */
  const marks = useDaybookMonth(`${year}-${String(month + 1).padStart(2, '0')}`);
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
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Together City</div>
          <h1 style={{ margin: '2px 0 4px' }}>My Daybook</h1>
          <p className="lede" style={{ margin: 0 }}>Everything that makes up your day.</p>
          {/* IT SAID "every hub in one view" WHILE SHOWING AN EMPTY GRID. The
              hub bookings were never wired in; this page's own promise is the
              one it can keep today — open a day and it is yours to keep. */}
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Open any day to keep it: how it felt, what was on it, what you want to remember.</p>
        </div>
        <Link to="/restaurants/explore"><Button variant="accent" size="sm">Book a table</Button></Link>
      </div>

      {/* View toggle + category filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '18px 0 14px' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--r-full)',
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
              /* A DATE IS A DOOR NOW, not a box that holds events. The grid is
                 the map; the day is the place (see features/daybook). A mark
                 says the day holds something — a page written, or lines on
                 it — and says nothing about what. */
              const mark = marks.data?.[dstr];
              return (
                <Link key={i} to={`/daybook/${dstr}`} className="cal-day"
                  aria-label={`Open ${dstr}${mark ? ' — this day has something on it' : ''}`}
                  style={{ minHeight: 86, borderRadius: 8, padding: 6, border: '1px solid var(--line)', display: 'block',
                    textDecoration: 'none', color: 'var(--ink)',
                    background: isToday ? 'rgba(47,159,224,.10)' : 'transparent', outline: isToday ? '1px solid var(--accent)' : 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--accent)' : 'var(--ink)' }}>{day}</div>
                  {/* THE MONTH AS A SCRAPBOOK (owner, 15 Aug, with a reference
                      of polaroids pinned across a month). The first picture
                      kept on a day is pinned to its square — a photograph, and
                      never a word of the writing, which is the line this grid
                      still holds: a picture glanced at across a room is a
                      memory; a sentence read across a room is something
                      somebody wrote down in confidence. */}
                  {mark?.photo ? (
                    <span className="cal-pic">
                      <img src={mark.photo} alt="" loading="lazy" />
                      {mark.photos && mark.photos > 1 ? <span className="cal-pic-n">{mark.photos}</span> : null}
                    </span>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, alignItems: 'center' }}>
                    {evs.map((e) => <span key={e.id} title={e.title} style={{ width: 6, height: 6, borderRadius: '50%', background: catColor(e.category) }} />)}
                    {mark?.items ? <span className="cal-mark">{mark.items}</span> : null}
                    {mark?.written ? <span className="cal-written" aria-hidden>·</span> : null}
                  </div>
                </Link>
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
              <span style={{ fontSize: 17 }}>{CATEGORIES.find((c) => c.key === e.category)?.icon}</span>
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
