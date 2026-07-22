import { useEffect, useState } from 'react';
import { Button, Card, Spinner, Tag } from '@/components/ui';
import { useAstroProfile, useSaveAstroProfile } from '../hooks';

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--line)',
  background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14,
};
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, display: 'block', margin: '0 0 6px' };

/** Profile → Astrology Profile. One shared birth-details profile used by the
 *  Astrology Zone, Dating matchmaking, compatibility reports and every future
 *  astrology feature — entered once, reused everywhere. */
export function AstroProfilePage() {
  const view = useAstroProfile();
  const save = useSaveAstroProfile();
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const [form, setForm] = useState({
    birthDate: '', birthTime: '', birthCountry: 'India', birthState: '', birthCity: '', timeZone: detectedTz,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Prefill from the saved profile, or from birth details already entered
  // elsewhere in the app (dating onboarding) — never ask twice.
  useEffect(() => {
    const d = view.data;
    if (!d) return;
    if (d.profile) {
      setForm({
        birthDate: d.profile.birthDate, birthTime: d.profile.birthTime,
        birthCountry: d.profile.birthCountry, birthState: d.profile.birthState ?? '',
        birthCity: d.profile.birthCity, timeZone: d.profile.timeZone || detectedTz,
      });
    } else if (d.prefill) {
      setForm((f) => ({
        ...f, birthDate: d.prefill!.birthDate, birthTime: d.prefill!.birthTime,
        birthCity: d.prefill!.birthCity, birthState: d.prefill!.birthState, birthCountry: d.prefill!.birthCountry || 'India',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data]);

  const submit = () => {
    setMsg(null);
    save.mutate({ ...form, birthState: form.birthState || null }, {
      onSuccess: () => setMsg('Saved. Your horoscopes, matchmaking and compatibility readings now use these details.'),
      onError: (e) => {
        const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setMsg(Array.isArray(m) ? m.join(' ') : m ?? 'Could not save — check the fields and try again.');
      },
    });
  };
  const complete = form.birthDate && form.birthTime && form.birthCity && form.birthCountry;
  const chart = view.data?.profile?.chart;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Profile · Astrology Profile</div>
        <h1 style={{ fontSize: 'clamp(24px,3vw,32px)' }}>Your birth details</h1>
        <p className="lede">
          Entered once, used everywhere: the Astrology Zone, Dating matchmaking, compatibility reports and every future astrology feature.
        </p>
      </div>
      {view.isLoading && <Spinner label="Loading your profile…" />}
      {view.data && (
        <Card className="rise" style={{ padding: '24px 26px' }}>
          {view.data.source === 'dating' && (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              ✓ We prefilled what you already shared during dating onboarding — confirm and save.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div>
              <label style={label}>Date of Birth</label>
              <input type="date" value={form.birthDate} onChange={set('birthDate')} style={field} />
            </div>
            <div>
              <label style={label}>Time of Birth</label>
              <input type="time" value={form.birthTime} onChange={set('birthTime')} style={field} />
            </div>
            <div>
              <label style={label}>Birth Country</label>
              <input value={form.birthCountry} onChange={set('birthCountry')} placeholder="India" style={field} />
            </div>
            <div>
              <label style={label}>Birth State</label>
              <input value={form.birthState} onChange={set('birthState')} placeholder="Maharashtra (optional)" style={field} />
            </div>
            <div>
              <label style={label}>Birth City</label>
              <input value={form.birthCity} onChange={set('birthCity')} placeholder="Mumbai" style={field} />
            </div>
            <div>
              <label style={label}>Time Zone <span className="muted" style={{ fontWeight: 400 }}>(auto-detected)</span></label>
              <input value={form.timeZone} onChange={set('timeZone')} style={field} />
            </div>
          </div>
          {msg && <p style={{ fontSize: 13, marginTop: 14, color: msg.startsWith('Saved') ? '#2e7d4f' : '#c0392b' }}>{msg}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="accent" disabled={!complete || save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save Profile'}
            </Button>
            {chart && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag>☀️ Sun {chart.sunSign}</Tag>
                <Tag>🌙 Moon {chart.moonSign}</Tag>
                {chart.ascendant && <Tag>⬆️ {chart.ascendant} Rising</Tag>}
              </span>
            )}
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
            Time of birth matters: it sets your rising sign. If you're unsure, an approximate time still gives accurate Sun and Moon readings.
          </p>
        </Card>
      )}
    </div>
  );
}
