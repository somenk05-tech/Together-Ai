import { useRef, useState, useCallback } from 'react';

/**
 * Together City — global form-validation standard.
 * One consistent behaviour for every Save / Continue / Submit / Generate:
 *  • validate ALL required fields in one pass (never one-at-a-time)
 *  • block the save; never save partial data; never clear what's entered
 *  • summary card at the top listing EXACTLY what's missing (no "something went wrong")
 *  • subtle red border + inline ⚠ message on each missing field
 *  • smooth-scroll to the first missing field and focus it
 *  • success toast when the save goes through
 *
 * Usage:
 *   const v = useFormValidation([
 *     { key: 'height', label: 'Height', valid: () => !!form.heightCm, message: 'Enter your height.' },
 *     ...
 *   ]);
 *   <div ref={v.reg('height')} style={v.errStyle('height')}> <input …/> <FieldError msg={v.errors.height} /> </div>
 *   onSubmit: if (!v.validate()) return; …save…; successToast('Preferences saved successfully.');
 */

export interface FieldRule {
  key: string;
  label: string;
  /** true when the field is complete/valid */
  valid: () => boolean;
  /** inline + summary message; defaults to "<label> is required." */
  message?: string;
}

export function useFormValidation(rules: FieldRule[]) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const reg = useCallback((key: string) => (el: HTMLElement | null) => { refs.current[key] = el; }, []);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    for (const r of rules) {
      if (!r.valid()) errs[r.key] = r.message ?? `${r.label} is required.`;
    }
    setErrors(errs);
    const first = rules.find((r) => errs[r.key]);
    if (first) {
      const el = refs.current[first.key];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        const focusable = el?.querySelector<HTMLElement>('input, select, textarea, button');
        focusable?.focus?.();
      }, 350);
    }
    return Object.keys(errs).length === 0;
  }, [rules]);

  /** Clear one field's error the moment the user fixes it (call from onChange). */
  const clear = useCallback((key: string) => {
    setErrors((s) => (s[key] ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== key)) : s));
  }, []);

  const missing = rules.filter((r) => errors[r.key]).map((r) => ({ key: r.key, label: r.label, message: errors[r.key] }));

  /** Red-border style for a missing field's input/container. */
  const errStyle = useCallback((key: string): React.CSSProperties =>
    errors[key] ? { border: '1.5px solid var(--danger-ink)', borderRadius: 12, background: 'rgba(192,57,43,0.04)' } : {}, [errors]);

  return { errors, validate, clear, reg, missing, errStyle, hasErrors: missing.length > 0 };
}

/** The summary card shown at the top of the form after a failed save. */
export function ValidationSummary({ missing, title = 'Complete these to save:' }: {
  missing: { key: string; label: string; message: string }[]; title?: string;
}) {
  if (!missing.length) return null;
  return (
    <div role="alert" style={{
      border: '1.5px solid var(--danger-line)', background: 'var(--danger-soft)', borderRadius: 'var(--r-2)',
      padding: '14px 18px', margin: '0 0 16px', animation: 'tcValIn .25s ease',
    }}>
      <style>{'@keyframes tcValIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}'}</style>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--danger-ink)', marginBottom: 6 }}>⚠ {title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {missing.map((m) => <li key={m.key} style={{ fontSize: 12.5, color: 'var(--danger-ink)' }}>{m.message}</li>)}
      </ul>
    </div>
  );
}

/** Inline ⚠ message under a missing field. */
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p style={{ fontSize: 11.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '4px 0 0' }}>⚠ {msg}</p>;
}

/* ── success toast (self-contained — injects its own style once) ── */
let toastTimer: number | undefined;
export function successToast(msg: string) {
  if (!document.getElementById('tc-val-toast-css')) {
    const st = document.createElement('style');
    st.id = 'tc-val-toast-css';
    st.textContent = '.tc-val-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(16px);z-index:10000;background:var(--ok-ink);color:var(--on-accent);font-size:13.5px;font-weight:600;padding:11px 22px;border-radius:999px;box-shadow:0 10px 32px rgba(0,0,0,.3);opacity:0;transition:opacity .25s ease,transform .25s ease;pointer-events:none;font-family:inherit}.tc-val-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}';
    document.head.appendChild(st);
  }
  document.querySelectorAll('.tc-val-toast').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'tc-val-toast';
  el.textContent = `✅ ${msg}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.classList.remove('on'); window.setTimeout(() => el.remove(), 300); }, 2200);
}
