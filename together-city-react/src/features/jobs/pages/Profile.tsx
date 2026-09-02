import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { jobsApi, useJobProfile, useUploadResume, useDeleteResume, type CvEntry, type ResumeEntryCounts } from '../api';
import { JobProfileForm } from '../JobProfileForm';
import { ProfessionalProfile } from '../components/ProfessionalProfile';
import { CvReview } from '../components/CvReview';
import { CareerAndPrivacy } from '../components/CareerAndPrivacy';
import { allPrivate, whoCanSee, type VisibilityAnswers } from '../cv-labels';
import { Completion } from '../components/Completion';

const MAX_CV_MB = 5;
const MAX_CV_BYTES = MAX_CV_MB * 1024 * 1024;

/**
 * CV → PROFESSIONAL PROFILE.
 *
 * A document goes in and a page comes out — not a synopsis, a PAGE: the person
 * on a dark column and their work on a white one, in the order their own record
 * says it should be read.
 *
 * FOUR STATES BETWEEN THE FILE AND THE PAGE, and each is a different wait:
 *
 *   reading   — pdf.js or mammoth pulling text out, in this browser. The file
 *               never leaves the device to be read.
 *   building  — the server reading that text into a profile and a record. This
 *               is the long one, and it says what it is doing rather than
 *               spinning.
 *   found     — "we found N pieces of information". A count, before a wall of
 *               entries, so nobody is asked to review something they have not
 *               been told the size of.
 *   review    — only what the reader was unsure about. If it was sure about
 *               everything this state is SKIPPED, because a review screen with
 *               nothing on it teaches people to click through the next one.
 */
type Phase = 'idle' | 'building' | 'found' | 'review';
type Tab = 'profile' | 'looking' | 'document';

export function Profile() {
  const profile = useJobProfile();
  const upload = useUploadResume();
  const removeCv = useDeleteResume();
  const [opening, setOpening] = useState(false);
  const openCv = async () => {
    setOpening(true);
    try {
      const { url } = await jobsApi.resumeLink();
      if (url) window.open(url, '_blank', 'noopener');
      else setReadError('That copy could not be opened just now.');
    } catch { setReadError('That copy could not be opened just now.'); }
    finally { setOpening(false); }
  };
  const [fileName, setFileName] = useState<string | undefined>();
  const [drag, setDrag] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState<false | 'reader' | 'reading'>(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [found, setFound] = useState<ResumeEntryCounts | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The CV readers (pdf.js + mammoth) are a meaty chunk. Warm them the moment
  // this page opens, so by the time a citizen picks a file the reader is
  // already here — the review's "downloads something large and just shows a
  // spinner" was this chunk arriving mid-upload, unexplained.
  useEffect(() => { void import('../cv-extract').catch(() => undefined); }, []);

  const entries: CvEntry[] = useMemo(
    () => (profile.data ? Object.values(profile.data.entries).flat() : []),
    [profile.data],
  );
  /** The reader's questions. A hidden row is not being asked about — the
   *  citizen has already said they do not want it printed. */
  const unchecked = useMemo(() => entries.filter((e) => e.needsConfirming && !e.hidden), [entries]);

  // The review closes itself when the last question has been answered, rather
  // than leaving somebody looking at an empty screen with a heading on it.
  useEffect(() => {
    if (phase === 'review' && unchecked.length === 0) setPhase('idle');
  }, [phase, unchecked.length]);

  const parse = (resumeText: string, name?: string, fileKey?: string, fileBytes?: number) => {
    if (!resumeText.trim()) return;
    setPhase('building');
    upload.mutate({ resumeText, fileName: name, fileKey, fileBytes }, {
      onSuccess: (res) => {
        setFound(res.entries);
        setPhase('found');
        setReuploading(false);
        setPasteOpen(false);
        setText('');
      },
      onError: () => setPhase('idle'),
    });
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
      const { text: read, kind } = await extractCvText(f);
      const printable = read.replace(/[^\x20-\x7E\s]/g, '').length;
      const looksLikeText = read.trim().length >= 30 && printable / Math.max(1, read.length) >= 0.7;
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
      let fileKey: string | undefined;
      try { fileKey = (await mediaApi.uploadResume(f)).fileKey; }
      catch (e) { setReadError(`Your CV was read, but the copy could not be stored (${uploadErrorMessage(e)}).`); }
      parse(read, f.name, fileKey, f.size);
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
  if (profile.isError || !profile.data) {
    return <EmptyState title="Couldn't load your profile" hint="Please check your connection and try again." />;
  }
  const p = profile.data;
  const hasRecord = p.saved || entries.length > 0;

  // ── the uploader ────────────────────────────────────────────────────────
  const uploader = (
    <>
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
        <div style={{ fontSize: 40, lineHeight: 1 }}>{reading ? '⏳' : '📄'}</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>
          {reading === 'reader' ? 'Fetching the CV reader (first time only)…'
            : reading === 'reading' ? 'Reading your CV…'
              : fileName ? fileName : 'Drag & drop your CV here'}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          {reading ? 'This happens in your browser — the file has not gone anywhere yet.'
            : `or click to choose a file · PDF, Word (.docx) or .txt · max ${MAX_CV_MB} MB`}
        </div>
        {!reading && (
          <span className="btn btn-accent" style={{ display: 'inline-block', marginTop: 16 }}>Choose file</span>
        )}
        <input ref={fileRef} type="file" accept=".txt,.md,.text,.pdf,.doc,.docx,.rtf" onChange={onFile} style={{ display: 'none' }} />
      </div>

      {readError && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '0 0 12px' }}>{readError}</p>}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setPasteOpen((o) => !o)}
          style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 44 }}>
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
          <label htmlFor="cv-paste" className="eyebrow" style={{ display: 'block' }}>Paste your CV text</label>
          <textarea id="cv-paste" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste your CV text here…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginTop: 8 }} />
          <Button variant="accent" disabled={!text.trim()} onClick={() => parse(text, fileName)} style={{ marginTop: 10 }}>
            Read my CV
          </Button>
        </div>
      )}
    </>
  );

  // ── building ────────────────────────────────────────────────────────────
  if (phase === 'building') {
    return (
      <div>
        <div className="eyebrow">Jobs · Your professional profile</div>
        <div className="card" style={{ marginTop: 12, textAlign: 'center', padding: '44px 20px' }}>
          <Spinner label="Building your professional profile…" />
          <p className="muted" style={{ fontSize: 12.5, margin: '4px auto 0', maxWidth: 420 }}>
            Reading your roles, your qualifications and the things you have built into entries you
            can edit one at a time. This takes a few seconds on a long CV.
          </p>
        </div>
      </div>
    );
  }

  // ── found ───────────────────────────────────────────────────────────────
  if (phase === 'found' && found) {
    const n = found.added + found.updated;
    return (
      <div>
        <div className="eyebrow">Jobs · Your professional profile</div>
        <h1 style={{ fontSize: 26 }}>
          {n === 0 ? 'Nothing new to add' : n === 1 ? 'We found 1 piece of information' : `We found ${n} pieces of information`}
        </h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px', maxWidth: 620 }}>
          {found.added > 0 && `${found.added} new. `}
          {found.updated > 0 && `${found.updated} updated from what was already here. `}
          {found.keptYours > 0 && `${found.keptYours} left exactly as you wrote ${found.keptYours === 1 ? 'it' : 'them'}. `}
          {n === 0 && 'Your record already said everything this document does.'}
        </p>
        {/* THE RECORD IS STILL COMING BACK. The upload's answer is a count; the
            entries themselves arrive on the refetch it triggered, and offering
            "See my profile" against a record that has not landed would send
            somebody past a review that is about to exist. */}
        {profile.isFetching ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Putting them on your page…</p>
        ) : unchecked.length > 0 ? (
          <>
            <p style={{ fontSize: 13.5, margin: '0 0 14px', maxWidth: 620 }}>
              {unchecked.length === 1
                ? 'One of them we are not certain we read correctly.'
                : `${unchecked.length} of them we are not certain we read correctly.`}
              {' '}Nothing goes on your profile as a fact until you have said it is one.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="accent" onClick={() => setPhase('review')}>
                Check {unchecked.length === 1 ? 'it' : 'them'}
              </Button>
              <Button variant="line" onClick={() => setPhase('idle')}>Take me to my profile</Button>
            </div>
          </>
        ) : (
          <Button variant="accent" onClick={() => setPhase('idle')}>See my profile</Button>
        )}
      </div>
    );
  }

  // ── review ──────────────────────────────────────────────────────────────
  if (phase === 'review' && unchecked.length > 0) {
    return <CvReview entries={unchecked} onDone={() => setPhase('idle')} />;
  }

  // ── nothing yet: the uploader IS the page ───────────────────────────────
  if (!hasRecord) {
    return (
      <div>
        <div className="eyebrow">Jobs · Your professional profile</div>
        <h1 style={{ fontSize: 26 }}>Upload your CV</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px', maxWidth: 620 }}>
          Drop your CV in — it becomes a profile you can edit, entry by entry.
        </p>
        {uploader}
        <PrivacyNote p={p} />
      </div>
    );
  }

  // ── the profile ─────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Jobs · Your professional profile</div>
        <h1 style={{ fontSize: 26 }}>{p.fullName || 'Your professional profile'}</h1>
        <div className="page-tabs" role="tablist" aria-label="Your professional profile">
          <button type="button" role="tab" aria-selected={tab === 'profile'}
            aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>
            The profile
          </button>
          <button type="button" role="tab" aria-selected={tab === 'looking'}
            aria-current={tab === 'looking' ? 'page' : undefined} onClick={() => setTab('looking')}>
            What you are looking for
          </button>
          <button type="button" role="tab" aria-selected={tab === 'document'}
            aria-current={tab === 'document' ? 'page' : undefined} onClick={() => setTab('document')}>
            Your CV
          </button>
        </div>
      </div>

      {unchecked.length > 0 && tab === 'profile' && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: '4px solid var(--warn-ink)' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {unchecked.length === 1 ? 'One entry has not been checked' : `${unchecked.length} entries have not been checked`}
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              Read from your CV, not yet confirmed by you.
            </p>
          </div>
          <Button variant="accent" size="sm" onClick={() => setPhase('review')}>Check them</Button>
        </div>
      )}

      {tab === 'profile' && (
        <>
          {editingProfile ? (
            <div style={{ marginBottom: 16 }}>
              <JobProfileForm p={p} onDone={() => setEditingProfile(false)} />
            </div>
          ) : (
            <ProfessionalProfile p={p} toolbar={
              <>
                <button type="button" className="cvctl" onClick={() => setEditingProfile(true)}>
                  Edit name, photo & summary
                </button>
                <Link to="/jobs/matches"><Button variant="accent" size="sm">See matched roles →</Button></Link>
              </>
            } />
          )}
          <div style={{ marginTop: 18 }}>
            <Completion onReview={unchecked.length > 0 ? () => setPhase('review') : undefined} />
          </div>
        </>
      )}

      {tab === 'looking' && <CareerAndPrivacy p={p} />}

      {tab === 'document' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/*
            THE DOCUMENT THEY GAVE US, AND THE DOOR OUT.

            Only the extracted text used to be kept, so a CV went in and nothing
            came back — no way to check what had been uploaded, no way to replace
            the wrong file, no way to remove it. A copy of somebody's career
            history with no door out is not a feature, it is a filing cabinet with
            no key.
          */}
          {p.resumeName ? (
            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>📄</span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.resumeName}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {p.resumeBytes > 0 && `${(p.resumeBytes / 1024 / 1024).toFixed(1)} MB · `}
                  {p.resumeAt ? `uploaded ${new Date(p.resumeAt).toLocaleDateString()}` : 'on file'}
                </div>
              </div>
              {p.resumeUrl
                /* The link is minted when tapped and lasts minutes — a CV is a
                   vault file since 2 Sep, and a permanent href would be the
                   public address this page exists not to have. */
                ? <Button variant="line" size="sm" disabled={opening} onClick={() => void openCv()}>{opening ? 'Opening…' : 'View'}</Button>
                /* An older upload predates the file being kept. Saying so beats a
                   button that opens nothing. */
                : <span className="muted" style={{ fontSize: 12 }}>Uploaded before files were kept — re-upload to keep a copy</span>}
              <Button variant="line" size="sm" disabled={removeCv.isPending}
                onClick={() => removeCv.mutate(undefined, { onSuccess: () => { setReuploading(true); setFileName(undefined); } })}>
                {removeCv.isPending ? 'Removing…' : 'Delete'}
              </Button>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              There is no document on file. Your profile is whatever has been written into it.
            </p>
          )}

          {reuploading || !p.resumeName ? uploader : (
            <div>
              <Button variant="line" onClick={() => setReuploading(true)}>Upload a different CV</Button>
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0', maxWidth: 620 }}>
                A new document adds what is new and refreshes what has changed. Anything you have edited
                yourself is left exactly as you wrote it.
              </p>
            </div>
          )}

          <PrivacyNote p={p} />
        </div>
      )}
    </div>
  );
}

/**
 * THE PRIVACY NOTE SAYS WHAT THE SETTINGS SAY.
 *
 * This card used to print one sentence unconditionally — "There's no candidate
 * directory, companies can't browse or search you". True of somebody who has
 * left everything private, which is the default and most people; false the
 * moment they open their profile to recruiters, and worse than silence,
 * because it is the app telling somebody their details are safe while it
 * publishes them.
 */
function PrivacyNote({ p }: { p: VisibilityAnswers }) {
  const lines = whoCanSee(p);
  const everythingPrivate = allPrivate(p);
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--accent)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 17, lineHeight: 1 }}>🔒</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {everythingPrivate ? 'Your profile is private' : 'What you have opened up'}
        </div>
        {lines.map((line, i) => (
          <p key={`p${i}`} className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>{line}</p>
        ))}
      </div>
    </div>
  );
}
