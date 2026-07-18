import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui';

interface LocationState { from?: string }
type Mode = 'login' | 'register' | 'forgot' | 'reset';

/** Prefer the backend's actual error message over a canned guess. */
function serverMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data;
  const m = data?.message;
  if (typeof m === 'string' && m.trim()) return m;
  if (Array.isArray(m) && m.length && typeof m[0] === 'string') return m.join(' · ');
  return null;
}

/** Sign-in / register / recovery — handle + password, with a primary email captured at sign-up. */
export function SignIn() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'login') { await login(handle.trim(), password); navigate(from, { replace: true }); }
      else if (mode === 'register') { await register(handle.trim(), name.trim(), password, { email: email.trim(), phone: phone.trim() }); navigate(from, { replace: true }); }
      else if (mode === 'forgot') { await authApi.forgot(identifier.trim(), channel); setNotice(channel === 'sms' ? `If an account matches, we've texted a 6-digit code to its primary phone. Enter it below.` : `If an account matches, we've emailed a 6-digit recovery code to its primary email. Enter it below.`); setMode('reset'); }
      else if (mode === 'reset') { await authApi.reset({ identifier: identifier.trim(), code: code.trim(), newPassword: password }); setNotice('Password changed. Sign in with your new password.'); setMode('login'); setPassword(''); }
    } catch (err) {
      setError(
        serverMessage(err) ??
        (mode === 'login' ? 'Invalid handle or password.'
        : mode === 'register' ? 'Could not create your ID — try again.'
        : mode === 'reset' ? 'That code is invalid or has expired.'
        : 'Something went wrong — try again.'),
      );
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: '100%', padding: '13px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' };
  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join the city' : mode === 'forgot' ? 'Recover your account' : 'Set a new password';
  const cta = busy ? 'One moment…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create my ID' : mode === 'forgot' ? (channel === 'sms' ? 'Text me a code' : 'Email me a code') : 'Reset password';

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(420px, 92vw)' }}>
        <div className="eyebrow" style={{ textAlign: 'center' }}>Together City</div>
        <h1 style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{title}</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 20, textAlign: 'center' }}>
          {mode === 'forgot' || mode === 'reset' ? 'Recovery goes to your primary email or phone.' : 'One identity across every part of life.'}
        </p>

        <form onSubmit={submit}>
          {(mode === 'login' || mode === 'register') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px', marginBottom: 10 }}>
                <span className="muted">@</span>
                <input autoFocus required value={handle} placeholder="handle"
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
              </div>
              {mode === 'register' && (
                <>
                  <input required value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} style={field} />
                  <input required type="email" value={email} placeholder="Your existing email (primary)" onChange={(e) => setEmail(e.target.value)} style={field} />
                  <input type="tel" value={phone} placeholder="Phone (optional)" onChange={(e) => setPhone(e.target.value)} style={field} />
                </>
              )}
              <input required type="password" value={password} minLength={mode === 'register' ? 8 : 1} placeholder={mode === 'register' ? "Password (min 8 characters)" : "Password"}
                onChange={(e) => setPassword(e.target.value)} style={field} />
            </>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <input required autoFocus={mode === 'forgot'} value={identifier} placeholder="Your primary email, phone, or handle"
              onChange={(e) => setIdentifier(e.target.value)} style={field} />
          )}
          {mode === 'forgot' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['email', 'sms'] as const).map((c) => (
                <button key={c} type="button" onClick={() => setChannel(c)}
                  style={{ flex: 1, cursor: 'pointer', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${channel === c ? 'var(--accent)' : 'var(--line)'}`, background: channel === c ? 'var(--accent)' : 'transparent', color: channel === c ? '#fff' : 'var(--ink-soft)' }}>
                  {c === 'email' ? '📧 Email me a code' : '📱 Text me a code'}
                </button>
              ))}
            </div>
          )}
          {mode === 'reset' && (
            <>
              <input required autoFocus inputMode="numeric" value={code} placeholder="6-digit recovery code" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} style={field} />
              <input required type="password" value={password} placeholder="New password (min 8 chars)" onChange={(e) => setPassword(e.target.value)} style={field} />
            </>
          )}

          <Button type="submit" variant="accent" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>{cta}</Button>
        </form>

        {mode === 'register' && email && <p className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>Bills & receipts go to {email} and your city inbox {handle || 'you'}@togethercity.tech</p>}
        {mode === 'login' && handle && <p className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>@{handle} · {handle}@togethercity.tech</p>}
        {notice && <p style={{ color: 'var(--accent)', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{notice}</p>}
        {error && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{error}</p>}

        {mode === 'login' && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            <button type="button" onClick={() => { setMode('forgot'); setError(null); setNotice(null); }} style={linkBtn}>Forgot password?</button>
          </p>
        )}

        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, textAlign: 'center' }}>
          {mode === 'login' && <>New to Together City?{' '}<button type="button" onClick={() => { setMode('register'); setError(null); setNotice(null); }} style={linkBtn}>Create one</button></>}
          {mode === 'register' && <>Already have an ID?{' '}<button type="button" onClick={() => { setMode('login'); setError(null); setNotice(null); }} style={linkBtn}>Sign in</button></>}
          {(mode === 'forgot' || mode === 'reset') && <>Remembered it?{' '}<button type="button" onClick={() => { setMode('login'); setError(null); setNotice(null); }} style={linkBtn}>Back to sign in</button></>}
        </p>
        <p className="muted" style={{ fontSize: 11, marginTop: 12, textAlign: 'center' }}>
          <Link to="/legal" style={{ color: 'var(--accent)' }}>Terms & privacy</Link>
        </p>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' };
