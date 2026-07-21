import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui';

/** Email-verification landing (/verify?token=…). Verifies the token, signs the
 *  user in automatically, then continues into the app. */
export function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const navigate = useNavigate();
  const [state, setState] = useState<'working' | 'ok' | 'error'>(token ? 'working' : 'error');
  const [msg, setMsg] = useState('This verification link is missing its token.');
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verifyEmail(token)
      .then(() => { setState('ok'); setTimeout(() => navigate('/', { replace: true }), 1600); })
      .catch((err: unknown) => {
        const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setMsg(typeof m === 'string' ? m : 'This verification link is invalid or has expired.');
        setState('error');
      });
  }, [token, verifyEmail, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(420px, 92vw)', textAlign: 'center' }}>
        <div className="eyebrow">Together City</div>
        {state === 'working' && (
          <>
            <div className="tc-spin" style={{ width: 26, height: 26, color: 'var(--accent)', margin: '18px auto' }} />
            <h1 style={{ fontSize: 24 }}>Verifying your email…</h1>
          </>
        )}
        {state === 'ok' && (
          <>
            <div className="tc-pop" style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 28, margin: '14px auto' }}>✓</div>
            <h1 style={{ fontSize: 24, marginBottom: 6 }}>Email verified</h1>
            <p className="muted" style={{ fontSize: 13.5 }}>You’re all set — taking you into Together City…</p>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 style={{ fontSize: 24, margin: '14px 0 6px' }}>Link not valid</h1>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>{msg}</p>
            <input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} type="email" placeholder="Your email"
              style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <Button variant="accent" style={{ width: '100%', justifyContent: 'center' }} disabled={!resendEmail.trim() || resent}
              onClick={() => authApi.resendVerification(resendEmail.trim()).then(() => setResent(true)).catch(() => setResent(true))}>
              {resent ? 'If it exists, a new link is on its way' : 'Resend verification link'}
            </Button>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              <button type="button" onClick={() => navigate('/signin')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Back to sign in</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
