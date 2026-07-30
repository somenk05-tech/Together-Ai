import { useEffect, useRef, useState, type FormEvent } from 'react';
import { VerifyChannel } from '../components/VerifyChannel';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/auth.api';
import { isServerUnreachable, SERVER_UNREACHABLE_MSG } from '@/api/client';
import { Button } from '@/components/ui';
import { usePrivacyStore } from '@/features/privacy/store';
import { pushTos } from '@/features/privacy/api';

/** Prefer the backend's actual error message over a canned guess. */
function serverMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data;
  const m = data?.message;
  if (typeof m === 'string' && m.trim()) return m;
  if (Array.isArray(m) && m.length && typeof m[0] === 'string') return m.join(' · ');
  return null;
}

const PW_RULES: { key: string; label: string; test: (s: string) => boolean }[] = [
  { key: 'len', label: '12+ characters', test: (s) => s.length >= 12 },
  { key: 'upper', label: 'Uppercase', test: (s) => /[A-Z]/.test(s) },
  { key: 'lower', label: 'Lowercase', test: (s) => /[a-z]/.test(s) },
  { key: 'num', label: 'Number', test: (s) => /[0-9]/.test(s) },
  { key: 'special', label: 'Special character', test: (s) => /[^A-Za-z0-9]/.test(s) },
];
const STRENGTH = ['Weak', 'Weak', 'Fair', 'Fair', 'Strong', 'Excellent'];
const STRENGTH_COLOR = ['#b0503e', '#b0503e', '#b0803a', '#b0803a', '#5a9e3f', '#2e7d4f'];

const field: React.CSSProperties = { width: '100%', padding: '13px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--card)' };
const errStyle: React.CSSProperties = { color: '#c0392b', fontSize: 12, margin: '5px 2px 0' };
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Redesigned "Join the City" sign-up — low-friction, live-validated. */
export function RegisterForm({ onBackToLogin, from }: { onBackToLogin: () => void; from: string }) {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Live handle availability.
  const [hStatus, setHStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const hSeq = useRef(0);
  useEffect(() => {
    const h = handle.trim().toLowerCase();
    if (!h) { setHStatus('idle'); setSuggestions([]); return; }
    if (!/^[a-z0-9_.]{3,30}$/.test(h)) { setHStatus('invalid'); setSuggestions([]); return; }
    setHStatus('checking');
    const seq = ++hSeq.current;
    // Named, then explicitly not-awaited. setTimeout wants a void return, and
    // handing it an async function makes a rejection here an unhandled one.
    const check = async () => {
      try {
        const r = await authApi.handleAvailable(h);
        if (seq !== hSeq.current) return;
        setHStatus(r.available ? 'ok' : 'taken');
        setSuggestions(r.available ? [] : r.suggestions);
      } catch { if (seq === hSeq.current) setHStatus('idle'); }
    };
    const t = setTimeout(() => void check(), 380);
    return () => clearTimeout(t);
  }, [handle]);

  const emailErr = email && !emailOk(email) ? 'Enter a valid email address.' : null;
  const pwChecks = PW_RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const pwScore = pwChecks.filter((c) => c.ok).length;
  const pwStrong = pwScore === PW_RULES.length;

  const acceptTos = usePrivacyStore((s) => s.acceptTos);
  const canSubmit = hStatus === 'ok' && name.trim() && emailOk(email) && pwStrong && agreed && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agreed) { setError('Please accept the Terms of Service and Privacy Policy to continue.'); return; }
    if (!canSubmit) { setError('Please complete the highlighted fields.'); return; }
    setBusy(true);
    try {
      await register(handle.trim().toLowerCase(), name.trim(), password, { email: email.trim().toLowerCase(), phone: showPhone ? phone.trim() : undefined });
      acceptTos(); pushTos(); // record consent to ToS + Privacy at account creation
      setDone(true);   // auto-logged-in on success
    } catch (err) {
      setError(isServerUnreachable(err) ? SERVER_UNREACHABLE_MSG : (serverMessage(err) ?? 'Could not create your account — try again.'));
    } finally { setBusy(false); }
  };

  // Final "welcome" screen → into the app / onboarding.
  if (done) {
    return (
      <div className="tc-pop" style={{ textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 30, margin: '0 auto 16px' }}>✓</div>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Welcome to Together City</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
          Your account is ready, {name.split(' ')[0] || handle}. One more step —
          confirm <strong>{email}</strong> so we can reach you if you lose your password.
        </p>

        {/* Verifying here rather than sending them off to find an email later:
            this is the one moment we know they are sitting in front of the
            address they just typed. Skipping is still allowed — an unverified
            account works, it just cannot be recovered. */}
        <div style={{ textAlign: 'left', marginBottom: 16 }}>
          <VerifyChannel
            channel="email"
            current={email}
            onVerified={() => navigate(from, { replace: true })}
          />
        </div>

        <Button variant="ghost" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(from, { replace: true })}>
          Skip for now
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="eyebrow" style={{ textAlign: 'center' }}>Together City</div>
      <h1 style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>Join the City</h1>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 20, textAlign: 'center' }}>The world’s largest digital city. Create your account in seconds.</p>

      <form onSubmit={(e) => void submit(e)} className="tc-riser" noValidate>
        {/* Handle */}
        <div>
          <div className="tc-field" style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${hStatus === 'taken' || hStatus === 'invalid' ? '#c0392b' : hStatus === 'ok' ? '#2e7d4f' : 'var(--line)'}`, borderRadius: 12, padding: '0 12px', background: 'var(--card)' }}>
            <span className="muted">@</span>
            <input autoFocus required value={handle} placeholder="handle" name="username" autoComplete="username" aria-label="Handle"
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
            {hStatus === 'checking' && <span className="tc-spin" style={{ color: 'var(--muted)' }} />}
            {hStatus === 'ok' && <span className="tc-pop" style={{ color: '#2e7d4f', fontWeight: 800 }}>✓</span>}
          </div>
          {hStatus === 'ok' && <p style={{ ...errStyle, color: '#2e7d4f' }}>✓ @{handle} is available</p>}
          {hStatus === 'invalid' && <p style={errStyle}>3–30 chars · letters, numbers, . and _ only</p>}
          {hStatus === 'taken' && (
            <div style={{ marginTop: 6 }}>
              <p style={errStyle}>Already taken. Try:</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setHandle(s)} className="tc-pop"
                    style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1.5px solid var(--line)', borderRadius: 999, padding: '4px 11px', background: 'var(--paper)', fontFamily: 'inherit', color: 'var(--accent)' }}>@{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Name */}
        <input required value={name} placeholder="Full name" name="name" autoComplete="name" aria-label="Full name"
          onChange={(e) => setName(e.target.value)} className="tc-field" style={{ ...field, marginTop: 10 }} />

        {/* Email */}
        <input required type="email" value={email} placeholder="Email address" name="email" autoComplete="email" inputMode="email" aria-label="Email address"
          onChange={(e) => setEmail(e.target.value)} className="tc-field"
          style={{ ...field, marginTop: 10, borderColor: emailErr ? '#c0392b' : 'var(--line)' }} />
        {emailErr && <p style={errStyle}>{emailErr}</p>}

        {/* Password */}
        <div className="tc-field" style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px', marginTop: 10, background: 'var(--card)' }}>
          <input required type={showPw ? 'text' : 'password'} value={password} placeholder="Password" name="new-password" autoComplete="new-password" aria-label="Password"
            onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 4px 13px 2px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
          <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
            style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>{showPw ? 'Hide' : 'Show'}</button>
        </div>
        {password && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < pwScore ? STRENGTH_COLOR[pwScore] : 'var(--line)', transition: 'background .2s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: STRENGTH_COLOR[pwScore] }}>{STRENGTH[pwScore]}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {pwChecks.map((c) => (
                <span key={c.key} style={{ fontSize: 11, fontWeight: 600, color: c.ok ? '#2e7d4f' : 'var(--muted)' }}>{c.ok ? '✓' : '○'} {c.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Phone (progressive) */}
        {!showPhone ? (
          <button type="button" onClick={() => setShowPhone(true)}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ Add phone number (optional)</button>
        ) : (
          <input type="tel" value={phone} placeholder="Phone (optional)" name="tel" autoComplete="tel" inputMode="tel" aria-label="Phone"
            onChange={(e) => setPhone(e.target.value)} className="tc-field" style={{ ...field, marginTop: 12 }} />
        )}

        {/* Terms / Privacy acceptance + a short "your data is yours" reassurance (audit 2.2). */}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, cursor: 'pointer', fontSize: 12.5, lineHeight: 1.5 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="tos-note"
            style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
          <span>
            I agree to the{' '}
            <Link to="/legal/terms" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>Terms of Service</Link>{' '}and{' '}
            <Link to="/legal/privacy" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>Privacy Policy</Link>.
            <span id="tos-note" className="muted" style={{ display: 'block', marginTop: 3 }}>
              Your data is yours. Sensitive information — health, dating, finances — stays private by default and is only used to personalize the features you choose.
            </span>
          </span>
        </label>

        {error && <p className="tc-shake" role="alert" style={{ ...errStyle, textAlign: 'center', margin: '12px 0 0' }}>{error}</p>}

        <Button type="submit" variant="accent" disabled={!canSubmit} style={{ width: '100%', justifyContent: 'center', marginTop: 16, opacity: canSubmit ? 1 : 0.6 }}>
          {busy ? <><span className="tc-spin" style={{ marginRight: 8 }} /> Creating…</> : 'Create Account'}
        </Button>
      </form>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: 'center' }}>
        Already have an account?{' '}
        <button type="button" onClick={onBackToLogin} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Sign In</button>
      </p>
    </>
  );
}
