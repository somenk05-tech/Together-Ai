import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui';
import { useMedicalMailSettings, useUpdateMedicalMailSettings } from './api';
import { switchRows } from './switchRows';

/** The Medical Mail rows on Privacy & Consent — the same switches the
 *  settings page has, reading and writing the same answer. */
export function MedicalMailConsent() {
  const q = useMedicalMailSettings();
  const update = useUpdateMedicalMailSettings();
  if (!q.data) return null;
  return (
    <div className="card mm-settings">
      <div className="mm-consent-head">
        <div className="mm-eyebrow">Medical Mail</div>
        <Link to="/medical/mail/settings">Sender rules & address →</Link>
      </div>
      {switchRows(q.data, (patch) => update.mutate(patch), true).map(([label, desc, on, set]) => (
        <div key={label} className="mm-switch">
          <span className="mm-switch-text"><span className="mm-switch-l">{label}</span><span className="mm-switch-d">{desc}</span></span>
          <Switch checked={on} onChange={set} label={label} hideLabel disabled={update.isPending} />
        </div>
      ))}
    </div>
  );
}
