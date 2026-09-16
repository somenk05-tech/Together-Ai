import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, Switch } from '@/components/ui';
import { CopyAddress } from './CopyAddress';
import { useDeleteSenderRule, useMedicalMailSettings, useSetSenderRule, useUpdateMedicalMailSettings } from './api';
import { switchRows } from './switchRows';

/**
 * The settings page: the address, what Medical Mail may do, the sender rules
 * that outrank the classifier, and where the data lives. Drawn by
 * medical-mail.css.
 */
export function MedicalMailSettings() {
  const q = useMedicalMailSettings();
  const update = useUpdateMedicalMailSettings();
  const setRule = useSetSenderRule();
  const delRule = useDeleteSenderRule();
  const [pattern, setPattern] = useState('');
  const [rule, chooseRule] = useState<'medical' | 'personal'>('medical');
  const [err, setErr] = useState<string | null>(null);
  if (q.isLoading) return <Spinner label="Opening settings…" />;
  if (q.isError || !q.data) return <div><p>We couldn’t open your settings.</p><Button size="sm" onClick={() => void q.refetch()}>Try again</Button></div>;
  const s = q.data;
  const kind = pattern.includes('@') ? 'address' : 'domain';
  const add = () => {
    setErr(null);
    setRule.mutate({ pattern: pattern.trim().toLowerCase(), kind, rule }, {
      onSuccess: () => setPattern(''),
      onError: (e) => setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'That rule could not be saved.'),
    });
  };
  return (
    <div>
      <div className="eyebrow">Medical Hub · Medical Mail</div>
      <h1 className="mm-h1">Medical Mail settings</h1>
      <p className="mm-back"><Link to="/medical/mail" className="mm-link">← Medical Mail</Link></p>

      <div className="card mm-address">
        <div className="mm-eyebrow">Medical email address</div>
        <CopyAddress address={s.address} />
        <p className="muted mm-fine">
          Yours for the life of your account, made {new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}. It carries no part of your name, cannot be guessed, and belongs to exactly one account.
        </p>
      </div>

      <div className="card mm-settings">
        <div className="mm-eyebrow">What Medical Mail may do</div>
        {switchRows(s, (patch) => update.mutate(patch)).map(([label, desc, on, set]) => (
          <div key={label} className="mm-switch">
            <span className="mm-switch-text"><span className="mm-switch-l">{label}</span><span className="mm-switch-d">{desc}</span></span>
            <Switch checked={on} onChange={set} label={label} hideLabel disabled={update.isPending} />
          </div>
        ))}
      </div>

      <div className="card mm-settings">
        <div className="mm-eyebrow">Sender rules</div>
        <p className="muted mm-fine">Your word outranks the classifier. A domain covers everyone at it — apollohospitals.com — an address covers one sender.</p>
        <form className="mm-rule-form mm-section" onSubmit={(e) => { e.preventDefault(); if (pattern.trim()) add(); }}>
          <input className="mm-input" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Sender address or domain" placeholder="doctor@clinic.com or clinic.com" />
          <select className="mm-select" value={rule} onChange={(e) => chooseRule(e.target.value as 'medical' | 'personal')} aria-label="Rule">
            <option value="medical">Always medical</option>
            <option value="personal">Always personal</option>
          </select>
          <Button size="sm" variant="accent" type="submit" state={setRule.isPending ? 'loading' : undefined} loadingLabel="Saving…" disabled={!pattern.trim()}>Add rule</Button>
        </form>
        {err && <p role="alert" className="mm-err">{err}</p>}
        {s.rules.length === 0 && <p className="muted mm-fine">No rules yet. You can also add one from any message under “Why is this here?”.</p>}
        {s.rules.map((r) => (
          <div key={r.id} className="mm-switch mm-rule">
            <code>{r.pattern}</code>
            <span className="mm-rule-kind">{r.kind === 'domain' ? 'everyone at this domain' : 'this address'}</span>
            <span className={`mm-rule-what${r.rule === 'medical' ? ' mm-medical' : ''}`}>{r.rule === 'medical' ? 'Always medical' : 'Always personal'}</span>
            <button type="button" className="mm-linkbtn mm-danger" onClick={() => delRule.mutate(r.id)} disabled={delRule.isPending}>Remove</button>
          </div>
        ))}
      </div>

      <div className="card mm-address">
        <div className="mm-eyebrow">Privacy, retention & deletion</div>
        <p className="mm-prose">
          Medical emails and their files live in your private health vault — encrypted, opened only through short-lived links, counted against your 10 GB. They are never sent to analytics. They stay until you delete them here or on Health Records, and every one goes when your account does.
          {' '}<Link to="/medical/consent" className="mm-link">Privacy & Consent</Link> · <Link to="/privacy" className="mm-link">Delete your account</Link>
        </p>
      </div>
    </div>
  );
}
