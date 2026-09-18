import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useEnquire, type ServiceCard } from './api';
import { engineOf } from './engine';

/**
 * ── THE FRONT OF THE PAGE, BY ENGINE (owner, 17 Sep) ─────────────────────────
 *
 * "Create a unique business page for each kind of business." A kitchen's
 * page opens on its menu and a kirana's on its shelf — those two lead with
 * their catalogue and need nothing from here. The engines that do NOT sell
 * over a counter open on the thing a person actually came to do:
 *
 *   healthcare / professional  →  ask for an appointment or a consultation:
 *                                 the fee, the modes and the credentials the
 *                                 owner declared, a preferred time, and one
 *                                 send.
 *   job                        →  describe the problem: for a garage the
 *                                 vehicle first, then what is wrong, a
 *                                 photograph, and one send.
 *
 * EVERYTHING ENDS IN THE SAME THREAD. There is no calendar and no booking
 * table; a request here is a message to the business, opened through the
 * same anonymous enquiry every other button on the page uses, and the card
 * says so. What is different is what the citizen is asked for FIRST — which
 * is the whole of what "a unique page per kind of business" means before a
 * booking engine exists.
 *
 * The facts printed at the top are the owner's own declared details (the
 * schema's labelled lines), matched by label. Nothing is invented: a clinic
 * that gave no fee shows no fee.
 */
const pick = (s: ServiceCard, ...labels: string[]) =>
  labels.map((l) => s.details.find((d) => d.label === l)).find(Boolean) ?? null;

export function EngineFront({ s, onSent }: { s: ServiceCard; onSent: (threadId: string) => void }) {
  const engine = engineOf(s.businessType, s.catalogue);
  if (engine === 'healthcare' || engine === 'professional') return <ConsultFront s={s} engine={engine} onSent={onSent} />;
  if (engine === 'job') return <JobFront s={s} onSent={onSent} />;
  return null;
}

function ConsultFront({ s, engine, onSent }: { s: ServiceCard; engine: 'healthcare' | 'professional'; onSent: (t: string) => void }) {
  const enquire = useEnquire();
  const [when, setWhen] = useState('');
  const [about, setAbout] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fee = pick(s, 'Consultation fee', 'First consultation');
  const modes = pick(s, 'How people are seen', 'How you work');
  const quals = pick(s, 'Qualifications');
  const reg = pick(s, 'Registration number', 'Registration or bar number');
  const years = pick(s, 'Years doing this');
  const speciality = pick(s, 'Speciality', 'What you practise');
  const medical = engine === 'healthcare';

  const send = () => {
    setErr(null);
    const lines = [
      medical ? 'Appointment request' : 'Consultation request',
      when.trim() ? `Preferred time: ${when.trim()}` : null,
      about.trim() ? `About: ${about.trim()}` : null,
    ].filter(Boolean);
    enquire.mutate({ id: s.id, message: lines.join('\n') }, {
      onSuccess: (t) => onSent(t.id),
      onError: () => setErr('Could not send that just now. Try again in a moment.'),
    });
  };

  return (
    <Card className="ef">
      <div className="ef-k">{medical ? 'Book an appointment' : 'Ask for a consultation'}</div>
      {(speciality || quals || reg || years) && (
        <p className="ef-cred">
          {[speciality?.value, quals?.value, years ? `${years.value} years` : null].filter(Boolean).join(' · ')}
          {reg && <span className="muted ef-reg"> · Reg. {reg.value}</span>}
        </p>
      )}
      <dl className="ef-facts">
        {fee && <div><dt className="muted">{fee.label}</dt><dd>{fee.value}</dd></div>}
        {modes && <div><dt className="muted">{modes.label}</dt><dd>{modes.value}</dd></div>}
      </dl>
      <div className="ef-grid">
        <div>
          <label htmlFor="ef-when" className="ef-l">When suits you?</label>
          <input id="ef-when" className="ef-in" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={120}
            placeholder="Tomorrow after 6 pm, or any weekday morning" />
        </div>
        <div>
          <label htmlFor="ef-about" className="ef-l">{medical ? 'What is it about? (optional)' : 'What do you need help with? (optional)'}</label>
          <textarea id="ef-about" className="ef-in ef-ta" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={1500} rows={2} />
        </div>
      </div>
      {err && <p className="ef-err" role="alert">{err}</p>}
      <div className="ef-row">
        <Button variant="accent" disabled={enquire.isPending} onClick={send}>
          {enquire.isPending ? 'Sending…' : medical ? 'Ask for an appointment' : 'Ask for a consultation'}
        </Button>
        <span className="muted ef-say">It opens a message with them — nothing is booked until they reply. You stay anonymous.</span>
      </div>
    </Card>
  );
}

function JobFront({ s, onSent }: { s: ServiceCard; onSent: (t: string) => void }) {
  const enquire = useEnquire();
  const garage = s.businessType === 'transport';
  const [vehicle, setVehicle] = useState('');
  const [problem, setProblem] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const visit = pick(s, 'Visiting charge');
  const emergency = pick(s, 'Emergency call-outs');
  const today = pick(s, 'Taking work today');

  /** The same EXIF strip every upload in this hub gets — a photograph of a
   *  leaking pipe carries the coordinates of the bathroom it was taken in. */
  const addPhoto = async (f: File | null | undefined) => {
    if (!f) return;
    setErr(null); setBusy(true);
    try { setPhoto(await mediaApi.upload(f)); }
    catch (e) { setErr(uploadErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const send = () => {
    setErr(null);
    const lines = [
      garage ? 'Service request' : 'Job request',
      garage && vehicle.trim() ? `Vehicle: ${vehicle.trim()}` : null,
      `Problem: ${problem.trim()}`,
      photo ? `Photo: ${photo}` : null,
    ].filter(Boolean);
    enquire.mutate({ id: s.id, message: lines.join('\n') }, {
      onSuccess: (t) => onSent(t.id),
      onError: () => setErr('Could not send that just now. Try again in a moment.'),
    });
  };

  return (
    <Card className="ef">
      <div className="ef-k">{garage ? 'Tell them about your vehicle' : 'Tell them the problem'}</div>
      <dl className="ef-facts">
        {visit && <div><dt className="muted">{visit.label}</dt><dd>{visit.value}</dd></div>}
        {emergency && <div><dt className="muted">Emergency call-outs</dt><dd>Yes</dd></div>}
        {today && <div><dt className="muted">Taking work today</dt><dd>Yes</dd></div>}
      </dl>
      <div className="ef-grid">
        {garage && (
          <div>
            <label htmlFor="ef-vehicle" className="ef-l">What vehicle do you have?</label>
            <input id="ef-vehicle" className="ef-in" value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={80}
              placeholder="Make, model and year" />
          </div>
        )}
        <div>
          <label htmlFor="ef-problem" className="ef-l">Describe the problem</label>
          <textarea id="ef-problem" className="ef-in ef-ta" value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={2000} rows={3}
            placeholder={garage ? 'A knocking sound when I accelerate…' : 'What is wrong, and where — the tap in the kitchen, the AC in the bedroom…'} />
        </div>
        <div>
          <label htmlFor="ef-photo" className="ef-l">Add a photo <span className="muted ef-soft">(optional — it helps them quote)</span></label>
          {photo ? (
            <div className="ef-row">
              <img className="ef-thumb" src={photo} alt="The photo you added" />
              <Button variant="line" size="sm" onClick={() => setPhoto(null)}>Remove</Button>
            </div>
          ) : (
            <input id="ef-photo" type="file" accept="image/*" className="ef-file" disabled={busy}
              onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          )}
          {busy && <p className="muted ef-say">Uploading…</p>}
        </div>
      </div>
      {err && <p className="ef-err" role="alert">{err}</p>}
      <div className="ef-row">
        <Button variant="accent" disabled={enquire.isPending || busy || problem.trim().length < 3} onClick={send}>
          {enquire.isPending ? 'Sending…' : `Send to ${s.businessName}`}
        </Button>
        <span className="muted ef-say">It opens a message with them — they reply with a quote or a time. You stay anonymous.</span>
      </div>
    </Card>
  );
}
