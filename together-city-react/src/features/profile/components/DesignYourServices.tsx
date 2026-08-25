import { HUBS } from '@/config/hubs';
import { DESIGNABLE_HUBS } from '@/config/services';
import { useCityDesign, useDesignServices } from '@/hooks/useCityDesign';
import { Switch } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { tabIcon } from '@/nav/registry';
import type { HubKey } from '@/types';

/**
 * DESIGN YOUR SERVICES — the control room where a citizen chooses their city.
 *
 * Every hub with a door on the street, as a card with one switch. A switch,
 * not a checkbox, because it takes effect the moment it moves (see Switch.tsx)
 * — no Save button, no draft state, no half-answer to store. The whole list
 * travels on every press; if the city refuses, the switch moves back.
 *
 * What OFF means is written on the section rather than implied: the hub's
 * doors leave this citizen's header, drawer, home page and city grid, and
 * nothing else happens. Rooms keep answering, data stays, Mira and the
 * command palette can still take them there. Hidden is not deleted — the
 * rule Travel established when it left the street for everyone, now available
 * to one citizen at a time.
 */
export function DesignYourServices() {
  const { hidden } = useCityDesign();
  const design = useDesignServices();

  const setHub = (key: HubKey, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(key); else next.add(key);
    design.mutate(DESIGNABLE_HUBS.filter((k) => next.has(k)));
  };

  const onCount = DESIGNABLE_HUBS.length - hidden.size;

  return (
    <section aria-label="Design your services">
      <div className="eyebrow">Design your services</div>
      <h2 style={{ margin: '4px 0 6px', fontSize: 20 }}>Build Together City around your life.</h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px', maxWidth: '62ch', lineHeight: 1.6 }}>
        Switch a hub off and its doors leave your header, your drawer, your home
        page and your city grid. Nothing is deleted — its rooms still answer,
        everything it knows about you stays, and one press here puts it back.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {DESIGNABLE_HUBS.map((key) => {
          const cfg = HUBS[key];
          const on = !hidden.has(key);
          return (
            <div key={key} data-hub={key} className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: on ? 1 : 0.62 }}>
              <span aria-hidden style={{ color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
                <Icon name={tabIcon(key)} size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, lineHeight: 1.25 }}>{cfg.name}</span>
                <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cfg.tag}
                </span>
              </span>
              <Switch checked={on} onChange={(next) => setHub(key, next)}
                label={`${cfg.name} ${on ? 'on' : 'off'}`} hideLabel />
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.55 }}>
        {hidden.size === 0
          ? 'The whole city is on. Everything stays exactly as it is until you switch something off.'
          : `${onCount} of ${DESIGNABLE_HUBS.length} hubs on. The ${hidden.size === 1 ? 'one you switched off is' : `${hidden.size} you switched off are`} hidden, not gone — saved links still open, and Mira can still take you there.`}
      </p>
    </section>
  );
}
