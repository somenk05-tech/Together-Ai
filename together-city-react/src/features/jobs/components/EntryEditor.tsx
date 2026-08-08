import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui';
import { CV_KINDS, type CvEntry, type CvEntryInput, type CvKind } from '../api';
import { KIND_ONE, fieldNames } from '../cv-labels';

/**
 * ONE ENTRY, OPEN FOR EDITING.
 *
 * Inline rather than in a dialog, on purpose: this is a document, and an editor
 * that replaces the paragraph it is editing keeps the citizen's place on the
 * page. A modal would take the surrounding record away at exactly the moment
 * they are deciding whether this entry agrees with it.
 *
 * Every field is optional except the kind. Somebody adding "Sound design,
 * Dharavi Rocks, 2021" should not have to fill in a location and a qualifier to
 * save it, and a form that insists gets abandoned by the people it was for.
 *
 * Saving writes `source: 'citizen'` and `confidence: 'high'` on the server —
 * which is what stops a later upload overwriting the sentence they just fixed.
 */

const inp: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px',
  border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14,
  fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
};
const lab: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 };
const pair: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 };

export interface EntryEditorProps {
  /** Absent when this is a new entry. */
  entry?: CvEntry;
  kind: CvKind;
  /** Adding from a place that has not chosen a section yet. */
  chooseKind?: boolean;
  busy: boolean;
  error: string | null;
  onSave: (input: CvEntryInput) => void;
  onCancel: () => void;
}

export function EntryEditor({ entry, kind, chooseKind = false, busy, error, onSave, onCancel }: EntryEditorProps) {
  const id = useId();
  const [thisKind, setThisKind] = useState<CvKind>(entry?.kind ?? kind);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [organisation, setOrganisation] = useState(entry?.organisation ?? '');
  const [qualifier, setQualifier] = useState(entry?.qualifier ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [startText, setStartText] = useState(entry?.startText ?? '');
  const [endText, setEndText] = useState(entry?.endText ?? '');
  const [current, setCurrent] = useState(entry?.current ?? false);
  const [description, setDescription] = useState(entry?.description ?? '');
  const [bullets, setBullets] = useState((entry?.bullets ?? []).join('\n'));
  const [tags, setTags] = useState((entry?.tags ?? []).join(', '));
  const [url, setUrl] = useState(entry?.url ?? '');

  const names = fieldNames(thisKind);
  const nothingSaid = !title.trim() && !organisation.trim();

  const submit = () => onSave({
    kind: thisKind,
    title: title.trim(),
    organisation: organisation.trim(),
    qualifier: qualifier.trim(),
    location: location.trim(),
    startText: startText.trim(),
    endText: current ? '' : endText.trim(),
    current,
    description: description.trim(),
    bullets: bullets.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 20),
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30),
    url: url.trim(),
    hidden: entry?.hidden ?? false,
  });

  return (
    <div className="card" style={{ display: 'grid', gap: 14, margin: '14px 0' }}>
      <div className="eyebrow">{entry ? 'Editing' : 'Adding'} · {KIND_ONE[thisKind] ?? thisKind}</div>

      {chooseKind && !entry && (
        <div>
          <label htmlFor={`${id}-kind`} style={lab}>What kind of entry is this?</label>
          <select id={`${id}-kind`} style={inp} value={thisKind} onChange={(e) => setThisKind(e.target.value)}>
            {CV_KINDS.map((k) => <option key={k} value={k}>{KIND_ONE[k]}</option>)}
          </select>
        </div>
      )}

      <div style={pair}>
        <div>
          <label htmlFor={`${id}-title`} style={lab}>{names.title}</label>
          <input id={`${id}-title`} style={inp} value={title} maxLength={160}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-org`} style={lab}>{names.org}</label>
          <input id={`${id}-org`} style={inp} value={organisation} maxLength={160}
            onChange={(e) => setOrganisation(e.target.value)} />
        </div>
      </div>

      <div style={pair}>
        <div>
          <label htmlFor={`${id}-qual`} style={lab}>
            {names.qualifier} <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input id={`${id}-qual`} style={inp} value={qualifier} maxLength={90}
            onChange={(e) => setQualifier(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-where`} style={lab}>
            Where <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input id={`${id}-where`} style={inp} value={location} maxLength={90}
            onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>

      {/* DATES STAY AS WRITTEN. "Mar 2019", "2019" and "Spring 2019" are all
          real, and turning any of them into a calendar date invents a day the
          document never claimed. The server derives its own sort key. */}
      <div style={pair}>
        <div>
          <label htmlFor={`${id}-from`} style={lab}>From</label>
          <input id={`${id}-from`} style={inp} value={startText} maxLength={40}
            onChange={(e) => setStartText(e.target.value)} placeholder="Mar 2019" />
        </div>
        <div>
          <label htmlFor={`${id}-to`} style={lab}>To</label>
          <input id={`${id}-to`} style={inp} value={endText} maxLength={40} disabled={current}
            onChange={(e) => setEndText(e.target.value)} placeholder="Aug 2021" />
          <label htmlFor={`${id}-now`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, fontWeight: 600, minHeight: 24 }}>
            <input id={`${id}-now`} type="checkbox" checked={current}
              onChange={(e) => setCurrent(e.target.checked)} style={{ width: 18, height: 18 }} />
            Still here
          </label>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-desc`} style={lab}>
          In your own words <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea id={`${id}-desc`} style={{ ...inp, minHeight: 92, resize: 'vertical' }} value={description}
          maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label htmlFor={`${id}-points`} style={lab}>
          Points <span className="muted" style={{ fontWeight: 400 }}>(one per line, optional)</span>
        </label>
        <textarea id={`${id}-points`} style={{ ...inp, minHeight: 78, resize: 'vertical' }} value={bullets}
          onChange={(e) => setBullets(e.target.value)} />
      </div>

      <div style={pair}>
        <div>
          <label htmlFor={`${id}-tags`} style={lab}>
            Tags <span className="muted" style={{ fontWeight: 400 }}>(commas)</span>
          </label>
          <input id={`${id}-tags`} style={inp} value={tags} maxLength={600}
            onChange={(e) => setTags(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-url`} style={lab}>
            Link <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input id={`${id}-url`} style={inp} value={url} maxLength={500}
            onChange={(e) => setUrl(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="accent" size="sm" disabled={busy || nothingSaid} onClick={submit}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="line" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        {nothingSaid && (
          <span className="muted" style={{ fontSize: 12 }}>
            Give it a {names.title.toLowerCase()} or a{names.org.match(/^[AEIOU]/i) ? 'n' : ''} {names.org.toLowerCase()} to save it.
          </span>
        )}
      </div>
    </div>
  );
}
