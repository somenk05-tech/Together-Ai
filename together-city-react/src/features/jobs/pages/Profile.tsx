import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useJobProfile, useUploadResume, SAMPLE_RESUME } from '../api';

/** Resume & Profile — "upload once": paste or upload → we parse it into a profile. */
export function Profile() {
  const profile = useJobProfile();
  const upload = useUploadResume();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
  };

  const submit = () => { if (text.trim()) upload.mutate({ resumeText: text, fileName }); };

  if (profile.isLoading) return <Spinner label="Opening your profile…" />;
  if (profile.isError || !profile.data) return <EmptyState title="Couldn't load your profile" hint="Start the backend and reload." />;
  const p = profile.data;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Jobs · Resume & Profile</div>
      <h1 style={{ fontSize: 26 }}>Upload once. We do the rest.</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>
        Drop in your resume (or paste it) and we'll parse your skills, seniority and experience — then match you to open roles automatically.
      </p>

      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>🔒</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Your profile is private</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            Companies can't browse or search candidates — there's no candidate directory. Your resume and profile
            stay private until <strong>you</strong> apply to a role. Only then does that one employer see your
            headline and the skills relevant to their job — never your raw resume.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Your resume</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste your resume text here…"
          style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginTop: 8 }} />
        <input ref={fileRef} type="file" accept=".txt,.md,.text" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <Button variant="accent" disabled={upload.isPending || !text.trim()} onClick={submit}>
            {upload.isPending ? 'Parsing…' : 'Parse my resume'}
          </Button>
          <Button variant="line" size="sm" onClick={() => fileRef.current?.click()}>Upload .txt file</Button>
          <Button variant="line" size="sm" onClick={() => { setText(SAMPLE_RESUME); setFileName('sample_resume.txt'); }}>Use a sample</Button>
          {fileName && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>📄 {fileName}</span>}
        </div>
      </div>

      {p.saved && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="eyebrow">Parsed profile</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{p.headline}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, textTransform: 'capitalize' }}>
            {p.seniority} · {p.experienceYears} yrs{p.location ? ` · ${p.location}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {p.skills.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No skills detected — add detail to your resume and re-parse.</span>
              : p.skills.map((s) => (
                <span key={s.key} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 11px' }}>{s.label}</span>
              ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/jobs/matches"><Button variant="accent" size="sm">See matched roles →</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
