import { useEffect, useMemo, useRef, useState } from 'react';
import { useLookups, type LookupOption } from '@/api/lookups.api';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */
const NONE: never[] = [];

interface Props {
  /** Selected labels, shown as removable chips. */
  values: string[];
  onChange: (labels: string[]) => void;
  category?: string;
  options?: LookupOption[];
  placeholder?: string;
  max?: number;
  ariaLabel?: string;
}

/**
 * Searchable multi-select backed by the platform master tables. Selected values
 * render as removable chips; a search box filters the remaining options. Keyboard
 * friendly and mobile friendly, matching the Together City form language.
 */
export function MultiSelect({ values, onChange, category, options: staticOptions, placeholder = 'Search…', max, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const backend = useLookups(category ?? '', { enabled: Boolean(category) && !staticOptions });
  const options = staticOptions ?? backend.data ?? NONE;
  const full = max != null && values.length >= max;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options
      .filter((o) => !values.includes(o.label))
      .filter((o) => (needle ? o.label.toLowerCase().includes(needle) : true))
      .slice(0, 200);
  }, [options, values, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const add = (label: string) => { if (!full && !values.includes(label)) onChange([...values, label]); setQ(''); setHi(0); };
  const remove = (label: string) => onChange(values.filter((v) => v !== label));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) add(filtered[hi].label); }
    else if (e.key === 'Backspace' && !q && values.length) { remove(values[values.length - 1]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(true)} style={{
        width: '100%', minHeight: 44, padding: '7px 10px', border: `1.5px solid ${open ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 'var(--r-1)', background: 'var(--card)', boxSizing: 'border-box', display: 'flex', flexWrap: 'wrap', gap: 6,
        alignItems: 'center', cursor: 'text',
      }}>
        {values.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 'var(--r-full)', padding: '4px 6px 4px 11px', fontSize: 12.5, fontWeight: 600 }}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); remove(v); }}
              style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'rgba(255,255,255,.25)', color: 'var(--on-accent)', width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </span>
        ))}
        <input value={q} aria-label={ariaLabel} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onKeyDown={onKey}
          placeholder={full ? `Max ${max} selected` : values.length ? '' : placeholder} disabled={full}
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          style={{ flex: 1, minWidth: 90, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', background: 'transparent', padding: '4px 2px' }} />
      </div>

      {open && !full && filtered.length > 0 && (
        <div role="listbox" style={{
          position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--card)',
          border: '1.5px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 32px rgba(20,18,16,.16)', overflow: 'hidden',
          animation: 'tc-rise .16s ease',
        }}>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map((o, i) => (
              <div key={o.code} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); add(o.label); }} onMouseEnter={() => setHi(i)}
                style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', background: i === hi ? 'var(--accent-soft)' : 'transparent' }}>
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
