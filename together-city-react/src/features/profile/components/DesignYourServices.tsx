import { HUBS } from '@/config/hubs';
import { DESIGNABLE_HUBS } from '@/config/services';
import { PATHS, type PathDef } from '@/config/paths';
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

  const save = (next: Set<string>) => design.mutate(DESIGNABLE_HUBS.filter((k) => next.has(k)));

  const setHub = (key: HubKey, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(key); else next.add(key);
    save(next);
  };

  /* A path is ON when every hub in it is on — derived, never stored, so this
     switch can never disagree with the hub switches above it. */
  const pathOn = (p: PathDef) => p.hubs.every((h) => !hidden.has(h));

  const setPath = (path: PathDef, on: boolean) => {
    const next = new Set(hidden);
    if (on) {
      for (const h of path.hubs) next.delete(h);
    } else {
      /* Only the hubs no OTHER fully-on path is standing on. Turning off
         Self Care must not quietly break the Healthy Lifestyle you left on. */
      const held = new Set(PATHS
        .filter((q) => q.key !== path.key && pathOn(q))
        .flatMap((q) => [...q.hubs]));
      for (const h of path.hubs) if (!held.has(h)) next.add(h);
    }
    save(next);
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

      {/* ── DESIGN YOUR PATHS ─────────────────────────────────────────────
          A path is a named set of hubs that work together, and nothing more:
          on when every hub in it is on, derived from the switches above
          rather than stored beside them. See config/paths.ts for why. */}
      <div className="eyebrow" style={{ marginTop: 26 }}>Design your paths</div>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 14px', maxWidth: '62ch', lineHeight: 1.6 }}>
        Hubs that work together, switched together. A path is on when every hub
        in it is on; switching one on opens all of its hubs, and switching it
        off closes only the hubs none of your other paths are using.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {PATHS.map((p) => {
          const on = pathOn(p);
          return (
            <div key={p.key} className="card" style={{ display: 'flex', gap: 10, opacity: on ? 1 : 0.62 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {p.hubs.map((h) => (
                    <span key={h} aria-hidden style={{ color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
                      <Icon name={tabIcon(h)} size={14} />
                    </span>
                  ))}
                </span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, marginTop: 6, lineHeight: 1.25 }}>{p.name}</span>
                <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{p.line}</span>
                <span className="muted" style={{ display: 'block', fontSize: 10.5, marginTop: 5, fontWeight: 600 }}>
                  {p.hubs.map((h) => HUBS[h].name).join(' + ')}
                </span>
              </span>
              <Switch checked={on} onChange={(next) => setPath(p, next)}
                label={`${p.name} path ${on ? 'on' : 'off'}`} hideLabel />
            </div>
          );
        })}
      </div>
    </section>
  );
}
