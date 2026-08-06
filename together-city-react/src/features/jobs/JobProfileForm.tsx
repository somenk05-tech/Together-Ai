import { useState } from 'react';
import { Button } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useSaveJobProfile, type JobProfile } from './api';

/**
 * THE PROFILE A PERSON WOULD ACTUALLY SHOW SOMEBODY.
 *
 * A parsed CV gives a headline, some skills and a number. That is enough to
 * match on and nothing like enough to be seen by. This is the rest of it —
 * written by the reader as a first draft, then edited here, because a synopsis
 * of somebody's career is a claim they have to stand behind and no model gets
 * to publish one on their behalf.
 *
 * Every field is optional. A citizen who only wants to be matched should not
 * have to write a biography first, and a form that demands one gets abandoned
 * halfway by exactly the people it was meant to help.
 */
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px',
  border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14,
  fontFamily: 'inherit', background: 'var(--card)',
};
const lab: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 };

export function JobProfileForm({ p, onDone }: { p: JobProfile; onDone: () => void }) {
  const save = useSaveJobProfile();
  const [fullName, setFullName] = useState(p.fullName);
  const [headline, setHeadline] = useState(p.headline);
  const [summary, setSummary] = useState(p.summary);
  const [currentTitle, setCurrentTitle] = useState(p.currentTitle);
  const [currentCompany, setCurrentCompany] = useState(p.currentCompany);
  const [location, setLocation] = useState(p.location ?? '');
  const [years, setYears] = useState(String(p.experienceYears));
  const [education, setEducation] = useState(p.education);
  const [openTo, setOpenTo] = useState(p.openToRoles.join(', '));
  const [links, setLinks] = useState(p.links);
  const [notice, setNotice] = useState(p.noticeDays == null ? '' : String(p.noticeDays));
  const [expected, setExpected] = useState(p.expectedLpa == null ? '' : String(p.expectedLpa));
  const [photoUrl, setPhotoUrl] = useState<string | null>(p.photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (v: string) => (v.trim() ? Number(v.replace(/[^\d]/g, '')) : null);

  const pickPhoto = async (f?: File | null) => {
    if (!f) return;
    setErr(null); setPhotoBusy(true);
    try { setPhotoUrl(await mediaApi.upload(f)); }
    catch (e) { setErr(uploadErrorMessage(e)); }
    finally { setPhotoBusy(false); }
  };

  return (
    <div className="card" style={{ display: 'grid', gap: 16 }}>
      <div className="eyebrow">Your job profile</div>

      {/* A face, and a way to take it off again. A photo you cannot remove is
          a photo you think twice about adding. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {photoUrl
          ? <img src={photoUrl} alt="Your profile photo" width={72} height={72}
              style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)' }} />
          : <div aria-hidden style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-soft)' }} />}
        <div>
          <span style={lab}>Photo <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <input type="file" accept="image/*" disabled={photoBusy}
            aria-label="Your profile photo"
            onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }}
            style={{ fontSize: 13, fontFamily: 'inherit' }} />
          {photoBusy && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Uploading…</p>}
          {photoUrl && !photoBusy && (
            <button type="button" onClick={() => setPhotoUrl(null)}
              style={{ display: 'block', marginTop: 6, minHeight: 44, background: 'none', border: 0, padding: 0,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      {/* THE NAME FIRST, because it is the thing a person is called and the
          thing an employer looks for. It used to be buried inside a headline
          scraped off the CV's first line, which is how a profile came to read
          "APPLICATION LETTER Applicant: ...". */}
      <div>
        <label htmlFor="jp-name" style={lab}>Your name</label>
        <input id="jp-name" style={inp} value={fullName} onChange={(e) => setFullName(e.target.value)}
          maxLength={90} placeholder="As you would like an employer to read it" />
      </div>

      <div>
        <label htmlFor="jp-headline" style={lab}>Headline</label>
        <input id="jp-headline" style={inp} value={headline} onChange={(e) => setHeadline(e.target.value)}
          maxLength={120} placeholder="Senior backend engineer" />
        <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          The role you are, not your name. This is the line an employer reads first.
        </p>
      </div>

      <div>
        <label htmlFor="jp-summary" style={lab}>Summary</label>
        <textarea id="jp-summary" style={{ ...inp, minHeight: 104, resize: 'vertical' }} value={summary}
          onChange={(e) => setSummary(e.target.value)} maxLength={900}
          placeholder="Two or three sentences about what you do and what you are looking for." />
        <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          Drafted from your CV. Read it before you keep it — it goes out in your name.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <div>
          <label htmlFor="jp-title" style={lab}>Current role</label>
          <input id="jp-title" style={inp} value={currentTitle} onChange={(e) => setCurrentTitle(e.target.value)} maxLength={90} />
        </div>
        <div>
          <label htmlFor="jp-company" style={lab}>Current company</label>
          <input id="jp-company" style={inp} value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} maxLength={90} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div>
          <label htmlFor="jp-years" style={lab}>Years of experience</label>
          <input id="jp-years" style={inp} value={years} inputMode="numeric" maxLength={2}
            onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))} />
        </div>
        <div>
          <label htmlFor="jp-city" style={lab}>City</label>
          <input id="jp-city" style={inp} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} />
        </div>
        <div>
          <label htmlFor="jp-notice" style={lab}>Notice period <span className="muted" style={{ fontWeight: 400 }}>(days)</span></label>
          <input id="jp-notice" style={inp} value={notice} inputMode="numeric" maxLength={3}
            onChange={(e) => setNotice(e.target.value.replace(/[^\d]/g, ''))} />
        </div>
        <div>
          <label htmlFor="jp-lpa" style={lab}>Expected salary <span className="muted" style={{ fontWeight: 400 }}>(LPA)</span></label>
          <input id="jp-lpa" style={inp} value={expected} inputMode="numeric" maxLength={4}
            onChange={(e) => setExpected(e.target.value.replace(/[^\d]/g, ''))} />
        </div>
      </div>

      <div>
        <label htmlFor="jp-open" style={lab}>Open to</label>
        <input id="jp-open" style={inp} value={openTo} onChange={(e) => setOpenTo(e.target.value)} maxLength={400}
          placeholder="Backend engineer, Platform engineer" />
        <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          Roles you would take, separated by commas. Matching reads these.
        </p>
      </div>

      <div>
        <label htmlFor="jp-edu" style={lab}>Education</label>
        <textarea id="jp-edu" style={{ ...inp, minHeight: 76, resize: 'vertical' }} value={education}
          onChange={(e) => setEducation(e.target.value)} maxLength={1200} placeholder="One per line" />
      </div>

      <div>
        <label htmlFor="jp-links" style={lab}>Links</label>
        <textarea id="jp-links" style={{ ...inp, minHeight: 66, resize: 'vertical' }} value={links}
          onChange={(e) => setLinks(e.target.value)} maxLength={600} placeholder="Portfolio, GitHub, LinkedIn — one per line" />
      </div>

      {err && <p style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }} role="alert">{err}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="accent" disabled={save.isPending || headline.trim().length < 2}
          onClick={() => {
            setErr(null);
            save.mutate({
              fullName: fullName.trim(),
              headline: headline.trim(),
              skills: p.skills.map((s) => s.key),
              experienceYears: Number(years || 0),
              location: location.trim() || undefined,
              summary, currentTitle, currentCompany, education, links,
              openToRoles: openTo.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5),
              noticeDays: num(notice), expectedLpa: num(expected), photoUrl,
            }, {
              onSuccess: onDone,
              onError: (e: unknown) => {
                const m = e as { response?: { data?: { message?: string | string[] } } };
                const raw = m?.response?.data?.message;
                setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not save that.');
              },
            });
          }}>
          {save.isPending ? 'Saving…' : 'Save my profile'}
        </Button>
        <Button variant="line" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
