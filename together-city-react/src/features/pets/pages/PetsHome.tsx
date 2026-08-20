/**
 * ── PET WORLD, THE LANDING ──────────────────────────────────────────────────
 *
 * The hierarchy the brief asked for, in the order it asked for it: the district
 * plate, then YOUR PET'S WORLD — the pets themselves, because a hub about your
 * animals that opens with a product grid has its priorities backwards — then
 * the six rooms, then the district's one honest claim about itself.
 *
 * THE EMPTY STATE IS THE REAL FIRST SCREEN and gets the same care as the full
 * one: a citizen with no pets on file sees an invitation and a working demo
 * door, not a page with a hole in it.
 */

import { useNavigate } from 'react-router-dom';
import { DistrictHero } from '../components/DistrictHero';
import { PetCard } from '../components/PetCard';
import { Empty, ErrorState } from '../components/States';
import { usePets } from '../store';

const ROOMS = [
  { to: '/pets/plan', glyph: '🥣', title: 'Nutrition', line: 'Personalised meal plans for your pet.', cta: 'Create diet plan' },
  { to: '/pets/wellness', glyph: '❤️', title: 'Health & Wellness', line: 'Track your pet’s everyday wellbeing.', cta: 'Open wellness' },
  { to: '/pets/activity', glyph: '🐕', title: 'Activity', line: 'Walks, play and exercise.', cta: 'Log today' },
  { to: '/pets/shop', glyph: '🛍️', title: 'Shop', line: 'Food, treats, toys and essentials.', cta: 'Enter the market' },
  { to: '/pets/services', glyph: '✂️', title: 'Services', line: 'Find vets, groomers, walkers and more.', cta: 'Find services' },
  { to: '/pets/eat', glyph: '🥕', title: 'Can my pet eat this?', line: 'Search any food or ingredient.', cta: 'Check a food' },
];

export function PetsHome() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const plans = usePets((s) => s.plans);
  const activePetId = usePets((s) => s.activePetId);
  const setActive = usePets((s) => s.setActive);
  const error = usePets((s) => s.error);
  const setError = usePets((s) => s.setError);

  return (
    <div style={{ display: 'grid', gap: 'clamp(28px, 5vw, 52px)' }}>
      <DistrictHero
        eyebrow="Together City"
        title="Pets"
        line="Everything your pet needs. All in one place."
        /* The district's own commissioned plate, which is already on disk at
           public/assets/img/pets-hub.webp. Missing in the standalone prototype,
           where the drawn scene stands in — see DistrictHero. */
        image="/assets/img/pets-hub.webp"
        actions={
          <>
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => nav('/pets/profiles?new=1')}
              style={{ background: 'var(--on-stage)', color: 'var(--stage-solid)', border: 'none', fontWeight: 700 }}
            >
              Create your pet profile
            </button>
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => nav('/pets/shop')}
              style={{ background: 'var(--glass)', color: 'var(--on-stage)', border: '1px solid var(--glass-line)', backdropFilter: 'blur(10px)' }}
            >
              Explore pet world
            </button>
          </>
        }
      />

      {/* THE ERROR STATE, ACTUALLY RENDERED.
          `store.error` and `setError` existed from the first commit and nothing
          read them — the dead-export audit caught the other half of that: an
          ErrorState component nobody imported. A screen whose failure branch is
          written but never mounted is a screen with no failure branch, and the
          day api.ts starts talking to a server is the wrong day to find out. */}
      {error && (
        <ErrorState
          line={error}
          onRetry={() => setError(null)}
        />
      )}

      <section style={{ display: 'grid', gap: 16 }}>
        <SectionTitle
          title="Your pet’s world"
          line={pets.length ? 'Switch between pets — every plan, list and recommendation follows the one you choose.' : 'No pets on file yet.'}
        />
        {pets.length === 0 ? (
          <Empty
            glyph="🐾"
            title="Start with one pet"
            line="Add a profile and the whole district reshapes around them — the planner, the shelf, the shopping list and the reminders."
            /* ONE DOOR, AND IT IS THE REAL ONE.
               There was a second button here that filled the district with two
               invented pets to look around with. `scripts/nav-audit.mjs` counts
               that as invented sample data in a component, and it is right to:
               a citizen opening this hub for the first time should be asked for
               their own animal, not shown somebody's demo Labrador. The demo
               data moved to the prototype build, where a reviewer is the whole
               audience. */
            action={
              <button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
                Add a pet
              </button>
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))' }}>
            {pets.map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                active={pet.id === activePetId}
                planned={Boolean(plans[pet.id])}
                onSelect={() => setActive(pet.id)}
                onEdit={() => nav(`/pets/profiles?edit=${pet.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 16 }}>
        <SectionTitle title="The district" line="Six rooms, one animal at the centre of all of them." />
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))' }}>
          {ROOMS.map((room) => (
            <button
              key={room.to}
              type="button"
              onClick={() => nav(room.to)}
              className="card"
              style={{
                display: 'grid', gap: 8, padding: 20, textAlign: 'left', cursor: 'pointer',
                border: '1px solid var(--line)', font: 'inherit',
              }}
            >
              <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{room.glyph}</span>
              <strong style={{ fontSize: 17, fontWeight: 600 }}>{room.title}</strong>
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{room.line}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', marginTop: 4 }}>{room.cta} →</span>
            </button>
          ))}
        </div>
      </section>

      <section
        style={{
          display: 'grid', gap: 12, padding: 'clamp(22px, 4vw, 40px)', borderRadius: 'var(--r-3)',
          background: 'var(--wash)', border: '1px solid var(--line)',
        }}
      >
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase' }}>
          What makes this different
        </span>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 34px)', fontWeight: 300, letterSpacing: '-.02em', lineHeight: 1.15 }}>
          Don’t just shop for your pet.<br />Build a life for your pet.
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65, maxWidth: 620 }}>
          Profile, nutrition, home cooking, shopping, wellness, activity and services are one chain here, not eight
          tabs. The profile decides the calories, the calories decide the meals, the meals write the shopping list,
          and the list knows when the bag runs out.
        </p>
      </section>
    </div>
  );
}

export function SectionTitle({ title, line, action }: { title: string; line?: string; action?: React.ReactNode }) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(19px, 2.6vw, 26px)', fontWeight: 600, letterSpacing: '-.015em' }}>{title}</h2>
        {line && <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, maxWidth: 620 }}>{line}</p>}
      </div>
      {action}
    </header>
  );
}
