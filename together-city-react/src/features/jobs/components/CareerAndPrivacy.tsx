import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui';
import {
  useSaveCareerPreferences, useSaveVisibility,
  type EmploymentStatus, type EmploymentType, type JobProfile,
  type OpenToOffers, type Relocate, type Visibility, type WorkMode,
} from '../api';
import { whoCanSee } from '../cv-labels';

/**
 * THE QUESTIONS A CV CANNOT ANSWER.
 *
 * Everything on the professional record was read off a document. None of this
 * was, and none of it could be: a CV that mentions a figure is not a person
 * telling us what they earn, and a CV cannot say whether somebody would move
 * cities or how much notice they owe. So it is asked, once, in a short form —
 * and a short form is the point. The long version of this screen is the one
 * people abandon at question nine.
 *
 * MONEY IS PRIVATE AND SAYS SO. The compensation fields exist to filter out
 * roles that pay less than somebody asked for. They are not published, and the
 * screen says which of the two it is rather than promising the first while the
 * settings say the second — see `whoCanSee` in cv-labels.ts.
 */

const inp: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px',
  border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14,
  fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
};
const lab: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 };
const box: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px',
  borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  background: 'var(--wash)', color: 'var(--ink)',
};

const STATUS: [EmploymentStatus, string][] = [
  ['', 'Prefer not to say'], ['employed', 'Employed'], ['selfEmployed', 'Self-employed'],
  ['freelancer', 'Freelancing'], ['entrepreneur', 'Running a business'], ['student', 'Studying'],
  ['betweenRoles', 'Between roles'], ['firstJob', 'Looking for a first job'],
  ['retired', 'Retired'], ['other', 'Something else'],
];
const OFFERS: [OpenToOffers, string][] = [
  ['', 'Prefer not to say'], ['actively', 'Actively looking'], ['open', 'Open to the right thing'],
  ['notLooking', 'Not looking right now'], ['unsure', 'Undecided'],
];
const TYPES: [EmploymentType, string][] = [
  ['fullTime', 'Full time'], ['partTime', 'Part time'], ['contract', 'Contract'],
  ['freelance', 'Freelance'], ['consulting', 'Consulting'], ['internship', 'Internship'],
];
const MODES: [WorkMode, string][] = [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onSite', 'On site']];
const MOVES: [Relocate, string][] = [
  ['', 'Prefer not to say'], ['yes', 'Yes'], ['no', 'No'], ['maybe', 'Maybe, for the right role'],
];
const SEEN: [Visibility, string][] = [
  ['private', 'Private — nobody'],
  ['recruiters', 'Recruiters on Together City'],
  ['everyone', 'Everyone on Together City'],
];

const num = (v: string): number | null => (v.trim() ? Number(v.replace(/[^\d]/g, '')) : null);
const str = (n: number | null): string => (n == null ? '' : String(n));

export function CareerAndPrivacy({ p }: { p: JobProfile }) {
  const id = useId();
  const savePrefs = useSaveCareerPreferences();
  const saveSeen = useSaveVisibility();

  const [status, setStatus] = useState<EmploymentStatus>(p.employmentStatus);
  const [offers, setOffers] = useState<OpenToOffers>(p.openToOffers);
  const [types, setTypes] = useState<EmploymentType[]>(p.employmentTypes);
  const [modes, setModes] = useState<WorkMode[]>(p.workModes);
  const [moving, setMoving] = useState<Relocate>(p.relocate);
  const [places, setPlaces] = useState(p.preferredPlaces.join(', '));
  const [notice, setNotice] = useState(str(p.noticeDays));
  const [fixed, setFixed] = useState(str(p.currentFixed));
  const [variable, setVariable] = useState(str(p.currentVariable));
  const [expected, setExpected] = useState(str(p.expectedMin));
  const [currency, setCurrency] = useState(p.currency || 'INR');
  const [period, setPeriod] = useState<'annual' | 'monthly'>(p.salaryPeriod === 'monthly' ? 'monthly' : 'annual');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const failed = (e: unknown) => {
    const m = e as { response?: { data?: { message?: string | string[] } } };
    const raw = m?.response?.data?.message;
    setError(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be saved.');
  };

  const submit = () => {
    setError(null); setSaved(false);
    savePrefs.mutate({
      employmentStatus: status, openToOffers: offers,
      employmentTypes: types, workModes: modes,
      relocate: moving,
      preferredPlaces: places.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10),
      currentFixed: num(fixed), currentVariable: num(variable), expectedMin: num(expected),
      currency: currency.trim().toUpperCase().slice(0, 3) || 'INR',
      salaryPeriod: period,
      noticeDays: num(notice),
    }, { onSuccess: () => setSaved(true), onError: failed });
  };

  /** Visibility saves the moment it changes, and all three answers go together
   *  — a citizen turning their profile on and expecting their pay to stay
   *  private needs that answer to have been SENT, not inferred from silence. */
  const setSeen = (key: 'profileVisibility' | 'contactVisibility' | 'salaryVisibility', v: Visibility) => {
    setError(null);
    saveSeen.mutate({
      profileVisibility: p.profileVisibility,
      contactVisibility: p.contactVisibility,
      salaryVisibility: p.salaryVisibility,
      [key]: v,
    }, { onError: failed });
  };

  const moneyIsPrivate = p.salaryVisibility === 'private';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div>
          <div className="eyebrow">What you are looking for</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Only the questions your CV cannot answer. All of it is optional.
          </p>
        </div>

        <div style={grid}>
          <div>
            <label htmlFor={`${id}-status`} style={lab}>Where you are right now</label>
            <select id={`${id}-status`} style={inp} value={status}
              onChange={(e) => setStatus(e.target.value as EmploymentStatus)}>
              {STATUS.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-offers`} style={lab}>Open to offers?</label>
            <select id={`${id}-offers`} style={inp} value={offers}
              onChange={(e) => setOffers(e.target.value as OpenToOffers)}>
              {OFFERS.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ ...lab, padding: 0 }}>The kind of work you want</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TYPES.map(([v, l]) => (
              <label key={v} style={box}>
                <input type="checkbox" checked={types.includes(v)} style={{ width: 17, height: 17 }}
                  onChange={() => setTypes((t) => toggle(t, v))} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ ...lab, padding: 0 }}>Where you would work</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MODES.map(([v, l]) => (
              <label key={v} style={box}>
                <input type="checkbox" checked={modes.includes(v)} style={{ width: 17, height: 17 }}
                  onChange={() => setModes((m) => toggle(m, v))} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={grid}>
          <div>
            <label htmlFor={`${id}-move`} style={lab}>Would you move for a role?</label>
            <select id={`${id}-move`} style={inp} value={moving}
              onChange={(e) => setMoving(e.target.value as Relocate)}>
              {MOVES.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-places`} style={lab}>
              Places that would suit you <span className="muted" style={{ fontWeight: 400 }}>(commas)</span>
            </label>
            <input id={`${id}-places`} style={inp} value={places} maxLength={600}
              onChange={(e) => setPlaces(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-notice`} style={lab}>
              Notice you owe <span className="muted" style={{ fontWeight: 400 }}>(days)</span>
            </label>
            <input id={`${id}-notice`} style={inp} value={notice} inputMode="numeric" maxLength={3}
              onChange={(e) => setNotice(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
      </div>

      {/* ── MONEY ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div>
          <div className="eyebrow">Pay</div>
          <p style={{ fontSize: 13, margin: '6px 0 0', fontWeight: 600 }}>
            {moneyIsPrivate
              ? 'These are private. They are never shown on your profile and never sent to an employer'
                + ' — they are used only to keep roles that pay less than you asked for out of your matches.'
              : 'You have opened your pay to ' + (p.salaryVisibility === 'recruiters'
                ? 'recruiters on Together City.' : 'everyone on Together City.')
                + ' Set it back to private below if that is not what you meant.'}
          </p>
        </div>
        <div style={grid}>
          <div>
            <label htmlFor={`${id}-fixed`} style={lab}>What you earn now, fixed</label>
            <input id={`${id}-fixed`} style={inp} value={fixed} inputMode="numeric" maxLength={10}
              onChange={(e) => setFixed(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          <div>
            <label htmlFor={`${id}-variable`} style={lab}>Variable or bonus</label>
            <input id={`${id}-variable`} style={inp} value={variable} inputMode="numeric" maxLength={10}
              onChange={(e) => setVariable(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          <div>
            <label htmlFor={`${id}-expected`} style={lab}>The least you would accept</label>
            <input id={`${id}-expected`} style={inp} value={expected} inputMode="numeric" maxLength={10}
              onChange={(e) => setExpected(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          <div>
            <label htmlFor={`${id}-currency`} style={lab}>Currency</label>
            <input id={`${id}-currency`} style={inp} value={currency} maxLength={3}
              onChange={(e) => setCurrency(e.target.value.replace(/[^a-zA-Z]/g, ''))} />
          </div>
          <div>
            <label htmlFor={`${id}-period`} style={lab}>Per</label>
            <select id={`${id}-period`} style={inp} value={period}
              onChange={(e) => setPeriod(e.target.value === 'monthly' ? 'monthly' : 'annual')}>
              <option value="annual">Year</option>
              <option value="monthly">Month</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="accent" disabled={savePrefs.isPending} onClick={submit}>
          {savePrefs.isPending ? 'Saving…' : 'Save what I am looking for'}
        </Button>
        {saved && !savePrefs.isPending && (
          <span className="muted" style={{ fontSize: 12.5 }}>Saved.</span>
        )}
      </div>

      {/* ── WHO CAN SEE WHAT ─────────────────────────────────────────────── */}
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div>
          <div className="eyebrow">Who can see this</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Three separate answers, because they are three separate risks. Everything starts private.
          </p>
        </div>

        <div style={grid}>
          <div>
            <label htmlFor={`${id}-vis-profile`} style={lab}>Your profile</label>
            <select id={`${id}-vis-profile`} style={inp} value={p.profileVisibility}
              disabled={saveSeen.isPending}
              onChange={(e) => setSeen('profileVisibility', e.target.value as Visibility)}>
              {SEEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-vis-contact`} style={lab}>Your contact details</label>
            <select id={`${id}-vis-contact`} style={inp} value={p.contactVisibility}
              disabled={saveSeen.isPending}
              onChange={(e) => setSeen('contactVisibility', e.target.value as Visibility)}>
              {SEEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-vis-salary`} style={lab}>Your pay</label>
            <select id={`${id}-vis-salary`} style={inp} value={p.salaryVisibility}
              disabled={saveSeen.isPending}
              onChange={(e) => setSeen('salaryVisibility', e.target.value as Visibility)}>
              {SEEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: 12, display: 'grid', gap: 6 }}>
          {whoCanSee(p).map((line, i) => (
            <p key={`s${i}`} className="muted" style={{ fontSize: 12.5, margin: 0 }}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
