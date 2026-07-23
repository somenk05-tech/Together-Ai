import { UNIVERSAL_MODULES, allowedModules, moduleDef, optionalOf } from '../modules';

/** Universal modules — automatically enabled for every connection. */
export function UniversalBlock() {
  return (
    <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--paper)', border: '1px dashed var(--line)' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginRight: 10 }}>Universal</span>
      {UNIVERSAL_MODULES.map((m) => (
        <span key={m.key} style={{ fontSize: 12.5, fontWeight: 600, marginRight: 12 }}>{'\u2713'} {m.emoji} {m.label}</span>
      ))}
      <span className="muted" style={{ fontSize: 11 }}>(automatically enabled for every connection)</span>
    </div>
  );
}

/** Checkbox grid of OPTIONAL hub modules, scoped by the chosen relationship. */
export function ModuleToggles({ relationship, selected, onChange }: {
  relationship: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const allowed = allowedModules(relationship);
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
    <div>
      <UniversalBlock />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 6 }}>
        {allowed.map((key) => {
          const def = moduleDef(key);
          const on = selected.includes(key);
          return (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
              padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
              background: on ? 'var(--accent-soft)' : 'transparent' }}>
              <input type="checkbox" checked={on} onChange={() => toggle(key)} style={{ accentColor: 'var(--accent)' }} />
              <span>{def.emoji} {def.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** "Connected Hubs" chips — universal modules are implied, not listed. */
export function ModuleChips({ modules }: { modules: string[] }) {
  const optional = optionalOf(modules);
  if (!optional.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 10.5 }}>Connected hubs:</span>
      {optional.map((key) => {
        const def = moduleDef(key);
        return (
          <span key={key} title={def.label}
            style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
              background: 'var(--paper)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
            {def.emoji} {def.label}
          </span>
        );
      })}
    </div>
  );
}
