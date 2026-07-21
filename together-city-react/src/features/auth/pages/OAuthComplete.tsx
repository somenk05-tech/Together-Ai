import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui';

const PW_RULES: { label: string; test: (s: string) => boolean }[] = [
  { label: '12+ characters', test: (s) => s.length >= 12 },
  { label: 'Uppercase', test: (s) => /[A-Z]/.test(s) },
  { label: 'Lowercase', test: (s) => /[a-z]/.test(s) },
  { label: 'Number', test: (s) => /[0-9]/.test(s) },
  { label: 'Special character', test: (s) => /[^A-Za-z0-9]/.test(s) },
];
const field: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--card)' };

/** OAuth landing (/oauth/complete). Existing users are signed straight in; new
 *  users choose their Together City handle + password before the native account
 *  is created (Google/Apple/Microsoft only accelerate signup). */
export function OAuthComplete() {
  const adoptSession = useAuthStore((s) => s.adoptSession);
  const navigate = useNavigate();
  const ran = useRef(false);

  const [phase, setPhase] = useState<'working' | 'register' | 'error'>('working');
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ token: string; email: string; name: string; avatar: string }>({ token: '', email: '', name: '', avatar: '' });

  // Registration form state.
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hStatus, setHStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const hSeq = useRef(0);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    window.history.replaceState(null, '', window.location.pathname);
    const err = frag.get('error');
    const access = frag.get('access'); const refresh = frag.get('refresh');
    const register = frag.get('register');
    if (access && refresh) {
      adoptSession(access, refresh).then(() => navigate('/', { replace: true })).catch(() => { setError('Could not complete sign-in.'); setPhase('error'); });
    } else if (register) {
      setPrefill({ token: register, email: frag.get('email') ?? '', name: frag.get('name') ?? '', avatar: frag.get('avatar') ?? '' });
      setHandle((frag.get('email') ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24));
      setPhase('register');
    } else { setError(err ? 'Sign-in was cancelled or failed.' : 'Missing sign-in details.'); setPhase('error'); }
  }, [adoptSession, navigate]);

  // Live handle availability.
  useEffect(() => {
    if (phase !== 'register') return;
    const h = handle.trim().toLowerCase();
    if (!h) { setHStatus('idle'); return; }
    if (!/^[a-z0-9_.]{3,30}$/.test(h)) { setHStatus('invalid'); return; }
    setHStatus('checking');
    const seq = ++hSeq.current;
    const t = setTimeout(async () => {
      try { const r = await authApi.handleAvailable(h); if (seq !== hSeq.current) return; setHStatus(r.available ? 'ok' : 'taken'); setSuggestions(r.available ? [] : r.suggestions); }
      catch { if (seq === hSeq.current) setHStatus('idle'); }
    }, 380);
    return () => clearTimeout(t);
  }, [handle, phase]);

  const pwChecks = PW_RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const pwStrong = pwChecks.every((c) => c.ok);
  const canSubmit = hStatus === 'ok' && pwStrong && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const { accessToken, refreshToken } = await authApi.oauthComplete({ registrationToken: prefill.token, handle: handle.trim().toLowerCase(), password, phone: showPhone ? phone.trim() : undefined });
      await adoptSession(accessToken, refreshToken);
      navigate('/', { replace: true });
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof m === 'string' ? m : 'Could not finish creating your account.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(440px, 92vw)' }}>
        <div className="eyebrow" style={{ textAlign: 'center' }}>Together City</div>

        {phase === 'working' && (
          <div style={{ textAlign: 'center' }}>
            <div className="tc-spin" style={{ width: 26, height: 26, color: 'var(--accent)', margin: '18px auto' }} />
            <h1 style={{ fontSize: 24 }}>Signing you in…</h1>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, margin: '14px 0 6px' }}>Sign-in failed</h1>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>{error}</p>
            <Button variant="accent" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/sign-in', { replace: true })}>Back to sign in</Button>
          </div>
        )}

        {phase === 'register' && (
          <>
            <h1 style={{ fontSize: 25, marginBottom: 4, textAlign: 'center' }}>Finish your account</h1>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16, textAlign: 'center' }}>Google verified you — now choose your Together City handle and a password so you can always sign in.</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14 }}>
              <div className="av" style={{ width: 40, height: 40, overflow: 'hidden', backgroundImage: prefill.avatar ? `url(${prefill.avatar})` : undefined, backgroundSize: 'cover' }}>{!prefill.avatar && (prefill.name[0] ?? '?').toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{prefill.name || 'New citizen'}</div>
                <div className="muted" style={{ fontSize: 12 }}>{prefill.email} · verified ✓</div>
              </div>
            </div>

            {/* Handle */}
            <div className="tc-field" style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${hStatus === 'taken' || hStatus === 'invalid' ? '#c0392b' : hStatus === 'ok' ? '#2e7d4f' : 'var(--line)'}`, borderRadius: 12, padding: '0 12px' }}>
              <span className="muted">@</span>
              <input autoFocus value={handle} placeholder="handle" autoComplete="username"
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
              {hStatus === 'checking' && <span className="tc-spin" style={{ color: 'var(--muted)' }} />}
              {hStatus === 'ok' && <span className="tc-pop" style={{ color: '#2e7d4f', fontWeight: 800 }}>✓</span>}
            </div>
            {hStatus === 'taken' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 0' }}>
                {suggestions.map((s) => <button key={s} type="button" onClick={() => setHandle(s)} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1.5px solid var(--line)', borderRadius: 999, padding: '4px 11px', background: 'var(--paper)', fontFamily: 'inherit', color: 'var(--accent)' }}>@{s}</button>)}
              </div>
            )}
            {hStatus === 'invalid' && <p style={{ color: '#c0392b', fontSize: 12, margin: '5px 2px 0' }}>3–30 chars · letters, numbers, . and _</p>}

            {/* Password */}
            <input type="password" value={password} placeholder="Create a password" autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)} className="tc-field" style={{ ...field, marginTop: 10 }} />
            {password && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                {pwChecks.map((c) => <span key={c.label} style={{ fontSize: 11, fontWeight: 600, color: c.ok ? '#2e7d4f' : 'var(--muted)' }}>{c.ok ? '✓' : '○'} {c.label}</span>)}
              </div>
            )}

            {!showPhone ? (
              <button type="button" onClick={() => setShowPhone(true)} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ Add phone number (optional)</button>
            ) : (
              <input type="tel" value={phone} placeholder="Phone (optional)" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} className="tc-field" style={{ ...field, marginTop: 12 }} />
            )}

            {error && <p className="tc-shake" style={{ color: '#c0392b', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{error}</p>}

            <Button variant="accent" disabled={!canSubmit} onClick={submit} style={{ width: '100%', justifyContent: 'center', marginTop: 16, opacity: canSubmit ? 1 : 0.6 }}>
              {busy ? <><span className="tc-spin" style={{ marginRight: 8 }} /> Creating…</> : 'Create Account'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
