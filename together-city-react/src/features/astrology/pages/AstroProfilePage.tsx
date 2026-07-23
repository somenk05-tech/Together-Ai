import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner, Tag } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { useLookups, type LookupOption } from '@/api/lookups.api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { profileApi } from '@/features/profile/api';
import { useAstroProfile, useSaveAstroProfile } from '../hooks';

/** Photo-or-initials avatar (same look as the main profile page). */
function Avatar({ src, name, size = 56 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return <img src={src} alt={name} width={size} height={size}
      style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--line)' }} />;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size / 2.6, border: '2px solid var(--line)' }}>
      {initials}
    </div>
  );
}

/** Downscale to a small square data-URL (same approach as the profile Photo tab). */
function resizeToDataUrl(file: File, size = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no canvas'));
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = URL.createObjectURL(file);
  });
}

/** The real user's photo on the Master Profile — shared app-wide (header, chat,
 *  connections, dating) through the same avatar the profile Photo tab sets. */
function MasterPhoto() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const dataUrl = await resizeToDataUrl(file);
      await profileApi.setAvatar(dataUrl);
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profileImage: dataUrl } : s.user }));
      void qc.invalidateQueries({ queryKey: ['profile', 'summary'] });
      setMsg('Photo updated ✓');
    } catch {
      setMsg('Couldn’t set that photo — try a smaller image.');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
      <Avatar src={user?.profileImage ?? null} name={user?.name ?? ''} size={72} />
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 2px' }}>{user?.name}</p>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Your photo appears across Together AI — header, chat, connections and dating.</p>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button size="sm" variant="line" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : user?.profileImage ? 'Change photo' : 'Add your photo'}
        </Button>
        {msg && <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>{msg}</span>}
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--line)',
  background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14,
};
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, display: 'block', margin: '0 0 6px' };

/** Primary IANA zone per country — auto-set on country pick, editable via the
 *  "Change timezone" link (only advanced users ever need it). */
const TZ_BY_COUNTRY: Record<string, string> = {
  IN: 'Asia/Kolkata', AE: 'Asia/Dubai', AU: 'Australia/Sydney', BD: 'Asia/Dhaka', BR: 'America/Sao_Paulo',
  CA: 'America/Toronto', CH: 'Europe/Zurich', CN: 'Asia/Shanghai', DE: 'Europe/Berlin', ES: 'Europe/Madrid',
  FR: 'Europe/Paris', GB: 'Europe/London', ID: 'Asia/Jakarta', IE: 'Europe/Dublin', IT: 'Europe/Rome',
  JP: 'Asia/Tokyo', KE: 'Africa/Nairobi', LK: 'Asia/Colombo', MY: 'Asia/Kuala_Lumpur', NG: 'Africa/Lagos',
  NL: 'Europe/Amsterdam', NP: 'Asia/Kathmandu', NZ: 'Pacific/Auckland', PH: 'Asia/Manila', PK: 'Asia/Karachi',
  QA: 'Asia/Qatar', SA: 'Asia/Riyadh', SG: 'Asia/Singapore', TH: 'Asia/Bangkok', US: 'America/New_York',
  VN: 'Asia/Ho_Chi_Minh', ZA: 'Africa/Johannesburg',
};

/** 1-minute interval time options in AM/PM, coded as 24h HH:MM. */
function useTimeOptions(): LookupOption[] {
  return useMemo(() => {
    const out: LookupOption[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const code = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const h12 = h % 12 === 0 ? 12 : h % 12;
        out.push({ code, label: `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`, parentCode: null });
      }
    }
    return out;
  }, []);
}
const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!isFinite(h)) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Compact summary shown once details are saved — the form stays hidden
 *  unless the user explicitly chooses Edit Birth Details. */
function SummaryCard({ profile, justSaved, onEdit }: {
  profile: NonNullable<import('../api').AstroProfileView['profile']>;
  justSaved: boolean;
  onEdit: () => void;
}) {
  const d = new Date(profile.birthDate + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = profile.timeKnown && profile.birthTime ? to12h(profile.birthTime) : 'Time unknown';
  const place = [profile.birthCity, profile.birthState, profile.birthCountry].filter(Boolean).join(', ');
  const updated = profile.updatedAt ? new Date(profile.updatedAt) : null;
  const daysAgo = updated ? Math.floor((Date.now() - updated.getTime()) / 86_400_000) : null;
  const updatedLabel = daysAgo == null ? '' : daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday'
    : updated!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Card className="rise" style={{ padding: '24px 26px' }}>
      <MasterPhoto />
      <p style={{ fontSize: 15, fontWeight: 800, color: '#2e7d4f', margin: '0 0 10px' }}>
        ✓ Birth Details {justSaved ? 'Completed' : 'Saved'}
      </p>
      <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>{dateStr} • {timeStr}</p>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 14px' }}>{place}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Tag>☀️ Sun {profile.chart.sunSign}</Tag>
        <Tag>🌙 Moon {profile.chart.moonSign}</Tag>
        {profile.chart.ascendant && <Tag>⬆️ {profile.chart.ascendant} Rising</Tag>}
      </div>
      {updatedLabel && <p className="muted" style={{ fontSize: 11.5, margin: '0 0 14px' }}>Last updated: {updatedLabel}</p>}
      {justSaved && (
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
          Taking you to your Today\'s Horoscope…
        </p>
      )}
      <Button variant="line" onClick={onEdit}>Edit Birth Details</Button>
      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Vedic (sidereal) chart · used automatically across Together AI wherever astrology or compatibility is required.
      </p>
    </Card>
  );
}

/** Profile → Birth Details — the Master Profile record used by every astrology
 *  and compatibility feature across Together AI. Entered once, never retyped. */
export function AstroProfilePage() {
  const view = useAstroProfile();
  const save = useSaveAstroProfile();
  const timeOptions = useTimeOptions();
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const today = new Date().toISOString().slice(0, 10);

  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');        // 24h HH:MM
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [country, setCountry] = useState<{ label: string; code: string }>({ label: 'India', code: 'IN' });
  const [stateSel, setStateSel] = useState<{ label: string; code: string } | null>(null);
  const [city, setCity] = useState('');
  const [timeZone, setTimeZone] = useState('Asia/Kolkata');
  const [tzEdit, setTzEdit] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const navigate = useNavigate();

  // Returning users with saved details see the compact summary, not the form.
  useEffect(() => {
    if (view.data && !view.data.complete) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data?.complete]);

  const countries = useLookups('country');
  const states = useLookups('state', { parent: country.code });
  const isIndia = country.code === 'IN';
  const hasStateList = (states.data?.length ?? 0) > 0;

  // Prefill from the saved profile (or dating details) — resolve labels → codes.
  useEffect(() => {
    const d = view.data;
    if (!d || !countries.data) return;
    const src = d.profile ?? d.prefill;
    if (!src) return;
    setBirthDate(src.birthDate || '');
    setBirthTime(src.birthTime || '');
    if (d.profile && !d.profile.timeKnown) setTimeUnknown(true);
    const c = countries.data.find((o) => o.label.toLowerCase() === (src.birthCountry || 'India').toLowerCase());
    if (c) setCountry({ label: c.label, code: c.code });
    if (src.birthState) setStateSel({ label: src.birthState, code: '' });
    setCity(src.birthCity || '');
    if (d.profile?.timeZone) setTimeZone(d.profile.timeZone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data, countries.data]);

  // Resolve a prefilled state label to its code once the state list loads.
  useEffect(() => {
    if (stateSel && !stateSel.code && states.data) {
      const m = states.data.find((o) => o.label.toLowerCase() === stateSel.label.toLowerCase()
        || o.label.toLowerCase().startsWith(stateSel.label.slice(0, 4).toLowerCase()));
      if (m) setStateSel({ label: m.label, code: m.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.data]);

  const submit = () => {
    setError(null); setSaved(false);
    const miss: string[] = [];
    if (!birthDate) miss.push('Date of Birth');
    if (!timeUnknown && !birthTime) miss.push('Time of Birth');
    if (!country.label) miss.push('Birth Country');
    if (hasStateList ? !stateSel?.label : false) miss.push('Birth State');
    if (!city.trim()) miss.push('Birth City');
    setMissing(miss);
    if (miss.length) return;
    save.mutate({
      birthDate,
      birthTime: timeUnknown ? null : birthTime,
      birthCountry: country.label,
      birthState: stateSel?.label || null,
      birthCity: city.trim(),
      timeZone,
    }, {
      onSuccess: () => {
        // Chart generated → animate the form closed (≈350 ms) into the summary
        // card, then take the user straight to their Today's Horoscope.
        setSaved(true); setJustSaved(true); setCollapsing(true);
        setTimeout(() => { setEditing(false); setCollapsing(false); }, 380);
        setTimeout(() => navigate('/astrology/today'), 1500);
      },
      onError: (e) => {
        const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(m) ? m.join(' ') : m ?? 'Could not save — please try again.');
      },
    });
  };

  const chart = view.data?.profile?.chart;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Profile · Master Profile</div>
        <h1 style={{ fontSize: 'clamp(24px,3vw,32px)' }}>Birth Details</h1>
        <p className="lede">
          Your birth details are stored securely in your Master Profile and are automatically used across
          Together AI wherever astrology or compatibility is required.
        </p>
      </div>
      {view.isLoading && <Spinner label="Loading your details…" />}
      {view.data?.complete && view.data.profile && !editing && (
        <SummaryCard profile={view.data.profile} justSaved={justSaved} onEdit={() => setEditing(true)} />
      )}
      {view.data && (!view.data.complete || editing) && (
        <div style={{ transition: 'opacity .35s ease, transform .35s ease',
          opacity: collapsing ? 0 : 1, transform: collapsing ? 'translateY(-8px) scale(.985)' : 'none' }}>
        <Card className="rise" style={{ padding: '24px 26px' }}>
          <MasterPhoto />
          {view.data.source === 'dating' && (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              ✓ We prefilled what you already shared during dating onboarding — confirm and save.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            <div>
              <label style={label}>Date of Birth</label>
              <input type="date" value={birthDate} min="1900-01-01" max={today}
                onChange={(e) => setBirthDate(e.target.value)} style={field} />
            </div>
            <div>
              <label style={label}>Time of Birth</label>
              {!timeUnknown ? (
                <SearchSelect options={timeOptions} value={birthTime ? to12h(birthTime) : ''}
                  placeholder="Search a time — e.g. 7:10 PM"
                  onChange={(opt) => setBirthTime(opt?.code ?? '')} ariaLabel="Time of birth" />
              ) : (
                <div style={{ ...field, background: 'var(--paper)', color: 'var(--muted)', fontSize: 13 }}>Time unknown</div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
                I don't know my exact birth time
              </label>
              {timeUnknown && (
                <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                  We'll generate a Sun-sign based chart. Accuracy for Ascendant, houses and some predictions may be reduced.
                </p>
              )}
            </div>
            <div>
              <label style={label}>Birth Country</label>
              <SearchSelect category="country" value={country.label} placeholder="Select country"
                onChange={(opt) => {
                  if (!opt) return;
                  setCountry({ label: opt.label, code: opt.code });
                  setStateSel(null); setCity('');
                  setTimeZone(TZ_BY_COUNTRY[opt.code] ?? detectedTz);
                }} />
            </div>
            <div>
              <label style={label}>Birth State / Province</label>
              {isIndia || hasStateList ? (
                <SearchSelect category="state" parent={country.code} value={stateSel?.label ?? ''}
                  placeholder="Select state"
                  onChange={(opt) => { setStateSel(opt ? { label: opt.label, code: opt.code } : null); setCity(''); }} />
              ) : (
                <input value={stateSel?.label ?? ''} onChange={(e) => setStateSel({ label: e.target.value, code: '' })}
                  placeholder="State / province (optional)" style={field} />
              )}
            </div>
            <div>
              <label style={label}>Birth City</label>
              {isIndia && stateSel?.code ? (
                <SearchSelect category="city" parent={stateSel.code} value={city}
                  placeholder="Type to search — e.g. Jam…"
                  onChange={(opt) => setCity(opt?.label ?? '')} />
              ) : (
                <input value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder={isIndia ? 'Select your state first' : 'City'}
                  disabled={isIndia && !stateSel} style={field} />
              )}
            </div>
            <div>
              <label style={label}>Time Zone</label>
              {!tzEdit ? (
                <div style={{ ...field, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)' }}>
                  <span style={{ fontSize: 13.5 }}>{timeZone} <span className="muted" style={{ fontSize: 11 }}>(auto)</span></span>
                  <button type="button" onClick={() => setTzEdit(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Change timezone
                  </button>
                </div>
              ) : (
                <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} style={field} />
              )}
            </div>
          </div>

          {missing.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(192,57,43,.07)', border: '1px solid rgba(192,57,43,.25)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#c0392b', margin: 0 }}>Please complete:</p>
              {missing.map((m) => <p key={m} style={{ fontSize: 12.5, color: '#c0392b', margin: '4px 0 0' }}>• {m}</p>)}
            </div>
          )}
          {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 12 }}>{error}</p>}
          {saved && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'rgba(46,125,79,.08)', border: '1px solid rgba(46,125,79,.3)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#2e7d4f', margin: 0 }}>✓ Birth details saved successfully.</p>
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 2px' }}>These details will be used for:</p>
              {['Daily Horoscope', 'Monthly Horoscope', 'Dating Compatibility', 'Kundli Matching', 'Future Astrology Features'].map((u) => (
                <p key={u} className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>• {u}</p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="accent" disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save Birth Details'}
            </Button>
            {chart && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag>☀️ Sun {chart.sunSign}</Tag>
                <Tag>🌙 Moon {chart.moonSign}</Tag>
                {chart.ascendant && <Tag>⬆️ {chart.ascendant} Rising</Tag>}
              </span>
            )}
          </div>
        </Card>
        </div>
      )}

      {/* Privacy */}
      <Card style={{ marginTop: 16, padding: '16px 20px', background: 'var(--paper)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>🔒 Your birth details are private.</p>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
          We use your date, time and place of birth only to generate personalized astrological insights and
          compatibility reports. Your birth details are never shown publicly and are only shared if you
          explicitly choose to do so.
        </p>
      </Card>
    </div>
  );
}
