import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Spinner, Tag } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { useLookups } from '@/api/lookups.api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { profileApi, type MasterProfileView } from '@/features/profile/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAstroProfile, useSaveAstroProfile } from '../hooks';
import { allKnownZones, isKnownZone, zoneCity, zoneForBirthPlace, zonesForCountry } from '../birthZone';
import { PrivacyNote } from '@/features/privacy/PrivacyNote';

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

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!isFinite(h)) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const GENDERS = [
  { code: 'male', label: 'Male' }, { code: 'female', label: 'Female' },
  { code: 'nonbinary', label: 'Non-binary' }, { code: 'other', label: 'Other' },
];

/** Personal Information — shared Master Profile fields beyond birth details.
 *  Follows the global standard: expands only while editing, collapses to a
 *  read-only summary after save, syncs to every hub automatically. */
function PersonalInfoSection() {
  const qc = useQueryClient();
  const master = useQuery({ queryKey: ['profile', 'master'], queryFn: profileApi.master });
  const saveM = useMutation({
    mutationFn: (patch: Partial<MasterProfileView>) => profileApi.updateMaster(patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['profile'] }); void qc.invalidateQueries({ queryKey: ['astrology'] }); },
  });
  const [editing, setEditing] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [form, setForm] = useState({ gender: '', heightCm: '', languages: '', occupation: '', phone: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const m = master.data;
    if (!m || loaded) return;
    setForm({
      gender: m.resolvedGender ?? '', heightCm: m.heightCm ? String(m.heightCm) : '',
      languages: m.languages ?? '', occupation: m.occupation ?? '', phone: m.phone ?? '',
    });
    // resolvedGender, or somebody who answered on the Master Profile page is
    // treated as brand new here and shown the form instead of their summary.
    setEditing(!(m.resolvedGender || m.heightCm || m.languages)); // returning users see the summary
    setLoaded(true);
  }, [master.data, loaded]);

  const save = () => {
    saveM.mutate({
      gender: form.gender || null,
      heightCm: form.heightCm ? parseInt(form.heightCm, 10) : null,
      languages: form.languages.trim() || null,
      occupation: form.occupation.trim() || null,
      phone: form.phone.trim() || null,
    }, {
      onSuccess: () => {
        setCollapsing(true);
        setTimeout(() => { setEditing(false); setCollapsing(false); }, 380);
      },
    });
  };

  const m = master.data;
  if (master.isError) {
    return (
      <Card className="rise" style={{ padding: '16px 22px', marginBottom: 16 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t load your personal information just now — nothing has been
          changed. It’ll be back on the next try.
        </p>
      </Card>
    );
  }
  if (!m) return null;
  const summaryBits = [
    m.gender && GENDERS.find((g) => g.code === m.gender)?.label,
    m.heightCm && `${m.heightCm} cm`,
    m.languages, m.occupation, m.phone,
  ].filter(Boolean);

  return (
    <Card className="rise" style={{ padding: '20px 26px', marginBottom: 16 }}>
      {!editing ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 800, margin: '0 0 4px' }}>
                {summaryBits.length ? '✓ Personal Information' : 'Personal Information'}
              </p>
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                {summaryBits.length ? summaryBits.join(' · ') : 'Gender, height, languages, occupation and phone — shared across every hub.'}
              </p>
            </div>
            <Button size="sm" variant="line" onClick={() => setEditing(true)}>
              {summaryBits.length ? 'Edit' : 'Add details'}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ transition: 'opacity .35s ease, transform .35s ease',
          opacity: collapsing ? 0 : 1, transform: collapsing ? 'translateY(-8px) scale(.985)' : 'none' }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, margin: '0 0 12px' }}>Personal Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <div>
              <label style={label}>Gender</label>
              <SearchSelect options={GENDERS.map((g) => ({ code: g.code, label: g.label, parentCode: null }))}
                value={GENDERS.find((g) => g.code === form.gender)?.label ?? ''}
                placeholder="Select…" onChange={(o) => setForm((f) => ({ ...f, gender: o?.code ?? '' }))} />
            </div>
            <div>
              <label style={{ display: 'block' }}>
                <span style={label}>Height (cm)</span>
                <input type="number" min={50} max={272} value={form.heightCm}
                  onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} style={field} />
              </label>
            </div>
            <div>
              <label style={label}>Languages</label>
              <input value={form.languages} placeholder="Hindi, English…"
                onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))} style={field} />
            </div>
            <div>
              <label style={label}>Occupation</label>
              <input value={form.occupation} placeholder="e.g. Engineer"
                onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} style={field} />
            </div>
            <div>
              <label style={label}>Phone</label>
              <input value={form.phone} placeholder="+91…"
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={field} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Button size="sm" variant="accent" disabled={saveM.isPending} onClick={save}>
              {saveM.isPending ? 'Saving…' : 'Save Personal Info'}
            </Button>
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 10 }}>
              Synchronizes automatically across dating, nutrition, fitness and astrology.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

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
      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--ok-ink)', margin: '0 0 10px' }}>
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
  const today = new Date().toISOString().slice(0, 10);

  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');        // 24h HH:MM
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [country, setCountry] = useState<{ label: string; code: string }>({ label: 'India', code: 'IN' });
  const [stateSel, setStateSel] = useState<{ label: string; code: string } | null>(null);
  const [city, setCity] = useState('');
  const [timeZone, setTimeZone] = useState('Asia/Kolkata');
  /**
   * WHERE THE ZONE CAME FROM, which is the difference between a fact and a
   * guess and is therefore said on screen rather than implied by "(auto)".
   * 'country' and 'city' are derived (see birthZone.ts), 'chosen' is the
   * citizen's own answer, 'saved' is what they told us last time.
   */
  const [tzFrom, setTzFrom] = useState<'country' | 'city' | 'chosen' | 'saved'>('country');
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
  const countryZones = zonesForCountry(country.code);
  /** Several zones (or none we know of) → the citizen answers, we do not. */
  const mustPickZone = countryZones.length !== 1;
  /** Whatever they had saved stays offered even if tzdata no longer lists it. */
  const zones = timeZone && !countryZones.includes(timeZone) ? [timeZone, ...countryZones] : countryZones;

  /**
   * The birth city can answer the zone question, and often does — every zone is
   * named after a city and birthZone.ts knows the large ones that are not.
   * A hand-typed zone is never overwritten: an answer beats a hint.
   */
  const setBirthCity = (value: string) => {
    setCity(value);
    if (tzFrom === 'chosen') return;
    const derived = zoneForBirthPlace(country.code, value);
    if (derived) { setTimeZone(derived); setTzFrom('city'); }
  };

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
    if (d.profile?.timeZone) { setTimeZone(d.profile.timeZone); setTzFrom('saved'); }
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
    // The zone is as load-bearing as the time itself — an hour of it is a
    // sign and a half of ascendant — so it is a required field, not a
    // default with a "change" link beside it.
    if (!timeZone.trim()) miss.push('Birth Time Zone');
    setMissing(miss);
    if (miss.length) return;
    if (!isKnownZone(timeZone)) {
      setError(`“${timeZone}” isn't a time zone we recognise. Pick one from the list — it decides where the sky was.`);
      return;
    }
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
    <div className="astro-frame">
      {/* THESE TWO LINES WERE CREAM, and the comment that used to sit here said
          why: the frame was a dark celestial mat, and only the lines resting
          directly ON it were re-coloured. The mat is white now, and cream on
          white is nothing — the heading of this page was invisible.

          They carry no colour at all now. `.eyebrow` and `h1` already know what
          they should be, and a line that names its own colour is a line that
          cannot follow the surface it is standing on. */}
      <div className="rise" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Profile · Master Profile</div>
        <h1 style={{ fontSize: 'clamp(24px,3vw,32px)' }}>Birth Details</h1>
      </div>
      <PrivacyNote hub="astrology" style={{ marginBottom: 16 }} />
      {view.isLoading && <Spinner label="Loading your details…" />}
      {/* A failed read is NOT a first visit. The form below used to open as
          though the stars had never been told — asking somebody to redo work
          the city already holds. */}
      {view.isError && (
        <Card className="rise" style={{ padding: '20px 26px', marginBottom: 16, borderLeft: '4px solid var(--warn-ink)' }}>
          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            We couldn’t load your birth details just now. Nothing you’ve saved is
            lost — it’s still on your profile. Try again in a moment.
          </p>
        </Card>
      )}
      {!view.isLoading && <PersonalInfoSection />}
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
              <label style={{ display: 'block' }}>
                <span style={label}>Date of Birth</span>
                <input type="date" value={birthDate} min="1900-01-01" max={today}
                  onChange={(e) => setBirthDate(e.target.value)} style={field} />
              </label>
            </div>
            <div>
              <label style={label}>Time of Birth</label>
              {!timeUnknown ? (
                <>
                  <input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)}
                    style={field} aria-label="Time of birth" step={60} />
                  <p className="muted" style={{ fontSize: 11.5, margin: '5px 0 0' }}>Type or pick your exact time — to the minute.</p>
                </>
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
                  setTzEdit(false);
                  // The city is cleared with the country, so this answers only
                  // for the one-zone countries. Everywhere else the field
                  // becomes an empty question until the city or the citizen
                  // answers it — never America/New_York because the country
                  // was "United States".
                  const derived = zoneForBirthPlace(opt.code, '');
                  setTimeZone(derived ?? '');
                  setTzFrom('country');
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
                  onChange={(opt) => setBirthCity(opt?.label ?? '')} />
              ) : (
                <input value={city} onChange={(e) => setBirthCity(e.target.value)}
                  placeholder={isIndia ? 'Select your state first' : 'City'}
                  disabled={isIndia && !stateSel} style={field} />
              )}
            </div>
            <div>
              <label style={label}>Time Zone {mustPickZone && <span style={{ color: 'var(--danger-ink)' }}>*</span>}</label>
              {tzEdit ? (
                <>
                  <input aria-label="Time zone" value={timeZone} list="tc-zones" placeholder="e.g. America/Los_Angeles"
                    onChange={(e) => { setTimeZone(e.target.value.trim()); setTzFrom('chosen'); }} style={field} />
                  <datalist id="tc-zones">
                    {allKnownZones().map((z) => <option key={z} value={z} />)}
                  </datalist>
                </>
              ) : mustPickZone ? (
                /* Several zones in this country → a question with no default.
                   The old form answered it silently and a Los Angeles birth was
                   computed on New York's clock, three hours and about a sign
                   and a half of ascendant away. */
                <select aria-label="Time zone of your birth city" value={timeZone} style={field}
                  onChange={(e) => { setTimeZone(e.target.value); setTzFrom('chosen'); }}>
                  <option value="">Select the time zone of your birth city…</option>
                  {zones.map((z) => <option key={z} value={z}>{zoneCity(z)} — {z}</option>)}
                </select>
              ) : (
                <div style={{ ...field, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)' }}>
                  <span style={{ fontSize: 13.5 }}>{timeZone || '—'}</span>
                  <button type="button" onClick={() => setTzEdit(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Change timezone
                  </button>
                </div>
              )}
              <p className="muted" style={{ fontSize: 11.5, margin: '5px 0 0' }}>
                {tzFrom === 'city' ? `From your birth city. ${country.label} has ${zones.length} time zones — change it if this one is wrong.`
                  : tzFrom === 'country' && !mustPickZone ? `The only time zone in ${country.label}.`
                    : mustPickZone && !timeZone ? `${country.label} spans ${zones.length} time zones, and an hour of it moves your ascendant by half a sign. Pick the one your birth city was in.`
                      : tzFrom === 'saved' ? 'What you told us last time.' : 'Your choice.'}
                {!tzEdit && mustPickZone && (
                  <> <button type="button" onClick={() => setTzEdit(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Not listed?
                  </button></>
                )}
              </p>
            </div>
          </div>

          {missing.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(192,57,43,.07)', border: '1px solid rgba(192,57,43,.25)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger-ink)', margin: 0 }}>Please complete:</p>
              {missing.map((m) => <p key={m} style={{ fontSize: 12.5, color: 'var(--danger-ink)', margin: '4px 0 0' }}>• {m}</p>)}
            </div>
          )}
          {error && <p style={{ color: 'var(--danger-ink)', fontSize: 13, marginTop: 12 }}>{error}</p>}
          {saved && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'rgba(46,125,79,.08)', border: '1px solid rgba(46,125,79,.3)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ok-ink)', margin: 0 }}>✓ Birth details saved successfully.</p>
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
