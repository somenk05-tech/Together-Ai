import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { MiraDay } from '@/features/daybook/MiraDay';
import {
  useDay, useSaveDay, useAddDayItem, usePatchDayItem, useRemoveDayItem,
  type DayItemKind,
} from '@/api/daybook.api';

/**
 * ONE DAY, AS THE PERSON WHO LIVED IT KEEPS IT.
 *
 * The Master Calendar was a grid with nothing behind it — `activities` was a
 * hardcoded empty array waiting for hub bookings that never arrived. The
 * owner's answer (15 Aug) was not to go and fetch the bookings: it was that a
 * calendar tells you what is scheduled, and what people actually want is a
 * record of the day. So the grid became the map, and this is the place.
 *
 * FOUR LAYERS, IN THE ORDER A DAY IS ACTUALLY LIVED: how it feels, what is on
 * it, what was written about it, and — quietly at the end — Mira, who can read
 * this one day back to you.
 *
 * WHAT THIS PAGE REFUSES TO DO. It does not score the day. No "2 of 5 done",
 * no streak, no empty-state cheerleading, no prompt written by the product
 * pretending to be a thought. A diary that grades you is a diary you stop
 * telling the truth in, and every one of those would have been easy to add.
 */

const MOODS = ['happy', 'calm', 'energised', 'okay', 'low', 'frustrated', 'loved', 'tired', 'inspired'];

const KINDS: Array<{ id: DayItemKind; label: string }> = [
  { id: 'task', label: 'To do' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'appointment', label: 'Appointment' },
];

/** "Saturday, 15 August 2026" — from the date STRING, never from a parsed
 *  instant: `new Date('2026-08-15')` is midnight UTC, which is the 14th for
 *  anybody west of Greenwich, and a diary that renames your day is broken in
 *  the one way a diary may not be. */
function longDate(date: string): { weekday: string; rest: string } {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, (m ?? 1) - 1, d ?? 1);
  return {
    weekday: at.toLocaleDateString(undefined, { weekday: 'long' }),
    rest: at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

function shift(date: string, by: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, (m ?? 1) - 1, (d ?? 1) + by);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

export function DayPage() {
  const { date = '' } = useParams();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const day = useDay(valid ? date : '1970-01-01');
  const save = useSaveDay(date);
  const add = useAddDayItem(date);
  const patch = usePatchDayItem(date);
  const remove = useRemoveDayItem(date);

  const [feelNote, setFeelNote] = useState('');
  const [journal, setJournal] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DayItemKind>('task');
  const [at, setAt] = useState('');
  const [askMira, setAskMira] = useState(false);

  /* THE SERVER'S COPY IS THE TRUTH, AND IT ARRIVES AFTER THE FIRST PAINT. The
     two long fields are typed into, so they hold local state — seeded once the
     day lands, and never re-seeded under somebody mid-sentence. */
  const loaded = day.data?.date;
  useEffect(() => {
    if (!loaded) return;
    setFeelNote(day.data?.feelNote ?? '');
    setJournal(day.data?.journal ?? '');
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const { weekday, rest } = useMemo(() => longDate(valid ? date : '1970-01-01'), [date, valid]);
  const items = day.data?.items ?? [];

  if (!valid) {
    return (
      <div className="page">
        <p className="muted">That is not a day. <Link to="/calendar">Back to the calendar</Link>.</p>
      </div>
    );
  }

  return (
    <div className="page daybook">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <Link to="/calendar" className="btn btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 44 }}>
            <Icon name="back" size={15} /> Back to the calendar
          </Link>
          <div className="eyebrow">{weekday}</div>
          <h1 className="dayb-date">{rest}</h1>
        </div>
      </div>

      {day.isLoading ? <Spinner label="Opening the day…" /> : day.isError ? (
        /* WHAT A FAILED REQUEST WOULD OTHERWISE HAVE SAID. With no branch here,
           `day.data` is undefined and every `?? []` below reads as an answer:
           no mood, no lines, an empty page — the city quietly telling somebody
           that a day they lived and wrote is blank. That is the one sentence a
           diary may not say by accident, so the page says the opposite, out
           loud, and offers the only useful action. */
        <section className="card rise dayb-sec">
          <h2 className="dayb-h">We couldn&rsquo;t open this day</h2>
          <p className="muted">
            Nothing has been lost — whatever you kept here is still kept. We just couldn&rsquo;t reach it
            just now.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void day.refetch()}>
            Try again
          </button>
        </section>
      ) : (
        <>
          {/* ── 01 · FEEL ────────────────────────────────────────────────── */}
          <section className="card rise dayb-sec">
            <h2 className="dayb-h">How did today feel?</h2>
            <div className="dayb-moods" role="group" aria-label="How today felt">
              {MOODS.map((m) => (
                <button key={m} type="button"
                  className={day.data?.mood === m ? 'cstab on' : 'cstab'}
                  aria-pressed={day.data?.mood === m}
                  onClick={() => save.mutate({ mood: day.data?.mood === m ? '' : m })}>
                  {m}
                </button>
              ))}
            </div>
            <label className="dayb-label" htmlFor="dayb-feel">What&rsquo;s behind it?</label>
            <textarea id="dayb-feel" className="dayb-note" rows={2} value={feelNote}
              onChange={(e) => setFeelNote(e.target.value)}
              onBlur={() => { if (feelNote !== (day.data?.feelNote ?? '')) save.mutate({ feelNote }); }}
              placeholder="Optional — a line, if there is one." />
          </section>

          {/* ── 02 · DO ──────────────────────────────────────────────────── */}
          <section className="card rise dayb-sec">
            <h2 className="dayb-h">On this day</h2>
            {items.length === 0 && <p className="muted dayb-empty">Nothing down yet.</p>}
            <ul className="dayb-items">
              {items.map((it) => (
                <li key={it.id} className={it.done ? 'dayb-item is-done' : 'dayb-item'}>
                  <button type="button" className="dayb-tick"
                    aria-label={it.done ? `Mark "${it.title}" as not done` : `Mark "${it.title}" as done`}
                    aria-pressed={it.done}
                    onClick={() => patch.mutate({ id: it.id, done: !it.done })}>
                    {it.done ? '●' : '○'}
                  </button>
                  <span className="dayb-when">{it.at ?? ''}</span>
                  <span className="dayb-what">
                    <span className="dayb-kind">{KINDS.find((k) => k.id === it.kind)?.label ?? it.kind}</span>
                    {it.title}
                  </span>
                  <button type="button" className="dayb-drop" aria-label={`Remove "${it.title}"`}
                    onClick={() => remove.mutate({ id: it.id })}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <form className="dayb-add" onSubmit={(e) => {
              e.preventDefault();
              const clean = title.trim();
              if (!clean) return;
              add.mutate({ kind, title: clean, at: at || null });
              setTitle(''); setAt('');
            }}>
              <select aria-label="What kind" value={kind} onChange={(e) => setKind(e.target.value as DayItemKind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <input aria-label="What is it" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Add something to this day…" maxLength={300} />
              <input aria-label="At what time (optional)" type="time" value={at}
                onChange={(e) => setAt(e.target.value)} />
              <button type="submit" className="btn btn-sm" disabled={!title.trim() || add.isPending}>Add</button>
            </form>
          </section>

          {/* ── 03 · WRITE ───────────────────────────────────────────────── */}
          <section className="card rise dayb-sec">
            <h2 className="dayb-h">Write about today</h2>
            <textarea className="dayb-journal" rows={10} value={journal}
              aria-label="Write about today"
              onChange={(e) => setJournal(e.target.value)}
              onBlur={() => { if (journal !== (day.data?.journal ?? '')) save.mutate({ journal }); }}
              placeholder="What do you want to remember about today?" />
            <p className="dayb-foot">
              {journal.trim() ? `${journal.trim().split(/\s+/).length} words · ` : ''}
              Private — only you. {save.isPending ? 'Saving…' : 'Saved when you click away.'}
            </p>
          </section>

          {/* ── 04 · MIRA ────────────────────────────────────────────────── */}
          <section className="dayb-mira">
            <button type="button" className="mira-door" onClick={() => setAskMira(true)}
              aria-label="Ask Mira about this day" title="Mira can read this day back to you">
              <MiraMark size={48} state="waiting" />
            </button>
            <span className="muted">Ask Mira about this day</span>
          </section>
          {askMira && <MiraDay date={date} onClose={() => setAskMira(false)} />}

          <nav className="dayb-nav" aria-label="Other days">
            <Link to={`/daybook/${shift(date, -1)}`}>← The day before</Link>
            <Link to={`/daybook/${shift(date, 1)}`}>The day after →</Link>
          </nav>
        </>
      )}
    </div>
  );
}
