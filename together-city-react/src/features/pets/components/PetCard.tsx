/**
 * THE PET, AS A CARD.
 *
 * The one object the whole hub is about, so it earns the largest type on the
 * page it appears on. What it shows is chosen to answer the question an owner
 * actually opens the app with — is the plan on, what is today's target, and is
 * anything overdue — rather than to list the profile back at them.
 */

import type { Pet } from '../types';
import { energyFor, readAge } from '../engine/nutrition';
import { PetPortrait } from './PetPortrait';

interface Props {
  pet: Pet;
  active: boolean;
  planned: boolean;
  onSelect: () => void;
  onEdit: () => void;
}

export function PetCard({ pet, active, planned, onSelect, onEdit }: Props) {
  const age = readAge(pet);
  const energy = energyFor(pet);
  return (
    <article
      className="card"
      style={{
        display: 'grid', gap: 14, padding: 18,
        border: active ? '1px solid var(--accent-line)' : '1px solid var(--line)',
        background: active ? 'var(--accent-soft)' : 'var(--card)',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
        <PetPortrait pet={pet} size={72} />
        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>{pet.name}</h3>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            {pet.breed} · {age.label} · {pet.weightKg ? `${pet.weightKg} kg` : 'weight not set'}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
            {pet.sterilised ? 'Sterilised' : pet.sterilised === false ? 'Not sterilised' : 'Sterilisation unknown'}
            {' · '}{pet.housing === 'both' ? 'Indoor & outdoor' : pet.housing}
          </p>
        </div>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10, margin: 0 }}>
        <Stat label="Daily target" value={`${energy.merKcal} kcal`} />
        <Stat label="Treat budget" value={`${Math.round(energy.merKcal * 0.1)} kcal`} />
        <Stat label="Plan" value={planned ? 'Active' : 'Not made'} tone={planned ? 'ok' : 'muted'} />
      </dl>

      {/* The four that are not the main one. Small, and only when they exist —
          a row of empty frames would be the card asking for homework. */}
      {pet.photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {pet.photos.slice(1).map((photo, i) => (
            <img
              key={photo.id}
              src={photo.url}
              alt={`${pet.name}, photo ${i + 2}`}
              style={{ width: 38, height: 38, borderRadius: 'var(--r-1)', objectFit: 'cover', border: '1px solid var(--line)' }}
            />
          ))}
        </div>
      )}

      {pet.allergies.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--danger-ink)' }}>
          Avoids: {pet.allergies.join(', ')}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={onSelect} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
          {active ? 'Selected' : `Switch to ${pet.name}`}
        </button>
        <button type="button" className="btn btn-sm btn-line" onClick={onEdit}>Edit profile</button>
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'muted' }) {
  return (
    <div>
      <dt className="muted" style={{ fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</dt>
      <dd style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: tone === 'ok' ? 'var(--ok-ink)' : tone === 'muted' ? 'var(--muted)' : 'inherit' }}>
        {value}
      </dd>
    </div>
  );
}
