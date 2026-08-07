import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useJobProfile, useUploadResume, useDeleteResume } from '../api';
import { JobProfileForm } from '../JobProfileForm';

const MAX_CV_MB = 5;
const MAX_CV_BYTES = MAX_CV_MB * 1024 * 1024;

/** Resume & Profile — a simple "upload your CV" page: drop a file (or paste) and
 *  we parse it into skills, seniority and experience, then match you to roles. */
export function Profile() {
  const profile = useJobProfile();
  const upload = useUploadResume();
  const removeCv = useDeleteResume();
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
  const [editingProfile, setEditingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (resumeText: string, name?: string, fileUrl?: string, fileBytes?: number) => {
    if (resumeText.trim()) upload.mutate({ resumeText, fileName: name, fileUrl, fileBytes }, { onSuccess: () => setEditing(false) });
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
      /**
       * KEEP THE FILE, NOT ONLY WHAT WE READ OUT OF IT.
       *
       * A citizen used to hand over their CV, watch the app read it, and then
       * have no way to see, download or replace the document they had given.
       * The bytes are theirs. The upload is best-effort — a stored copy that
       * fails must not lose the parse that succeeded, so the profile is
       * written either way and the file link is simply absent.
       */
      let fileUrl: string | undefined;
      try { fileUrl = await mediaApi.upload(f); }
      catch (e) { setReadError(`Your CV was read, but the copy could not be stored (${uploadErrorMessage(e)}).`); }
      parse(text, f.name, fileUrl, f.size);
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
    <div>
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
          transition: 'box-shadow var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)', marginBottom: 12,
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

      {/*
        THE DOCUMENT THEY GAVE US, AND THE DOOR OUT.

        Only the extracted text used to be kept, so a CV went in and nothing
        came back — no way to check what had been uploaded, no way to replace
        the wrong file, no way to remove it. A copy of somebody's career
        history with no door out is not a feature, it is a filing cabinet with
        no key.
      */}
      {p.saved && p.resumeName && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>📄</span>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.resumeName}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {p.resumeBytes > 0 && `${(p.resumeBytes / 1024 / 1024).toFixed(1)} MB · `}
              {p.resumeAt ? `uploaded ${new Date(p.resumeAt).toLocaleDateString()}` : 'on file'}
            </div>
          </div>
          {p.resumeUrl
            ? <a href={p.resumeUrl} target="_blank" rel="noreferrer"><Button variant="line" size="sm">View</Button></a>
            /* An older upload predates the file being kept. Saying so beats a
               button that opens nothing. */
            : <span className="muted" style={{ fontSize: 12 }}>Uploaded before files were kept — re-upload to keep a copy</span>}
          <Button variant="line" size="sm" disabled={removeCv.isPending}
            onClick={() => removeCv.mutate(undefined, { onSuccess: () => { setEditing(true); setFileName(undefined); } })}>
            {removeCv.isPending ? 'Removing…' : 'Delete'}
          </Button>
        </div>
      )}

      {p.saved && editingProfile && (
        <div style={{ marginBottom: 16 }}>
          <JobProfileForm p={p} onDone={() => setEditingProfile(false)} />
        </div>
      )}

      {p.saved && !editingProfile && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="eyebrow">Your profile</div>
          {/*
            THE NAME IS THE HEADING. THE ROLE IS THE LINE UNDER IT.
            
            This card used to lead with the headline, and the headline was
            whatever the CV's first line said — so a citizen's profile
            announced itself as "APPLICATION LETTER Applicant: … Address: …
            E-mail:". A name and a job title are two different facts, and
            showing one in place of the other is how a profile stops looking
            like a person.
          */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            {p.photoUrl && (
              <img src={p.photoUrl} alt="" width={64} height={64}
                style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              {p.fullName
                ? <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.01em' }}>{p.fullName}</div>
                /* Not silence. An empty name is a question the citizen can
                   answer in one tap, and saying so beats a card that quietly
                   leads with a job title where a person should be. */
                : <button type="button" onClick={() => setEditingProfile(true)}
                    style={{ background: 'none', border: 0, padding: 0, minHeight: 44, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: 'var(--accent-ink)' }}>
                    + Add your name
                  </button>}
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{p.headline}</div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, textTransform: 'capitalize' }}>
            {p.seniority} · {p.experienceYears} yrs{p.location ? ` · ${p.location}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {p.skills.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No skills detected — add detail to your CV and re-upload.</span>
              : p.skills.map((s) => (
                <span key={s.key} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 11px' }}>{s.label}</span>
              ))}
          </div>
          {p.summary && <p style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>{p.summary}</p>}
          {(p.currentTitle || p.currentCompany) && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {[p.currentTitle, p.currentCompany].filter(Boolean).join(' · ')}
            </div>
          )}
          {p.openToRoles.length > 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Open to: {p.openToRoles.join(' · ')}</div>
          )}
          {(p.noticeDays != null || p.expectedLpa != null) && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {[p.noticeDays != null && `${p.noticeDays} days' notice`, p.expectedLpa != null && `expects ₹${p.expectedLpa} LPA`]
                .filter(Boolean).join(' · ')}
            </div>
          )}
          {p.education && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8, whiteSpace: 'pre-wrap' }}>{p.education}</p>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/jobs/matches"><Button variant="accent" size="sm">See matched roles →</Button></Link>
            <Button variant="line" size="sm" onClick={() => setEditingProfile(true)}>Edit profile</Button>
            {collapsed && <Button variant="line" size="sm" onClick={() => setEditing(true)}>Re-upload CV</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
