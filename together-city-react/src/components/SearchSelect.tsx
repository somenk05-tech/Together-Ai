import { useEffect, useMemo, useRef, useState } from 'react';
import { useLookups, type LookupOption } from '@/api/lookups.api';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */
const NONE: never[] = [];

interface Props {
  /** Currently selected label (what's stored/displayed). */
  value?: string | null;
  onChange: (opt: LookupOption | null) => void;
  /** Master-data category to load, e.g. 'country' | 'state' | 'city' | 'religion'. */
  category?: string;
  /** Parent code for hierarchical categories (state→country, city→state). */
  parent?: string | null;
  /** Static options instead of a backend category (e.g. a height range). */
  options?: LookupOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Show an "Any" clear row at the top (for preference filters). */
  clearable?: boolean;
  clearLabel?: string;
  ariaLabel?: string;
}

/**
 * Searchable single-select dropdown backed by the platform master tables.
 * Keyboard navigable (↑/↓/Enter/Esc), mobile-friendly, animated, with a
 * placeholder and client-side search. Matches the Together City form language.
 */
export function SearchSelect({
  value, onChange, category, parent, options: staticOptions,
  placeholder = 'Select…', disabled, required, clearable, clearLabel = 'Any', ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const backend = useLookups(category ?? '', { parent, enabled: Boolean(category) && !staticOptions });
  const options = staticOptions ?? backend.data ?? NONE;
  const loading = !staticOptions && Boolean(category) && backend.isLoading;
  // A failed lookup used to render an empty dropdown — "no countries exist"
  // instead of "the list didn't load". Surfaced as a row the user can read.
  const loadFailed = !staticOptions && Boolean(category) && backend.isError;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return base.slice(0, 200);
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => { if (open) { setQ(''); setHi(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const choose = (opt: LookupOption | null) => { onChange(opt); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) choose(filtered[hi]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const box: React.CSSProperties = {
    width: '100%', padding: '11px 13px', border: `1.5px solid ${open ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left', color: value ? 'var(--ink)' : 'var(--muted)', opacity: disabled ? 0.6 : 1,
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)} style={box}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || placeholder}{required && !value ? ' *' : ''}</span>
        <span style={{ color: 'var(--muted)', fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--card)',
          border: '1.5px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 32px rgba(20,18,16,.16)', overflow: 'hidden',
          animation: 'tc-rise .16s ease',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
            <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey}
              placeholder="Search…" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13.5, fontFamily: 'inherit', background: 'transparent', padding: '4px 6px' }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {clearable && (
              <div role="option" aria-selected={!value} onMouseDown={() => choose(null)}
                style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', color: 'var(--muted)' }}>{clearLabel}</div>
            )}
            {loading && <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>Loading…</div>}
            {loadFailed && (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>
                The list didn’t load — that’s us, not a lack of options. Close and reopen to retry.
              </div>
            )}
            {!loading && !loadFailed && filtered.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>No matches</div>}
            {filtered.map((o, i) => (
              <div key={o.code} role="option" aria-selected={o.label === value}
                onMouseDown={() => choose(o)} onMouseEnter={() => setHi(i)}
                style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer',
                  background: i === hi ? 'var(--accent-soft)' : o.label === value ? 'var(--paper)' : 'transparent',
                  fontWeight: o.label === value ? 700 : 400 }}>
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
