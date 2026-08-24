import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { profileApi, type DeclaredHealthDraft, type MasterProfileView } from '../api';
import { BLOOD_GROUP_OPTIONS } from '../bloodGroup';
import { RELATIONSHIP_STATUS_OPTIONS } from '../relationshipStatus';
import { HEALTH_CONDITION_OPTIONS, KIDNEY_STAGE_OPTIONS, TRIMESTER_OPTIONS, declaredKeys, wasAsked } from '../healthConditions';
import { useFoodPref, useUpdateFoodPref } from '@/features/nutrition/hooks';
import { CUISINES, balanced, capPct, cuisineSummary, mixTotal, readMix, withMix } from '@/features/nutrition/cuisineMix';
import { useMasterProfile, useProfileCompletion } from '../hooks';
import { geoApi } from '@/api/geo.api';
import { Button } from '@/components/ui';
import { splitPlace } from '../placeParts';

/**
 * The Master Profile screen (FE-3.1).
 *
 * §3's diagnosis is that identity and body data live in whichever hub happened
 * to need them first, so several screens keep their own copy and a missing copy
 * gets filled with a sample value. The API side of the fix has existed for a
 * while — GET/PATCH /profile/master, a version column for optimistic
 * concurrency, an audit trail of every change — and it was read by five hubs
 * with NO SCREEN TO EDIT IT. Height, weight, age and sex were set in
 * /nutrition/preferences, which is how a nutrition page came to own somebody's
 * sex and date of birth.
 *
 * This is that screen. Five sections, as the ticket asks, and one rule that
 * decides the shape of all of them: A FIELD IS OWNED BY EXACTLY ONE PLACE.
 *
 * So Identity, Body and Contact are edited here, because MasterProfile is where
 * they live. Diet and Medical are SHOWN here and edited where they are stored —
 * FoodPref and the medical hub — with a link. Rendering an editable copy of a
 * field this screen does not own would recreate the exact problem §3 is about,
 * one screen further along. BE-3.2's fan-out is what eventually moves them; a
 * form is not the place to pretend it already has.
 *
 * Autosave is per field, on blur, not on keystroke: a half-typed weight is not
 * a fact about anybody, and a PATCH per character makes the audit trail
 * unreadable.
 */

type Draft = Partial<MasterProfileView>;

const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'body', label: 'Body' },
  { id: 'diet', label: 'Diet' },
  { id: 'medical', label: 'Medical' },
  { id: 'birth', label: 'Place of birth' },
  { id: 'contact', label: 'Where you live' },
] as const;

const WHY_WE_ASK = {
  sexAtBirth:
    'Used only for health calculations — calorie and nutrient targets, and the reference ranges on '
    + 'your lab results. It is never shown to anyone else.',
  genderIdentity:
    'How Together City refers to you, and what your dating profile shows. It is never used in a '
    + 'health calculation.',
};

export function MasterProfile() {
  const navigate = useNavigate();
  const master = useMasterProfile();
  const completion = useProfileCompletion();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Cuisines, edited HERE and stored THERE.
   *
   * The mix lives in FoodPref.extras and the Nutrition preferences page edits
   * the same blob. Nothing is copied onto the Master Profile row: one store,
   * two screens, so there is no second copy for syncShared() to overwrite.
   *
   * The payload carries `extras` ONLY — every other FoodPref column is left
   * alone by Prisma — and the blob is built with withMix(), which spreads what
   * is already there. `extras` is replaced wholesale by the server, so a
   * payload built from scratch would delete this citizen's allergies.
   */
  const foodPref = useFoodPref();
  const updateFoodPref = useUpdateFoodPref();
  const foodExtras = useMemo(() => {
    try { return foodPref.data?.extras ? JSON.parse(foodPref.data.extras) as Record<string, unknown> : {}; }
    catch { return {}; }
  }, [foodPref.data?.extras]);
  const [mixDraft, setMixDraft] = useState<Record<string, number> | null>(null);
  const mix = mixDraft ?? readMix(foodExtras);
  const mixDirty = mixDraft !== null;
  const saveMix = () => {
    if (!mixDraft) return;
    updateFoodPref.mutate(
      { extras: JSON.stringify(withMix(foodExtras, mixDraft)) },
      { onSuccess: () => setMixDraft(null) },
    );
  };

  /**
   * Conditions, ticked here and saved on a button rather than on blur.
   *
   * The three columns move together, so there is one request and one draft: a
   * PATCH per checkbox would let a refresh land between two of them and store a
   * trimester with nothing beside it. Same shape as the cuisine mix above, for
   * the same reason.
   */
  const [healthDraft, setHealthDraft] = useState<DeclaredHealthDraft | null>(null);
  const saveConditions = useMutation({
    mutationFn: (h: DeclaredHealthDraft) => profileApi.updateHealthConditions(h),
    onSuccess: (fresh) => {
      setHealthDraft(null);
      qc.setQueryData(['profile', 'master'], fresh);
      void qc.invalidateQueries({ queryKey: ['profile', 'completion'] });
    },
  });

  const save = useMutation({
    mutationFn: (patch: Draft) => profileApi.updateMaster(patch),
    onSuccess: (fresh, patch) => {
      // The server's answer replaces the draft for the fields it just took, so
      // a normalised value (a trimmed name, a rounded height) is what the field
      // shows rather than what was typed.
      setDraft((d) => {
        const next = { ...d };
        for (const k of Object.keys(patch)) delete next[k as keyof Draft];
        return next;
      });
      qc.setQueryData(['profile', 'master'], fresh);
      void qc.invalidateQueries({ queryKey: ['profile', 'completion'] });
      setSaved(Object.keys(patch)[0] ?? null);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(null), 2200);
    },
  });

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  /**
   * WHERE YOU LIVE, FROM THE DEVICE — ASKED FOR, NEVER TAKEN.
   *
   * The browser prompt only appears when this button is pressed. Nothing reads
   * a location on page load: a profile form that silently asks for your
   * coordinates the moment it renders is a profile form nobody should trust,
   * and the answer is only ever used to FILL THREE TEXT BOXES that stay
   * editable afterwards. No latitude or longitude is stored.
   */
  const [locBusy, setLocBusy] = useState(false);
  const [locFound, setLocFound] = useState<string | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocErr('This browser cannot share a location. Type it in below.'); return; }
    setLocErr(null); setLocFound(null); setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoApi.reverse(pos.coords.latitude, pos.coords.longitude)
          .then((place) => {
            if (!place) { setLocErr('We could not name that spot. Type it in below.'); return; }
            const parts = splitPlace(place.label, place.short);
            setLocFound(place.label);
            /* One PATCH, not three: three requests can half-land and leave a
               city in one country and a state in another. */
            setDraft((d) => ({ ...d, ...parts }));
            save.mutate(parts);
          })
          .catch(() => setLocErr('The lookup did not answer. Type it in below.'))
          .finally(() => setLocBusy(false));
      },
      () => { setLocBusy(false); setLocErr('That did not come through — you may have declined, which is fine. Type it in below.'); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  /**
   * SAVE AND CLOSE.
   *
   * Every field already autosaves on blur, which is right for a long form and
   * wrong as the ONLY way out: a citizen who edits the last box and presses
   * the browser's back button loses it, because blur never fired. This flushes
   * whatever is still in the draft in one PATCH and returns to the passport.
   */
  const [closing, setClosing] = useState(false);
  const saveAndClose = () => {
    setClosing(true);
    if (Object.keys(draft).length === 0) { navigate('/profile'); return; }
    save.mutate(draft, {
      onSuccess: () => navigate('/profile'),
      onError: () => setClosing(false),
    });
  };

  const v = useMemo(() => ({ ...(master.data ?? {}), ...draft }) as MasterProfileView, [master.data, draft]);
  const dirty = Object.keys(draft).length > 0;

  if (master.isLoading) return <Spinner label="Opening your profile…" />;
  if (!master.data) return <p className="muted" style={{ padding: 28 }}>We couldn’t load your profile. Reload to try again.</p>;

  const set = (k: keyof MasterProfileView, value: unknown) => setDraft((d) => ({ ...d, [k]: value }));
  const commit = (k: keyof MasterProfileView) => {
    if (!(k in draft)) return;              // nothing changed on this field
    save.mutate({ [k]: draft[k] } as Draft);
  };

  const health: DeclaredHealthDraft = healthDraft ?? {
    keys: declaredKeys(v.healthConditions),
    trimester: v.pregnancyTrimester ?? null,
    kidneyStage: v.kidneyStage ?? null,
  };
  const healthDirty = healthDraft !== null;
  const toggleCondition = (key: string) => {
    const keys = health.keys.includes(key)
      ? health.keys.filter((k) => k !== key)
      : [...health.keys, key];
    setHealthDraft({
      keys,
      // A qualifier never outlives its condition. The server clears it as well;
      // this is the same rule on the near side, so the control that disappears
      // does not leave a value behind the screen.
      trimester: keys.includes('pregnancy') ? health.trimester : null,
      kidneyStage: keys.includes('kidney') ? health.kidneyStage : null,
    });
  };

  const field = (
    k: keyof MasterProfileView, label: string,
    input: React.ReactNode, hint?: string,
  ) => (
    <label key={k} style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
        {saved === k && <span style={{ color: 'var(--ok-ink)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>saved</span>}
        {k in draft && saved !== k && <span style={{ color: 'var(--accent-ink)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>unsaved</span>}
      </span>
      <div style={{ marginTop: 4 }}>{input}</div>
      {hint && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>{hint}</span>}
    </label>
  );

  const text = (k: keyof MasterProfileView, name: string, type = 'text') => (
    <input
      aria-label={name}
      type={type}
      value={v[k] ?? ''}
      onChange={(e) => set(k, type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      onBlur={() => commit(k)}
      style={inputStyle}
    />
  );

  /** A plain text row: the name is written once and reaches both the visible
   *  label and the input's accessible name, so the two cannot drift apart. */
  const textField = (
    k: keyof MasterProfileView, name: string, hint?: string, type = 'text',
  ) => field(k, name, text(k, name, type), hint);

  const pct = completion.data?.percent ?? null;

  return (
    <div className="page">
      <div className="eyebrow">Your profile</div>
      <h1 style={{ fontSize: 26 }}>Master Profile</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.6 }}>
        Every hub reads from here. Change something once and Nutrition, Medical, Fitness, Beauty and
        Dating all follow — you never enter it twice.
      </p>

      {/* Completeness, from the server's own count rather than a second one
          computed here. A meter that disagrees with the nudges it drives is
          worse than no meter. */}
      {pct !== null && (
        <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <strong style={{ fontSize: 13.5 }}>Profile {pct}% complete</strong>
            {dirty && <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>unsaved changes</span>}
          </div>
          <div style={{ height: 6, borderRadius: 'var(--r-full)', background: 'var(--line)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          {(completion.data?.nextUp ?? []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(completion.data?.nextUp ?? []).slice(0, 3).map((n) => (
                <Link key={n.key} to={n.href} style={{ fontSize: 11.5, color: 'var(--accent-ink)', fontWeight: 600 }}>{n.label} →</Link>
              ))}
            </div>
          )}
        </div>
      )}

      <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '18px 0 6px' }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)' }}>{s.label}</a>
        ))}
      </nav>

      {save.isError && (
        <p style={{ color: 'var(--danger-ink)', fontSize: 12.5 }}>
          That didn’t save. Your change is still here — try again, or reload if someone else edited this profile.
        </p>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <Section id="identity" title="Identity">
        {textField('name', 'Name')}
        {field('dateOfBirth', 'Date of birth',
          <input type="date" aria-label="Date of birth" max={new Date().toISOString().slice(0, 10)}
            value={(v.dateOfBirth ?? '').slice(0, 10)}
            onChange={(e) => set('dateOfBirth', e.target.value || null)}
            onBlur={() => commit('dateOfBirth')} style={inputStyle} />,
          v.age != null ? `You are ${v.age}.` : undefined)}

        {/* The two-field block the ticket asks for, each with why we ask. They
            are separate because they answer different questions and only one of
            them enters a formula. */}
        {field('sexAtBirth', 'Sex at birth',
          <select aria-label="Sex at birth" value={v.sexAtBirth ?? ''} onChange={(e) => set('sexAtBirth', e.target.value || null)} onBlur={() => commit('sexAtBirth')} style={inputStyle}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="intersex">Intersex</option>
            <option value="preferNotToSay">Prefer not to say</option>
          </select>,
          WHY_WE_ASK.sexAtBirth)}

        {field('genderIdentity', 'Gender',
          <select aria-label="Gender" value={v.genderIdentity ?? ''} onChange={(e) => set('genderIdentity', e.target.value || null)} onBlur={() => commit('genderIdentity')} style={inputStyle}>
            <option value="">Not set</option>
            <option value="female">Woman</option>
            <option value="male">Man</option>
            <option value="nonBinary">Non-binary</option>
            <option value="other">Other</option>
          </select>,
          WHY_WE_ASK.genderIdentity)}

        {v.genderIdentity === 'other' && textField('genderIdentityOther', 'In your words')}
        {textField('occupation', 'Occupation')}

        {field('relationshipStatus', 'Relationship status',
          <select aria-label="Relationship status" value={v.relationshipStatus ?? ''}
            onChange={(e) => set('relationshipStatus', e.target.value || null)}
            onBlur={() => commit('relationshipStatus')} style={inputStyle}>
            {/* Blank first and preselected by nothing. */}
            <option value="">Not recorded</option>
            {RELATIONSHIP_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>,
          'Optional — nothing else in the city reads it, including dating.')}
      </Section>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <Section id="body" title="Body">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 12px' }}>
          These set your calorie and nutrient targets.
        </p>
        {textField('heightCm', 'Height (cm)', undefined, 'number')}
        {textField('weightKg', 'Weight (kg)', undefined, 'number')}
      </Section>

      {/* ── Diet ─────────────────────────────────────────────────── */}
      <Section id="diet" title="Diet">
        <div style={{ marginBottom: 16 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Cuisines
            {mixDirty && <span style={{ color: 'var(--accent-ink)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}> · unsaved</span>}
          </span>
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '4px 0 8px' }}>
            How much of your meal plan comes from each kitchen. This is the same setting the
            Nutrition hub edits — changing it here changes it there. Leave everything at zero for
            a broad mix; the total cannot pass 100%.
          </p>
          {foodPref.isLoading ? <span className="muted" style={{ fontSize: 12 }}>Loading…</span> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                {CUISINES.map((c) => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{c}</span>
                    <input type="number" min={0} max={100} step={5} aria-label={`${c} share`}
                      value={mix[c] ?? 0}
                      onChange={(e) => setMixDraft({ ...mix, [c]: capPct(mix, c, Number(e.target.value)) })}
                      style={{ ...inputStyle, width: 64, padding: '4px 6px' }} />
                    <span className="muted" style={{ fontSize: 11 }}>%</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 11.5 }}>{mixTotal(mix)}% assigned · {cuisineSummary(mix)}</span>
                <button type="button" onClick={() => setMixDraft(balanced(mix))}
                  className="btn btn-line btn-sm">Balance evenly</button>
                <button type="button" onClick={saveMix} disabled={!mixDirty || updateFoodPref.isPending}
                  className="btn btn-accent btn-sm">
                  {updateFoodPref.isPending ? 'Saving…' : 'Save cuisines'}
                </button>
              </div>
            </>
          )}
        </div>
        <Elsewhere
          what="Your diet, allergies and the foods you avoid"
          where="/nutrition/preferences"
          label="Food preferences"
        />
      </Section>

      {/* ── Medical ──────────────────────────────────────────────── */}
      <Section id="medical" title="Medical">
        {field('bloodGroup', 'Blood group',
          <select aria-label="Blood group" value={v.bloodGroup ?? ''}
            onChange={(e) => set('bloodGroup', e.target.value || null)}
            onBlur={() => commit('bloodGroup')} style={inputStyle}>
            {/* Blank first, and it stays blank. Nothing here is preselected:
                a group nobody chose, recorded as though they had, is p1. */}
            <option value="">Not recorded</option>
            {BLOOD_GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
            {/* Kept apart from the blank above on purpose: this one is an
                ANSWER. "Nobody asked" and "I answered, and I don't know" are
                different facts, and the health record says which. */}
            <option value="unknown">I don’t know</option>
          </select>,
          'Optional — skip it and we leave it blank. Shown on your health record; nothing in Together City uses it to make a clinical decision, and no hub sees it without your consent.')}

        {/* ── Health conditions ────────────────────────────────────
            The picker computeTargets has been waiting for. Ticked here, saved
            in one request, and shown back on the health record — the same
            shape blood group takes, and for the same reason: a field that is
            collected and never shown is the H3 defect. */}
        <div style={{ margin: '18px 0 4px' }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Health conditions
            {healthDirty && <span style={{ color: 'var(--accent-ink)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}> · unsaved</span>}
          </span>
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '4px 0 8px' }}>
            Tick anything a doctor has told you about. All optional.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 4 }}>
            {HEALTH_CONDITION_OPTIONS.map((o) => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={health.keys.includes(o.value)}
                  onChange={() => toggleCondition(o.value)} style={{ width: 18, height: 18 }} />
                <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
              </label>
            ))}
          </div>

          {health.keys.includes('pregnancy') && (
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Which trimester
              </span>
              <select aria-label="Which trimester" value={health.trimester ?? ''}
                onChange={(e) => setHealthDraft({ ...health, trimester: e.target.value || null })}
                style={{ ...inputStyle, marginTop: 4 }}>
                {/* Blank means NOT ANSWERED. "I&rsquo;d rather not say" below is a
                    different fact and is recorded as one. */}
                <option value="">Not answered</option>
                {TRIMESTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>
                Energy needs change by trimester — nothing extra in the first, about 340 more
                calories a day in the second and 450 in the third. If you would rather not say,
                we use the middle figure and tell you we did.
              </span>
            </label>
          )}

          {health.keys.includes('kidney') && (
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Which stage
              </span>
              <select aria-label="Which kidney stage" value={health.kidneyStage ?? ''}
                onChange={(e) => setHealthDraft({ ...health, kidneyStage: e.target.value || null })}
                style={{ ...inputStyle, marginTop: 4 }}>
                <option value="">Not answered</option>
                {KIDNEY_STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>
                The stage decides how much protein a plan may carry. Not knowing is a fine
                answer — we use the gentler limit and say so.
              </span>
            </label>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => saveConditions.mutate(health)}
              disabled={!healthDirty || saveConditions.isPending}
              className="btn btn-accent btn-sm">
              {saveConditions.isPending ? 'Saving…' : 'Save conditions'}
            </button>
            {!healthDirty && wasAsked(v.healthConditions) && (
              <span className="muted" style={{ fontSize: 11.5 }}>Recorded on your health record.</span>
            )}
          </div>
          {saveConditions.isError && (
            <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '8px 0 0' }}>
              That didn&rsquo;t save. Your ticks are still here — try again.
            </p>
          )}

          {/* The sentence that stops this being a button which reports success
              and changes nothing. It is pinned by a test, so it costs something
              to delete before it stops being true. */}
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '10px 0 0' }}>
            One thing to know: your meal plan does not read this list yet. The conditions your
            plan uses are still the ones on{' '}
            <Link to="/nutrition/preferences" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Food preferences</Link>,
            so ticking a box here changes what your profile says and not yet what you are served.
            We are joining the two up; until then, set both.
          </p>
        </div>
        <Elsewhere
          what="Your conditions, medicines and lab results"
          where="/medical/records"
          label="Medical hub"
        />
      </Section>

      {/* ── Place of birth ───────────────────────────────────────────
          TYPED, NEVER INFERRED. The passport's PLACE OF BIRTH used to be
          composed out of the Astrology profile's birth details, because those
          were the only birth-place fields any screen wrote — so a citizen who
          had never opened Astrology had a blank line on their document and no
          box anywhere to fill it, and one who had was shown a birth place they
          entered to get a horoscope. It is three boxes of its own now, owned
          by this screen like every other identity field.

          It is NOT prefilled from where you live. Those are different facts
          about a person and the overlap is a coincidence. */}
      <Section id="birth" title="Place of birth">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 14px' }}>
          Where you were born — typed by you, never guessed from anything else.
          It prints on your passport and it is what Astrology reads for a birth
          chart. Leave it blank and the line stays blank.
        </p>
        {textField('birthCity', 'City of birth')}
        {textField('birthState', 'State / region of birth')}
        {textField('birthCountry', 'Country of birth')}
      </Section>

      {/* ── Where you live ───────────────────────────────────────── */}
      <Section id="contact" title="Where you live">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px' }}>
          Your current address, which is what the city uses to show you what is
          near you. You can let the device fill it in, and you can correct
          whatever it puts there.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <Button variant="line" size="sm" disabled={locBusy} onClick={useMyLocation}>
            {locBusy ? 'Locating…' : 'Use my current location'}
          </Button>
          <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            Asks your browser once, fills the three boxes below, and stores only
            those three words — no coordinates.
          </span>
        </div>
        {locFound && (
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '0 0 12px' }}>
            Found <strong>{locFound}</strong> — correct anything below that is wrong.
          </p>
        )}
        {locErr && (
          <p style={{ fontSize: 12, color: 'var(--danger-ink)', margin: '0 0 12px', lineHeight: 1.5 }}>{locErr}</p>
        )}
        {textField('phone', 'Phone', undefined, 'tel')}
        {textField('city', 'City')}
        {textField('state', 'State')}
        {textField('country', 'Country')}
      </Section>

      {/* Every field autosaves on blur; this is the way OUT, and it flushes
          anything blur has not seen yet. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '26px 0 8px' }}>
        <Button variant="accent" disabled={closing || save.isPending} onClick={saveAndClose}>
          {closing || save.isPending ? 'Saving…' : 'Save and close'}
        </Button>
        <Link to="/profile" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>Back to your passport</Link>
        <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
          {dirty ? 'You have changes that have not been saved yet.' : 'Everything here is saved.'}
        </span>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 22, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>{title}</h2>
      <div className="card" style={{ padding: '16px 18px' }}>{children}</div>
    </section>
  );
}

/**
 * A field this screen shows the existence of but does not own.
 *
 * The alternative — an editable copy here as well — is precisely the problem §3
 * describes, moved one screen along. One field, one owner, one place it is
 * written.
 */
function Elsewhere({ what, where, label }: { what: string; where: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{what}</span>
      <Link to={where}
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--r-1)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
        {label} →
      </Link>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '9px 11px', border: '1px solid var(--line)',
  borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)',
  outline: 'none', boxSizing: 'border-box',
};
