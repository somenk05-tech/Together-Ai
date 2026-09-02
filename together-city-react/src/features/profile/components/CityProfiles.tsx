import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useCityProfiles } from '../hooks';
import type { CityProfileField, CityProfilePanel } from '../api';

/**
 * EVERY PROFILE IN THE CITY, ON THE PAGE THAT CLAIMS TO BE THEIR SOURCE.
 *
 * The Master Profile has said "entered once — every hub reads from it" since
 * the day it was written, and until now that sentence was an assertion. The
 * page could show the seven boxes it owns and nothing else, so a citizen who
 * wanted the only reasonable question answered — WHAT DO YOU ACTUALLY HAVE ON
 * ME — had to open fourteen hubs and read fourteen forms, and the record's own
 * page was the one place that could not tell them.
 *
 * This is the sentence with its receipts. One collapsed panel per store, every
 * field it holds and the value in it, and a mark on each field saying whether
 * the record put it there or the hub owns it alone.
 *
 * COLLAPSED BY DEFAULT, AND THAT IS THE DESIGN. Fourteen stores of fields
 * opened flat is a page nobody scrolls to the end of — and the point of the
 * panel is that the SHUT state already answers the common question (does this
 * hub hold anything, and how much). Open one and it is a page of its own
 * without ever having been a page of its own.
 *
 * READ-ONLY, DELIBERATELY. Every panel ends at a door to the hub that owns the
 * writing. A field is owned by exactly one place — the rule the Master Profile
 * exists to enforce — and a second editor for a hub's fields, on the very page
 * whose argument is against duplicate copies, would be the defect wearing the
 * fix's clothes. The record above stays the one editor of what the record owns;
 * this says who else reads it and what they have added of their own.
 *
 * NOTHING IS INVENTED. A field nobody has filled in draws a blank rule rather
 * than a plausible value, a hub nobody has opened says so, and the "started"
 * test is the server's `answeredAt` column — never a comparison against a
 * default, because "everything" and "maintain" are also perfectly good answers.
 */

/** Deep-link shape, so a hub can send somebody to its own panel. */
const anchorOf = (key: string) => `profile-${key}`;

export function CityProfiles() {
  const q = useCityProfiles();
  const [open, setOpen] = useState<Set<string>>(() => new Set<string>());

  const panels = useMemo(() => q.data?.panels ?? [], [q.data]);
  const mastered = useMemo(() => q.data?.mastered ?? [], [q.data]);

  /**
   * A LINK INTO A PANEL MUST FIND IT OPEN.
   *
   * The browser resolves #profile-astrology before React has drawn anything,
   * and a collapsed panel is not a scroll target — so without this the citizen
   * lands at the top of a long page with a shut box somewhere below it, which
   * is worse than not having linked at all.
   */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith('profile-') || q.isLoading) return;
    const key = id.slice('profile-'.length);
    setOpen((s) => new Set(s).add(key));
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [q.isLoading]);

  const toggle = (key: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allOpen = panels.length > 0 && panels.every((p) => open.has(p.key));
  const filledMaster = mastered.filter((f) => f.value !== null).length;

  return (
    <section className="cprofs" id="every-profile">
      <div className="eyebrow">Every profile in the city</div>
      <h2 className="cprofs-h">What each hub holds, and where it came from</h2>
      <p className="muted cprofs-lede">
        One page per store, shut until you open it. Fields marked{' '}
        <span className="cmark">from your record</span> are the ones the boxes
        above fill in — change them once there and every hub below follows.
        Everything else is the hub&rsquo;s own, and is edited where it lives.
      </p>

      {q.isLoading && <Spinner label="Reading every hub…" />}
      {q.isError && (
        <p className="cprofs-err">
          We couldn&rsquo;t read your hubs just now. Nothing is lost — reload to try again.
        </p>
      )}

      {q.data && (
        <>
          <div className="cprofs-bar">
            <span className="muted">
              {q.data.startedCount} of {panels.length} started · {filledMaster} of {mastered.length} shared
              fields filled in
            </span>
            <button type="button" className="btn btn-line btn-sm"
              onClick={() => setOpen(allOpen ? new Set() : new Set(panels.map((p) => p.key)))}>
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          </div>

          {/* ── THE SOURCE, NAMED ────────────────────────────────────────────
              A page that says "entered once" and then lists fourteen hubs has
              asked to be taken on trust. This is the same claim as a table:
              the field, what is in it, and every store that reads it. */}
          <details className="cprof csource" open={open.has('__source')}>
            <summary onClick={(e) => { e.preventDefault(); toggle('__source'); }}>
              <span className="ccode">TC</span>
              <b>What this record supplies</b>
              <span className="csum">{filledMaster} of {mastered.length} filled in</span>
              <i className="cchev" aria-hidden="true" />
            </summary>
            <div className="cbody">
              <p className="muted cnote">
                Every field below is written in the boxes above this section and read by the hubs
                named beside it. Nothing here is ever asked for a second time.
              </p>
              <dl className="cfields">
                {mastered.map((f) => (
                  <div className="cfield" key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>
                      {f.value === null ? <span className="cblank" aria-label="Not recorded" /> : f.value}
                      <span className="cread">Read by {f.readBy.join(', ')}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <a href="#your-details" className="cdoor">Edit these ↑</a>
            </div>
          </details>

          {panels.map((p) => (
            <Panel key={p.key} panel={p} open={open.has(p.key)} onToggle={() => toggle(p.key)} />
          ))}
        </>
      )}
    </section>
  );
}

function Panel({ panel: p, open, onToggle }: { panel: CityProfilePanel; open: boolean; onToggle: () => void }) {
  const shown = p.fields.filter((f) => f.value !== null).length;
  return (
    <details className="cprof" id={anchorOf(p.key)} open={open} data-started={p.started ? 'true' : 'false'}>
      <summary onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <span className="ccode">{p.code}</span>
        <b>{p.label}</b>
        {/* THE SHUT STATE ANSWERS THE COMMON QUESTION. Not a teaser for the
            open one: "nothing recorded yet" is the whole answer for a hub
            somebody has never opened, and they never need to open the panel. */}
        <span className="csum">{p.summary ?? (p.started ? `${shown} recorded` : 'Nothing recorded yet')}</span>
        {p.percent !== null && <span className="cpct">{p.percent}%</span>}
        <i className="cchev" aria-hidden="true" />
      </summary>
      <div className="cbody">
        <p className="muted cnote">{p.blurb}</p>

        {p.counts.filter((c) => c.value > 0).length > 0 && (
          <div className="ccounts">
            {p.counts.filter((c) => c.value > 0).map((c) => (
              <span key={c.label}><b>{c.value}</b> {c.label.toLowerCase()}</span>
            ))}
          </div>
        )}

        {p.fields.length > 0 ? (
          <dl className="cfields">
            {p.fields.map((f) => <FieldRow key={f.label} field={f} />)}
          </dl>
        ) : (
          <p className="muted cnote">Nothing is stored here yet.</p>
        )}

        {/* ANYTHING THE HUB PUT IN ITS OWN BLOB. Hubs keep their long-tail
            answers in a JSON column, and a page claiming to list everything
            the city holds cannot quietly stop at the columns that happen to
            have names. Walked, not summarised away. */}
        {p.extra.length > 0 && (
          <>
            <div className="cextra-h">Also recorded here</div>
            <dl className="cfields">
              {p.extra.map((f) => <FieldRow key={f.label} field={f} />)}
            </dl>
          </>
        )}

        <Link to={p.href} className="cdoor">{p.editLabel} →</Link>
      </div>
    </details>
  );
}

function FieldRow({ field: f }: { field: CityProfileField }) {
  return (
    <div className="cfield" data-source={f.source}>
      <dt>
        {f.label}
        {f.source === 'master' && <span className="cmark">from your record</span>}
      </dt>
      <dd>
        {f.value === null
          ? <span className="cblank" aria-label="Not recorded" />
          : f.value}
        {f.hint && <span className="chint">{f.hint}</span>}
      </dd>
    </div>
  );
}
