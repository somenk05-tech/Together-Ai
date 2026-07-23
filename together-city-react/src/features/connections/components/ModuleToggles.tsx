import { allowedModules, moduleDef } from '../modules';

/** Checkbox grid of hub modules, scoped by the chosen relationship. */
export function ModuleToggles({ relationship, selected, onChange }: {
  relationship: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const allowed = allowedModules(relationship);
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
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
  );
}

/** Compact chips summarising granted modules on a connection row. */
export function ModuleChips({ modules }: { modules: string[] }) {
  if (!modules.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {modules.map((key) => {
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
