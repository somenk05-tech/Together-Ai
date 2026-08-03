import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useJobProfile, useUploadResume } from '../api';

const MAX_CV_MB = 5;
const MAX_CV_BYTES = MAX_CV_MB * 1024 * 1024;

/** Resume & Profile — a simple "upload your CV" page: drop a file (or paste) and
 *  we parse it into skills, seniority and experience, then match you to roles. */
export function Profile() {
  const profile = useJobProfile();
  const upload = useUploadResume();
  const [fileName, setFileName] = useState<string | undefined>();
  const [drag, setDrag] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState<false | 'reader' | 'reading'>(false);

  // The CV readers (pdf.js + mammoth) are a meaty chunk. Warm them the moment
  // this page opens, so by the time a citizen picks a file the reader is
  // already here — the review's "downloads something large and just shows a
  // spinner" was this chunk arriving mid-upload, unexplained.
  useEffect(() => { void import('../cv-extract').catch(() => undefined); }, []);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (resumeText: string, name?: string) => {
    if (resumeText.trim()) upload.mutate({ resumeText, fileName: name }, { onSuccess: () => setEditing(false) });
  };

  const handleFile = async (f: File) => {
    setReadError(null);
    if (f.size > MAX_CV_BYTES) {
      setReadError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — please upload a CV under ${MAX_CV_MB} MB.`);
      return;
    }
    setFileName(f.name);
    setReading('reader');
    try {
      // Real CVs are PDFs or Word docs — extract their text in the browser
      // (pdf.js / mammoth) before parsing, instead of reading the raw bytes.
      // Usually preloaded above; on a slow network the label below says
      // honestly which wait this is.
      const { extractCvText } = await import('../cv-extract');
      setReading('reading');
      const { text, kind } = await extractCvText(f);
      const printable = text.replace(/[^\x20-\x7E\s]/g, '').length;
      const looksLikeText = text.trim().length >= 30 && printable / Math.max(1, text.length) >= 0.7;
      if (!looksLikeText) {
        setReadError(
          kind === 'text'
            ? "We couldn't read that file as text. Try a PDF, Word (.docx) or .txt file — or paste the text below."
            : "We couldn't pull enough text from that file (a scanned or image-only CV has no selectable text). Paste your CV text below and we'll parse it.",
        );
        setPasteOpen(true);
        return;
      }
      parse(text, f.name);
    } catch {
      setReadError('Could not read that file — try a PDF, Word (.docx) or .txt file, or paste the text below.');
      setPasteOpen(true);
    } finally {
      setReading(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void handleFile(f); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); };

  if (profile.isLoading) return <Spinner label="Opening your profile…" />;
  if (profile.isError || !profile.data) return <EmptyState title="Couldn't load your profile" hint="Please check your connection and try again." />;
  const p = profile.data;
  // Once a CV is parsed, collapse the uploader and lead with the parsed summary
  // (Edit / re-upload reopens it). Matches the collapse pattern in other hubs.
  const collapsed = p.saved && !editing;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Jobs · Resume & Profile</div>
      <h1 style={{ fontSize: 26 }}>{collapsed ? 'Your resume & profile' : 'Upload your CV'}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        {collapsed
          ? 'Parsed from your CV and matched to roles. Re-upload anytime to refresh it.'
          : "Drop your CV in and we'll parse your skills, seniority and experience — then match you to open roles automatically."}
      </p>

      {!collapsed && (<>
      {/* Upload dropzone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        style={{
          border: `2px dashed ${drag ? 'var(--accent)' : 'var(--line)'}`,
          background: drag ? 'var(--accent-soft)' : 'var(--card)',
          borderRadius: 18, padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
          transition: 'all .15s', marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }}>{(reading || upload.isPending) ? '⏳' : '📄'}</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>
          {reading === 'reader' ? 'Fetching the CV reader (first time only)…' : reading === 'reading' ? 'Reading your CV…' : upload.isPending ? 'Parsing your CV…' : fileName ? fileName : 'Drag & drop your CV here'}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          {(reading || upload.isPending) ? 'One moment' : `or click to choose a file · PDF, Word (.docx) or .txt · max ${MAX_CV_MB} MB`}
        </div>
        {!(reading || upload.isPending) && (
          <span className="btn btn-accent" style={{ display: 'inline-block', marginTop: 16 }}>Choose file</span>
        )}
        <input ref={fileRef} type="file" accept=".txt,.md,.text,.pdf,.doc,.docx,.rtf" onChange={onFile} style={{ display: 'none' }} />
      </div>

      {readError && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '0 0 12px' }}>{readError}</p>}

      {/* Secondary options */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setPasteOpen((o) => !o)}
          style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          {pasteOpen ? '− Hide paste box' : '✎ Paste text instead'}
        </button>
        {/* "Use a sample" used to sit here and fill this box with an invented
            person's CV, which then became the citizen's own profile and drove
            their job matches. A hint about what to include does the same job
            without putting somebody else's career in their account. */}
        <span className="muted" style={{ fontSize: 12.5 }}>
          Name, role, city, years of experience, skills.
        </span>
      </div>

      {pasteOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow">Paste your CV text</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste your CV text here…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginTop: 8 }} />
          <Button variant="accent" disabled={upload.isPending || !text.trim()} onClick={() => parse(text, fileName)} style={{ marginTop: 10 }}>
            {upload.isPending ? 'Parsing…' : 'Parse my CV'}
          </Button>
        </div>
      )}
      </>)}

      {/* Privacy note */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>🔒</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Your profile is private</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            There's no candidate directory — companies can't browse or search you. Your CV stays private until <strong>you</strong> apply to a role; only then does that one employer see your headline and the skills relevant to their job, never your raw CV.
          </p>
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
            {p.skills.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No skills detected — add detail to your CV and re-upload.</span>
              : p.skills.map((s) => (
                <span key={s.key} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 11px' }}>{s.label}</span>
              ))}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/jobs/matches"><Button variant="accent" size="sm">See matched roles →</Button></Link>
            {collapsed && <Button variant="line" size="sm" onClick={() => setEditing(true)}>Edit / re-upload CV</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
