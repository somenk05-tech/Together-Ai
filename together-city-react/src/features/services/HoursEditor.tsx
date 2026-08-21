import { useState } from 'react';
import { Button , Switch} from '@/components/ui';
import { useUpdateService, type MyServiceCard } from './api';
import {
  DAY_LONG, DAY_SHORT, blankWeek, clockLabel, openSentence, openStateNow, summarise, todayIdx,
  type DayHours,
} from './hours';

/**
 * OPEN, CLOSED, AND WHEN — set once.
 *
 * The owner, 16 Aug: a business should be able to say which days it is open
 * and at what times, once, and have the city know. This is the section on My
 * business that does it, and the badge on the same row is what that setting
 * buys — a door that says OPEN or CLOSED without anybody having to remember
 * to flip it.
 *
 * NO MANUAL OPEN/CLOSED SWITCH, AND THAT IS THE POINT. The obvious design is
 * a toggle the owner flips on the way in and out. The Daily Offers page next
 * door already learned what that costs: a flag somebody has to remember to
 * turn off is one nobody turns off, and a directory full of shops claiming to
 * be open at 2am is worse than one that says nothing. Hours are a fact that
 * stays true; a switch is a promise renewed every morning. So the state is
 * DERIVED, on the reader's own clock, from the week set here.
 *
 * (Closing for good, or for a month, is a different act with a different
 * button — "Close listing", further down the card, which takes the business
 * out of the directory and leaves open conversations open.)
 *
 * WHAT IS SAVED IS THE WHOLE WEEK. Seven rows go up together, the way the
 * menu does: a week is a small document, and "these are the hours now" cannot
 * get out of step with itself the way a patch can.
 */
const field: React.CSSProperties = {
  padding: '7px 9px', border: '1.5px solid var(--line)', borderRadius: 9,
  fontSize: 13, fontFamily: 'inherit', background: 'var(--card)',
};

export function OpenBadge({ hours }: { hours?: DayHours[] | null }) {
  const state = openStateNow(hours);
  const idx = todayIdx();
  if (state.open === null) {
    return <span className="muted" style={{ fontSize: 12.5 }}>Hours not set</span>;
  }
  const sentence = openSentence(state, idx);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
        borderRadius: 'var(--r-full)', padding: '2px 9px',
        background: state.open ? 'var(--ok-soft, var(--accent-soft))' : 'transparent',
        color: state.open ? 'var(--ok-ink, var(--accent-ink))' : 'var(--muted)',
        border: `1px solid ${state.open ? 'var(--ok-line, var(--accent-line))' : 'var(--line)'}`,
      }}>{state.open ? 'Open now' : 'Closed now'}</span>
      {sentence && <span className="muted" style={{ fontSize: 12.5 }}>{sentence}</span>}
    </span>
  );
}

/** The week, folded — "Mon–Fri 9:00 am – 6:00 pm". Shown to whoever is
 *  reading, owner or neighbour. */
export function HoursTable({ hours, highlightToday = true }: { hours?: DayHours[] | null; highlightToday?: boolean }) {
  const rows = summarise(hours);
  if (rows.length === 0) return null;
  const idx = todayIdx();
  const todayLabel = DAY_SHORT[idx];
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {rows.map((r) => {
        const isToday = highlightToday && r.label.includes(todayLabel);
        return (
          <div key={r.label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
            <span style={{ minWidth: 76, fontWeight: isToday ? 700 : 400 }}>{r.label}</span>
            <span className={r.closed ? 'muted' : undefined} style={{ fontWeight: isToday && !r.closed ? 700 : 400 }}>{r.when}</span>
          </div>
        );
      })}
    </div>
  );
}

export function HoursEditor({ listing }: { listing: MyServiceCard }) {
  const save = useUpdateService(listing.id);
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<DayHours[]>(listing.hours ?? blankWeek());
  const [err, setErr] = useState<string | null>(null);

  const set = (day: number, patch: Partial<DayHours>) =>
    setWeek((w) => w.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  /* THE ONE SHORTCUT WORTH HAVING. Most shops keep the same hours six days a
     week, and typing them seven times is how somebody gives up halfway and
     leaves a wrong Wednesday behind. It copies the times only — which days
     are open stays each day's own answer. */
  const applyToAll = () => {
    const first = week.find((d) => d.open) ?? week[0];
    setWeek((w) => w.map((d) => ({ ...d, from: first.from, to: first.to })));
  };

  const submit = () => {
    setErr(null);
    save.mutate({ hours: week }, {
      onSuccess: () => setOpen(false),
      onError: (e: unknown) => {
        const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not save those hours.');
      },
    });
  };

  const clear = () => {
    setErr(null);
    save.mutate({ hours: [] }, { onSuccess: () => { setWeek(blankWeek()); setOpen(false); } });
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>Hours</strong>
        <OpenBadge hours={listing.hours} />
        <Button variant="line" size="sm" onClick={() => { setWeek(listing.hours ?? blankWeek()); setOpen((v) => !v); }}>
          {open ? 'Cancel' : listing.hours ? 'Edit hours' : 'Set your hours'}
        </Button>
      </div>

      {!open && listing.hours && (
        <div style={{ marginTop: 8 }}><HoursTable hours={listing.hours} /></div>
      )}

      {!open && !listing.hours && (
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.55 }}>
          Nobody can see when you’re open. Set it once and your page says “Open now” or “Closed”
          by itself — there’s no switch to remember.
        </p>
      )}

      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {week.map((d) => (
            <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Open or closed, and it takes effect as it moves — a switch,
                  not a tick. The day is the name; role="switch" says on/off. */}
              <span style={{ minWidth: 132, fontWeight: 600 }}>
                <Switch checked={d.open} onChange={(open) => set(d.day, { open })}
                  label={DAY_LONG[d.day]} />
              </span>
              {d.open ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input type="time" style={field} value={d.from} aria-label={`${DAY_LONG[d.day]} opening time`}
                    onChange={(e) => set(d.day, { from: e.target.value })} />
                  <span className="muted" style={{ fontSize: 12.5 }}>to</span>
                  <input type="time" style={field} value={d.to} aria-label={`${DAY_LONG[d.day]} closing time`}
                    onChange={(e) => set(d.day, { to: e.target.value })} />
                  {/* A KITCHEN THAT SHUTS AT ONE IN THE MORNING IS NOT A
                      MISTAKE, and the form says so rather than refusing it. */}
                  {d.to <= d.from && (
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      — closes {clockLabel(d.to)} the next morning
                    </span>
                  )}
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12.5 }}>Closed</span>
              )}
            </div>
          ))}

          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="accent" size="sm" disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save hours'}
            </Button>
            <Button variant="line" size="sm" disabled={save.isPending} onClick={applyToAll}>
              Same times every day
            </Button>
            {listing.hours && (
              <Button variant="line" size="sm" disabled={save.isPending} onClick={clear}>
                Take hours off my page
              </Button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
            Set once. Your page and your card work out “open now” from these — there is no switch to
            flip each morning, which is the one nobody remembers.
          </p>
        </div>
      )}
    </div>
  );
}
