import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/auth.api';
import { isServerUnreachable, SERVER_UNREACHABLE_MSG } from '@/api/client';
import { RegisterForm } from './RegisterForm';

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

// ── Inline icons (thin, gold-tinted to match the panel) ──────────────────────
const ic = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const PersonIcon = () => (<svg {...ic}><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>);
const LockIcon = ({ size = 18 }: { size?: number }) => (<svg {...ic} width={size} height={size}><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>);
const EyeIcon = () => (<svg {...ic}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></svg>);
const EyeOffIcon = () => (<svg {...ic}><path d="M2 12s3.6-6.5 10-6.5c1.7 0 3.2.4 4.5 1M22 12s-3.6 6.5-10 6.5c-1.7 0-3.2-.4-4.5-1" /><path d="M4 4l16 16" /></svg>);
const ArrowRight = () => (<svg {...ic} width="20" height="20"><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
const ShieldIcon = () => (<svg {...ic} width="15" height="15"><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" /></svg>);

/** Sign in / recover — register is handled by the redesigned RegisterForm. */
export function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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
      else if (mode === 'forgot') {
        const res = await authApi.forgot(identifier.trim(), channel);
        if (res.delivery === 'unconfigured') {
          setNotice(channel === 'sms'
            ? `SMS delivery isn't set up on this server yet, so no text can be sent. Ask the Together City team to enable SMS, then try again.`
            : `Email delivery isn't set up on this server yet, so the recovery code can't be emailed. Ask the Together City team to enable email (Resend), then try again.`);
        } else {
          setNotice(channel === 'sms'
            ? `If an account matches, we've texted a 6-digit code to its primary phone. Enter it below.`
            : `If an account matches, we've emailed a 6-digit recovery code to its primary email. Enter it below.`);
          setMode('reset');
        }
      }
      else if (mode === 'reset') { await authApi.reset({ identifier: identifier.trim(), code: code.trim(), newPassword: password }); setNotice('Password changed. Sign in with your new password.'); setMode('login'); setPassword(''); }
    } catch (err) {
      setError(
        isServerUnreachable(err) ? SERVER_UNREACHABLE_MSG :
        serverMessage(err) ??
        (mode === 'login' ? 'Invalid handle or password.'
        : mode === 'reset' ? 'That code is invalid or has expired.'
        : 'Something went wrong — try again.'),
      );
    } finally { setBusy(false); }
  };

  const isRegister = mode === 'register';
  const cta = busy ? 'One moment…' : mode === 'login' ? 'Sign in' : mode === 'forgot' ? (channel === 'sms' ? 'Text me a code' : 'Email me a code') : 'Reset password';

  // Shared field shells (dark glass, gold-tinted icons).
  const wrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid rgba(255,255,255,.16)', borderRadius: 14, padding: '2px 14px', marginBottom: 12, background: 'rgba(255,255,255,.05)' };
  const inp: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, fontFamily: 'inherit', background: 'transparent', color: '#fff' };
  const iconWrap: React.CSSProperties = { color: 'var(--gold-bright)', display: 'grid', placeItems: 'center', flexShrink: 0 };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, overflow: 'hidden' }}>
      {/* Moving Together City backdrop behind the glass sign-in card. */}
      <video autoPlay muted loop playsInline preload="auto" poster="/assets/img/final-homepage.webp"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>
        <source src="/assets/video/together-city-loop.webm" type="video/webm" />
        <source src="/assets/video/together-city-loop.mp4" type="video/mp4" />
      </video>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,12,.55), rgba(10,10,12,.72))', zIndex: 0 }} />

      <style>{`
        .signin-glass ::placeholder { color: rgba(255,255,255,.5); }
        .signin-glass .link { color: var(--gold-bright); font-weight: 700; text-decoration: none; }
        .signin-glass .lnkbtn { background: none; border: none; color: var(--gold-bright); font-weight: 700; cursor: pointer; font-family: inherit; font-size: inherit; }
        .signin-gold { background: linear-gradient(180deg,#e9cd82,#c49a44); }
        .signin-gold:hover:not(:disabled) { filter: brightness(1.05); box-shadow: 0 10px 34px rgba(201,162,78,.55); transform: translateY(-1px); }
        .signin-gold:active:not(:disabled) { transform: translateY(0) scale(.99); }
      `}</style>

      <div className={isRegister ? 'card' : 'card signin-glass'} style={isRegister ? {
        position: 'relative', zIndex: 1, width: 'min(430px, 92vw)',
        background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 28px 80px rgba(0,0,0,.4)',
      } : {
        position: 'relative', zIndex: 1, width: 'min(430px, 92vw)', color: '#fff',
        background: 'rgba(14,15,17,.62)',
        backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 30px 90px rgba(0,0,0,.6)',
        padding: '30px 26px 24px',
      }}>
        {mode === 'register' ? (
          <RegisterForm onBackToLogin={() => { setMode('login'); setError(null); setNotice(null); }} from={from} />
        ) : (
          <>
            {/* Heading */}
            {mode === 'login' ? (
              <div style={{ textAlign: 'center', marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 30, lineHeight: 1.08, color: '#fff' }}>Welcome to</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 38, lineHeight: 1.05, fontWeight: 600,
                  background: 'linear-gradient(180deg,#f0d99a,#c49a44)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Together City
                </div>
              </div>
            ) : (
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, marginBottom: 6, textAlign: 'center', color: '#fff' }}>
                {mode === 'forgot' ? 'Recover your account' : 'Set a new password'}
              </h1>
            )}
            <p style={{ fontSize: 13.5, marginBottom: 22, textAlign: 'center', color: 'rgba(255,255,255,.72)' }}>
              {mode === 'forgot' || mode === 'reset' ? 'Recovery goes to your primary email or phone.'
                : <>The world's largest digital city. Everything. <span style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>Personalized.</span></>}
            </p>

            <form onSubmit={(e) => void submit(e)}>
              {mode === 'login' && (
                <>
                  <div style={wrap}>
                    <span style={iconWrap}><PersonIcon /></span>
                    <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 15 }}>@</span>
                    <input autoFocus required value={handle} placeholder="handle" name="username" autoComplete="username"
                      onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                      style={{ ...inp, paddingLeft: 2 }} />
                  </div>
                  <div style={wrap}>
                    <span style={iconWrap}><LockIcon /></span>
                    <input required type={showPw ? 'text' : 'password'} value={password} placeholder="Password" name="current-password" autoComplete="current-password"
                      onChange={(e) => setPassword(e.target.value)} style={inp} />
                    <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.55)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </>
              )}

              {(mode === 'forgot' || mode === 'reset') && (
                <div style={wrap}>
                  <input required autoFocus={mode === 'forgot'} value={identifier} placeholder="Your primary email, phone, or handle"
                    onChange={(e) => setIdentifier(e.target.value)} style={inp} />
                </div>
              )}
              {mode === 'forgot' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {(['email', 'sms'] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setChannel(c)}
                      style={{ flex: 1, cursor: 'pointer', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${channel === c ? 'var(--gold-bright)' : 'rgba(255,255,255,.22)'}`, background: channel === c ? 'rgba(201,162,78,.18)' : 'rgba(255,255,255,.05)', color: channel === c ? 'var(--gold-bright)' : 'rgba(255,255,255,.8)' }}>
                      {c === 'email' ? '📧 Email me a code' : '📱 Text me a code'}
                    </button>
                  ))}
                </div>
              )}
              {mode === 'reset' && (
                <>
                  <div style={wrap}>
                    <input required autoFocus inputMode="numeric" value={code} placeholder="6-digit recovery code" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} style={inp} />
                  </div>
                  <div style={wrap}>
                    <span style={iconWrap}><LockIcon /></span>
                    <input required type={showPw ? 'text' : 'password'} value={password} placeholder="New password" name="new-password" autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} style={inp} />
                    <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.55)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  <p style={{ fontSize: 11.5, margin: '-4px 0 10px', color: 'rgba(255,255,255,.6)' }}>At least 12 characters, with an uppercase & lowercase letter, a number, and a symbol.</p>
                </>
              )}

              <button type="submit" disabled={busy} className="signin-gold"
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none',
                  borderRadius: 999, padding: '15px 24px', marginTop: 4, cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 13, letterSpacing: '.16em', fontWeight: 700, textTransform: 'uppercase', color: '#fff',
                  boxShadow: '0 8px 26px rgba(201,162,78,.45)', opacity: busy ? 0.7 : 1, transition: 'transform .14s, box-shadow .2s, filter .2s' }}>
                {cta}<ArrowRight />
              </button>
            </form>

            {mode === 'login' && handle && <p style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center', color: 'rgba(255,255,255,.6)' }}>@{handle} · {handle}@togethercity.app</p>}
            {notice && <p style={{ color: 'var(--gold-bright)', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{notice}</p>}
            {error && <p className="tc-shake" style={{ color: '#e88', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{error}</p>}

            {/* OR divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px', color: 'rgba(255,255,255,.4)' }}>
              <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.16)' }} />
              <span style={{ fontSize: 11, letterSpacing: '.14em', fontWeight: 700 }}>OR</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.16)' }} />
            </div>

            {mode === 'login' && (
              <p style={{ fontSize: 13, marginBottom: 8, textAlign: 'center', color: 'rgba(255,255,255,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <span style={{ color: 'var(--gold-bright)', display: 'grid', placeItems: 'center' }}><LockIcon size={14} /></span>
                <button type="button" onClick={() => { setMode('forgot'); setShowPw(false); setError(null); setNotice(null); }} className="lnkbtn">Forgot password?</button>
              </p>
            )}

            <p style={{ fontSize: 13.5, marginBottom: 4, textAlign: 'center', color: 'rgba(255,255,255,.78)' }}>
              {mode === 'login' && <>New to Together City?{' '}<button type="button" onClick={() => { setMode('register'); setError(null); setNotice(null); }} className="lnkbtn">Create one →</button></>}
              {(mode === 'forgot' || mode === 'reset') && <>Remembered it?{' '}<button type="button" onClick={() => { setMode('login'); setShowPw(false); setError(null); setNotice(null); }} className="lnkbtn">Back to sign in</button></>}
            </p>

            <p style={{ fontSize: 11.5, marginTop: 14, textAlign: 'center', color: 'rgba(255,255,255,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ color: 'var(--gold-bright)', display: 'grid', placeItems: 'center' }}><ShieldIcon /></span>
              By continuing, you agree to our <Link to="/legal" className="link">Terms &amp; Privacy Policy</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
