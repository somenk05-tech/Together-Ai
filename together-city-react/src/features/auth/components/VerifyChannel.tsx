import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CodeInput } from '@/components/ui';
import { authApi, type VerificationChannel } from '@/api/auth.api';

const COPY = {
  email: {
    noun: 'email address',
    placeholder: 'you@gmail.com',
    inputType: 'email' as const,
    autoComplete: 'email',
    hint: 'Use the address you actually read — Gmail, Yahoo, or your work address. Your @togethercity.app inbox does not need verifying.',
  },
  phone: {
    noun: 'phone number',
    placeholder: '+91 98765 43210',
    inputType: 'tel' as const,
    autoComplete: 'tel',
    hint: 'Include the country code. We only use this to secure your account.',
  },
};

export interface VerifyChannelProps {
  channel: VerificationChannel;
  /** Current value on the account, verified or not. */
  current?: string | null;
  onVerified?: (target: string) => void;
  onCancel?: () => void;
}

/**
 * Send a code, then take one back.
 *
 * Two states, and the reason they are one component rather than two screens is
 * the escape hatch: from the code step you can go back and fix the address
 * without losing your place, which is what people do when they realise they
 * typed gmial.
 *
 * The resend button is disabled against a live countdown rather than being
 * available and then refusing — a button that says "Resend" and answers "wait
 * 43 seconds" teaches people to keep pressing it.
 */
export function VerifyChannel({ channel, current, onVerified, onCancel }: VerifyChannelProps) {
  const copy = COPY[channel];
  const [step, setStep] = useState<'target' | 'code'>('target');
  const [target, setTarget] = useState(current ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<'live' | 'unconfigured'>('live');
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const startCooldown = useCallback((ms: number) => {
    setCooldown(Math.ceil(ms / 1000));
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setCooldown((n) => {
        if (n <= 1 && timer.current) window.clearInterval(timer.current);
        return Math.max(0, n - 1);
      });
    }, 1000);
  }, []);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.sendCode(channel, target.trim() || undefined);
      setSentTo(res.target);
      setDelivery(res.delivery);
      setStep('code');
      setCode('');
      startCooldown(res.retryAfterMs);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [channel, target, startCooldown]);

  const confirm = useCallback(async (submitted: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.confirmCode(channel, submitted);
      onVerified?.(res.target);
    } catch (e) {
      setError(messageOf(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }, [channel, onVerified]);

  if (step === 'target') {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        style={{ display: 'grid', gap: 12 }}
      >
        <label style={{ fontSize: 13.5, fontWeight: 600 }} htmlFor={`vc-${channel}`}>
          Your {copy.noun}
        </label>
        <input
          id={`vc-${channel}`}
          className="tc-field"
          type={copy.inputType}
          autoComplete={copy.autoComplete}
          placeholder={copy.placeholder}
          value={target}
          onChange={(e) => { setTarget(e.target.value); setError(null); }}
          disabled={busy}
          style={field}
        />
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{copy.hint}</p>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" variant="accent" disabled={busy || !target.trim()}>
            {busy ? 'Sending…' : 'Send me a code'}
          </Button>
          {onCancel && <Button variant="line" onClick={onCancel} disabled={busy}>Cancel</Button>}
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <p style={{ fontSize: 14, margin: '0 0 2px' }}>
          We sent a 6-digit code to <strong>{sentTo}</strong>.
        </p>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>It expires in 10 minutes.</p>
      </div>

      {delivery === 'unconfigured' && (
        // The stub provider logs instead of sending. Saying "check your inbox"
        // here would cost somebody ten minutes and a support message.
        <p role="status" style={{ ...errorStyle, background: 'var(--amber-soft, #fdf3e0)', color: 'var(--ink)' }}>
          No {channel === 'phone' ? 'SMS' : 'email'} provider is configured on this
          environment, so nothing was actually delivered. The code is in the server log.
        </p>
      )}

      <CodeInput
        value={code}
        onChange={(v) => { setCode(v); setError(null); }}
        onComplete={(v) => { void confirm(v); }}
        disabled={busy}
        invalid={!!error}
        autoFocus
        label={`Code sent to your ${copy.noun}`}
      />

      {error && <p role="alert" style={errorStyle}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="accent" disabled={busy || code.length < 6} onClick={() => void confirm(code)}>
          {busy ? 'Checking…' : 'Verify'}
        </Button>
        <Button variant="line" size="sm" disabled={busy || cooldown > 0} onClick={() => void send()}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setStep('target'); setError(null); }}>
          Change {copy.noun}
        </Button>
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
  borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
};

const errorStyle: React.CSSProperties = {
  fontSize: 13, margin: 0, padding: '10px 12px', borderRadius: 10,
  background: 'var(--red-soft, #fdecea)', color: 'var(--red, #c0392b)', lineHeight: 1.5,
};

/** The server's message is the useful one — it knows why. */
function messageOf(e: unknown): string {
  const r = e as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = r?.response?.data?.message;
  if (Array.isArray(m)) return m[0] ?? 'Something went wrong.';
  return m ?? r?.message ?? 'Something went wrong.';
}
