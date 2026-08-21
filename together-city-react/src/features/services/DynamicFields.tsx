import type { BusinessTypeDef, FieldDef } from './api';

/**
 * THE FORM NOBODY WROTE.
 *
 * Every field below is rendered from a declaration on the server, which is the
 * only way the promise holds: a plumber is never asked for a cuisine, because
 * the plumber's type never declares one, and there is no screen anywhere with
 * a hard-coded list to fall out of step with that.
 *
 * The renderer knows about KINDS, not about trades. It has no idea what a
 * cuisine is. That ignorance is the feature — adding Dentist to the schema
 * changes this form without touching this file.
 */
const cell: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px',
  border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit',
  background: 'var(--card)',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 };

type Values = Record<string, unknown>;

function Field({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = `bt-${f.key}`;

  if (f.kind === 'toggle') {
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5 }}>
          {f.label}
          {f.hint && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{f.hint}</span>}
        </span>
      </label>
    );
  }

  if (f.kind === 'chips') {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (o: string) =>
      onChange(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]);
    return (
      <div>
        <span style={label}>{f.label}</span>
        {/* Chips, not a multi-select. A multi-select hides its own options
            behind a click and shows the answer as a comma-run; the whole point
            of this question is that the owner can see the vocabulary. */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(f.options ?? []).map((o) => {
            const on = picked.includes(o);
            return (
              <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on}
                style={{
                  // 44 and not 40: a chip is the one control on this form a
                  // thumb has to hit repeatedly, and the audit is right that
                  // four pixels is the difference on a phone.
                  minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                  background: on ? 'var(--accent-soft)' : 'var(--card)',
                  color: on ? 'var(--accent-ink)' : 'var(--ink)',
                }}>{o}</button>
            );
          })}
        </div>
        {f.hint && <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>{f.hint}</p>}
      </div>
    );
  }

  if (f.kind === 'longtext') {
    return (
      <div>
        <label htmlFor={id} style={label}>{f.label}</label>
        <textarea id={id} style={{ ...cell, minHeight: 96, resize: 'vertical' }} maxLength={1200}
          value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        {f.hint && <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>{f.hint}</p>}
      </div>
    );
  }

  const numeric = f.kind === 'number' || f.kind === 'money' || f.kind === 'minutes';
  return (
    <div>
      <label htmlFor={id} style={label}>{f.label}</label>
      <input id={id} style={cell} maxLength={numeric ? 9 : 200}
        inputMode={numeric ? 'numeric' : undefined}
        placeholder={f.kind === 'money' ? '₹' : undefined}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value)} />
      {f.hint && <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>{f.hint}</p>}
    </div>
  );
}

export function DynamicFields({ type, values, onChange }: {
  type: BusinessTypeDef | null;
  values: Values;
  onChange: (next: Values) => void;
}) {
  if (!type || type.fields.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <div>
        <div className="eyebrow" style={{ margin: 0 }}>About your {type.label.toLowerCase()}</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
          Only what applies to you. These are the things people filter and search on, so a blank
          one is a search you will not appear in.
        </p>
      </div>
      {type.fields.map((f) => (
        <Field key={f.key} f={f} value={values[f.key]}
          onChange={(v) => onChange({ ...values, [f.key]: v })} />
      ))}
    </div>
  );
}
