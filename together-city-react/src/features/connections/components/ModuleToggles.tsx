import { useHubs } from '@/api/connections.api';
import { allowedModules, moduleDef, optionalOf, universalHubs } from '../modules';

/**
 * The hub checkboxes and chips, drawn from the server's registry
 * (GET /connections/hubs) rather than from a list written here.
 *
 * Both components fetch the registry themselves instead of taking it as a prop.
 * `useHubs` is a shared query with a five-minute staleTime, so the second, third
 * and fourth caller on a page cost nothing, and the alternative — threading a
 * `hubs` prop through MemberFinder, Connections and AddHubMemberDialog — is how
 * a stale copy gets kept somewhere for convenience.
 */

/** Universal hubs — automatically enabled for every connection. */
export function UniversalBlock() {
  const { data: hubs } = useHubs();
  const universal = universalHubs(hubs);
  if (universal.length === 0) return null; // not loaded — say nothing, promise nothing
  return (
    <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--paper)', border: '1px dashed var(--line)' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginRight: 10 }}>Universal</span>
      {universal.map((m) => (
        <span key={m.key} style={{ fontSize: 12.5, fontWeight: 600, marginRight: 12 }}>{'✓'} {m.emoji} {m.label}</span>
      ))}
      <span className="muted" style={{ fontSize: 11 }}>(automatically enabled for every connection)</span>
    </div>
  );
}

/** Checkbox grid of OPTIONAL hubs, scoped by the chosen relationship. */
export function ModuleToggles({ relationship, selected, onChange }: {
  relationship: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: hubs, isLoading, isError, refetch } = useHubs();
  const allowed = allowedModules(hubs, relationship);
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  if (isLoading) {
    return <p className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>Loading the list of hubs…</p>;
  }
  if (isError) {
    // No invented fallback list. If we cannot say what the hubs are, we say that.
    return (
      <div style={{ padding: '10px 12px', borderRadius: 9, border: '1px dashed var(--line)' }}>
        <p style={{ fontSize: 12.5, margin: 0 }}>We couldn’t load the list of hubs just now.</p>
        <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 8px', lineHeight: 1.5 }}>
          Nothing here is guessed, so there’s nothing to show until it loads. Your existing
          connections are unaffected.
        </p>
        <button type="button" onClick={() => void refetch()}
          style={{ minHeight: 44, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>
          Try again
        </button>
      </div>
    );
  }
  if (allowed.length === 0) {
    // The inverse of the usual bug: this used to report a LOAD FAILURE when
    // the list was legitimately empty — for a relationship that grants no
    // optional hubs, "we couldn't load" was a false apology for a true answer.
    return (
      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0', lineHeight: 1.5 }}>
        This relationship has no optional hubs to grant — everything it shares
        is already included.
      </p>
    );
  }

  return (
    <div>
      <UniversalBlock />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 6 }}>
        {allowed.map((key) => {
          const def = moduleDef(hubs, key);
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
      {relationship !== 'family' && (hubs ?? []).some((h) => h.familyOnly) && (
        // Say why the list is shorter. A hub silently missing reads as a bug.
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '8px 0 0' }}>
          {(hubs ?? []).filter((h) => h.familyOnly).map((h) => h.name).join(', ')}{' '}
          {(hubs ?? []).filter((h) => h.familyOnly).length === 1 ? 'is' : 'are'} shared with family only.
          Mark someone as Family to share {(hubs ?? []).filter((h) => h.familyOnly).length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}

/** "Connected Hubs" chips — universal hubs are implied, not listed. */
/**
 * The hubs on a connection, as chips.
 *
 * `caption` exists because the default read as a lie on half the rows it
 * appeared on. A PENDING request showed "Connected hubs: Medical" — present
 * tense, on a connection nobody had accepted, where nothing was connected to
 * anything. A caller that is describing a proposal has to say so.
 */
export function ModuleChips({ modules, caption = 'Connected hubs:' }: { modules: string[]; caption?: string }) {
  const { data: hubs } = useHubs();
  const optional = optionalOf(hubs, modules);
  if (!optional.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 10.5 }}>{caption}</span>
      {optional.map((key) => {
        const def = moduleDef(hubs, key);
        return (
          <span key={key} title={def.label}
            style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--r-full)',
              background: 'var(--paper)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
            {def.emoji} {def.label}
          </span>
        );
      })}
    </div>
  );
}
