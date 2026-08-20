/**
 * ── PET SERVICES ────────────────────────────────────────────────────────────
 *
 * A marketplace shape over SAMPLE listings, and the banner says exactly that.
 * The real directory is a join to Together City's own Local Services hub, which
 * already holds verified businesses and geography — building a second, invented
 * directory here would be the wrong answer twice over.
 *
 * THE EMERGENCY CARD IS NOT SAMPLE DATA. What to do in an emergency is generic
 * and true, so it is stated plainly and pinned to the top for cats and dogs
 * alike, whatever the directory below it contains.
 */

import { useState } from 'react';
import { SectionTitle } from './PetsHome';
import { Empty } from '../components/States';
import { useServices } from '../api';
import { SERVICE_CITIES, SERVICE_KINDS } from '../data/services';

export function Services() {
  const [kind, setKind] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const { data: listings } = useServices(kind, city);

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SectionTitle title="Pet services" line="Vets, groomers, boarding, sitters, walkers, trainers and stores near you." />

      <section style={{ display: 'grid', gap: 8, padding: 18, borderRadius: 'var(--r-3)', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--danger-ink)' }}>In an emergency</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--danger-ink)' }}>
          Call the nearest open veterinary hospital before you travel, so they are ready when you arrive. If your pet
          has eaten something toxic, take the packet with you and do not induce vomiting unless a vet instructs you to.
          Collapse, laboured breathing, a distended abdomen, seizures, straining to urinate in a male cat, or a
          suspected poisoning are all immediate — do not wait for morning.
        </p>
      </section>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
        <strong>Sample directory.</strong> The listings below are placeholders showing the shape of the section. Real
        businesses, ratings and geography come from Together City’s Local Services hub — inventing named clinics with
        opening hours would be indistinguishable from a real directory to somebody in a hurry.
      </p>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Chip on={kind === 'all'} onClick={() => setKind('all')}>All services</Chip>
        {SERVICE_KINDS.map((k) => (
          <Chip key={k.key} on={kind === k.key} onClick={() => setKind(k.key)}>{k.glyph} {k.label}</Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Chip on={city === 'all'} onClick={() => setCity('all')}>Everywhere</Chip>
        {SERVICE_CITIES.map((c) => <Chip key={c} on={city === c} onClick={() => setCity(c)}>{c}</Chip>)}
      </div>

      {listings.length === 0 ? (
        <Empty glyph="📍" title="Nothing in that combination" line="Try another city or service type." />
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))' }}>
          {listings.map((s) => (
            <article key={s.id} className="card" style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {SERVICE_KINDS.find((k) => k.key === s.kind)?.label}
                </span>
                {s.rating && <span style={{ fontSize: 12.5, fontWeight: 700 }}>★ {s.rating}</span>}
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{s.name}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{s.area}, {s.city} · {s.open}</p>
              <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>{s.note}</p>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Sample listing · not a real business
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        font: 'inherit', fontSize: 12.5, fontWeight: on ? 700 : 500, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line)'}`,
        background: on ? 'var(--accent-soft)' : 'var(--card)',
        color: on ? 'var(--accent-ink)' : 'var(--ink-soft)',
      }}
    >
      {children}
    </button>
  );
}
