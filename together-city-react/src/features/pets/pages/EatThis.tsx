/**
 * ── CAN MY PET EAT THIS? ────────────────────────────────────────────────────
 *
 * A search box with three possible answers and a species toggle, because the
 * answer genuinely differs: xylitol is a dog emergency and, per Merck, not a
 * feline hypoglycaemia risk; onion is dangerous to both and far more so to
 * cats; lilies are lethal to cats and a footnote for dogs.
 *
 * THE TOXIC LIST IS SEARCHED FIRST AND WINS OUTRIGHT. That rule lives in
 * `api.ts` and is the single most important line of logic in this hub: a fuzzy
 * ingredient match must never be able to return SAFE for a string that also
 * matches something on the never-feed list.
 *
 * NOTHING HERE IS PARAPHRASED FROM MEMORY. Every card carries the sources it
 * came from, and the ones where the veterinary literature disagrees — avocado,
 * raw versus cooked bones — say so on the card rather than picking a side.
 */

import { useState } from 'react';
import { VerdictBadge } from '../components/VerdictBadge';
import { verdictLine } from '../components/verdictTone';
import { Disclaimer } from '../components/Disclaimer';
import { SectionTitle } from './PetsHome';
import { useIngredientSearch, useNeverFeed } from '../api';
import { usePets } from '../store';
import type { Species } from '../types';

const QUICK = ['Chicken', 'Rice', 'Carrot', 'Apple', 'Egg', 'Milk', 'Peanut butter', 'Fish', 'Onion', 'Chocolate', 'Curd', 'Paneer'];

export function EatThis() {
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const active = pets.find((p) => p.id === activePetId);
  const [species, setSpecies] = useState<Species>(active?.species ?? 'dog');
  const [term, setTerm] = useState('');
  const { data: hit } = useIngredientSearch(term, species);
  const { data: toxic } = useNeverFeed();

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <SectionTitle
        title="Can my pet eat this?"
        line="Search any food. Answers come from the Merck Veterinary Manual, ASPCA Animal Poison Control, VCA and Cornell — with the source on every card."
      />

      <div className="card" style={{ padding: 'clamp(16px, 3vw, 26px)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['dog', 'cat'] as Species[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpecies(s)}
              aria-pressed={species === s}
              style={{
                font: 'inherit', fontSize: 13, fontWeight: species === s ? 700 : 500, padding: '8px 18px',
                borderRadius: 999, cursor: 'pointer', textTransform: 'capitalize',
                border: `1px solid ${species === s ? 'var(--accent-line)' : 'var(--line)'}`,
                background: species === s ? 'var(--accent-soft)' : 'var(--card)',
                color: species === s ? 'var(--accent-ink)' : 'var(--ink-soft)',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Type a food — chicken, grapes, curd, chocolate…"
          aria-label="Search a food or ingredient"
          style={{
            font: 'inherit', fontSize: 'clamp(16px, 2.6vw, 21px)', padding: '16px 18px',
            borderRadius: 'var(--r-3)', border: '1px solid var(--line)', background: 'var(--wash)', color: 'var(--ink)',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setTerm(q)}
              style={{ font: 'inherit', fontSize: 12, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer' }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {term.trim() && hit.toxic && (
        <article
          style={{
            display: 'grid', gap: 12, padding: 'clamp(18px, 3vw, 28px)', borderRadius: 'var(--r-3)',
            background: 'var(--danger-soft)', border: '1px solid var(--danger-line)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <VerdictBadge verdict="AVOID" size="lg" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--danger-ink)' }}>
              {hit.toxic.severity} · affects {hit.toxic.affects.toLowerCase()}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 600, letterSpacing: '-.02em' }}>{hit.toxic.name}</h3>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--danger-ink)' }}><strong>{hit.toxic.whatToDo}</strong></p>
          <Row label="Why" value={hit.toxic.mechanism} />
          {hit.toxic.dose && <Row label="Documented dose" value={hit.toxic.dose} />}
          <Row label="Signs" value={hit.toxic.symptoms.join(' · ')} />
          {hit.toxic.onset && <Row label="Onset" value={hit.toxic.onset} />}
          {hit.toxic.speciesNote && <Row label="Dogs vs cats" value={hit.toxic.speciesNote} />}
          <Sources urls={hit.toxic.sources} />
          <Related names={hit.related} onPick={setTerm} />
        </article>
      )}

      {term.trim() && !hit.toxic && hit.ingredient && hit.verdict && (
        <article className="card" style={{ padding: 'clamp(18px, 3vw, 28px)', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <VerdictBadge verdict={hit.verdict} size="lg" />
            <span className="muted" style={{ fontSize: 13 }}>{verdictLine(hit.verdict)}</span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 600, letterSpacing: '-.02em' }}>{hit.ingredient.name}</h3>
            {hit.ingredient.indianName && <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>{hit.ingredient.indianName}</p>}
          </div>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
            {species === 'dog' ? hit.ingredient.dogReason : hit.ingredient.catReason}
          </p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(228px, 1fr))' }}>
            <Cell label="How to prepare it" value={hit.ingredient.preparation} />
            <Cell label="How much" value={hit.ingredient.portion} />
            <Cell label="How often" value={hit.ingredient.frequency} />
            <Cell label="Raw or cooked" value={hit.ingredient.rawCooked} />
          </div>
          {hit.ingredient.risks.length > 0 && (
            <div>
              <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Risks</span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                {hit.ingredient.risks.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
            <span>Dogs: <VerdictBadge verdict={hit.ingredient.dog} size="sm" /></span>
            <span>Cats: <VerdictBadge verdict={hit.ingredient.cat} size="sm" /></span>
          </div>
          <Sources urls={hit.ingredient.sources} />
          <Related names={hit.related} onPick={setTerm} />
        </article>
      )}

      {term.trim() && !hit.toxic && !hit.ingredient && (
        <article className="card" style={{ padding: 24, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Not in the database</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            “{term}” isn’t one of the {51} ingredients or {toxic.length} toxic foods we have veterinary sources for.
            That is not the same as safe — ask your vet before offering it.
          </p>
          {hit.suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hit.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setTerm(s)} style={{ font: 'inherit', fontSize: 12, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          )}
        </article>
      )}

      <section style={{ display: 'grid', gap: 14 }}>
        <SectionTitle title="Never feed" line={`${toxic.length} foods with documented veterinary toxicity. Sorted by severity, with the mechanism and the dose where a source states one.`} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))' }}>
          {toxic.map((t) => (
            <article
              key={t.name}
              style={{
                display: 'grid', gap: 7, padding: 15, borderRadius: 'var(--r-2)',
                background: t.severity === 'FATAL' ? 'var(--danger-soft)' : 'var(--card)',
                border: `1px solid ${t.severity === 'FATAL' ? 'var(--danger-line)' : 'var(--line)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{t.name.split(' (')[0]}</strong>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: t.severity === 'FATAL' ? 'var(--danger-ink)' : 'var(--warn-ink)' }}>
                  {t.severity}
                </span>
              </div>
              <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t.affects}</span>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>{t.mechanism}</p>
            </article>
          ))}
        </div>
      </section>

      <Disclaimer text="Ingredient guidance here is general and species-level. If your pet has eaten something on the never-feed list, call a veterinarian immediately — do not wait for symptoms, and do not induce vomiting unless a vet tells you to." />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>
      <strong style={{ fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>{label}</strong>
      {value}
    </p>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 'var(--r-2)', background: 'var(--wash)' }}>
      <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</span>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>{value}</p>
    </div>
  );
}

function Related({ names, onPick }: { names: string[]; onPick: (n: string) => void }) {
  if (!names.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        Also on file
      </span>
      {names.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          style={{ font: 'inherit', fontSize: 11.5, padding: '4px 11px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer' }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Sources({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.6 }}>
      Sources:{' '}
      {urls.slice(0, 4).map((u, i) => (
        <span key={u}>
          {i > 0 && ' · '}
          <a href={u} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{new URL(u).hostname.replace('www.', '')}</a>
        </span>
      ))}
    </p>
  );
}
