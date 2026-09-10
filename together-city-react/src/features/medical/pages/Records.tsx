import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useMasterProfile } from '@/features/profile/hooks';
import { bloodGroupLabel } from '@/features/profile/bloodGroup';
import { declaredSummary, wasAsked } from '@/features/profile/healthConditions';
import { useRecords, useStorageUsage, useDeleteRecord, useUploadSorted, useTagRecord, medicalApi, type MedicalRecord } from '../api';

/** The folders. `label` names the folder; `tag` is the word on each file
 *  inside it — "Blood test", "Scan / X-ray" — the one line that says what the
 *  reader decided the file is (owner, 10 Sep: "just keep the tag"). */
const KINDS: { key: string; label: string; icon: string; tag: string }[] = [
  { key: 'blood-test', label: 'Blood Tests', icon: '🩸', tag: 'Blood test' },
  { key: 'urine-test', label: 'Urine Tests', icon: '🧫', tag: 'Urine test' },
  { key: 'stool-test', label: 'Stool Tests', icon: '🔬', tag: 'Stool test' },
  { key: 'imaging', label: 'Scans & Imaging', icon: '🩻', tag: 'Scan / X-ray' },
  { key: 'heart-test', label: 'Heart Tests', icon: '❤️', tag: 'Heart test' },
  { key: 'lung-test', label: 'Lung Tests', icon: '🫁', tag: 'Lung test' },
  { key: 'brain-test', label: 'Brain Tests', icon: '🧠', tag: 'Brain test' },
  { key: 'eye-test', label: 'Eye Tests', icon: '👁️', tag: 'Eye test' },
  { key: 'bone-joint', label: 'Bone & Joint Tests', icon: '🦴', tag: 'Bone & joint' },
  { key: 'genetic', label: 'Genetic Tests', icon: '🧬', tag: 'Genetic test' },
  { key: 'womens-health', label: "Women's Health", icon: '♀️', tag: "Women's health" },
  { key: 'mens-health', label: "Men's Health", icon: '♂️', tag: "Men's health" },
  { key: 'prescription', label: 'Prescriptions', icon: '💊', tag: 'Prescription' },
  { key: 'report', label: 'Medical Reports', icon: '📄', tag: 'Medical report' },
  { key: 'condition', label: 'Medical Conditions', icon: '🩺', tag: 'Condition' },
  { key: 'allergy', label: 'Allergies', icon: '⚠️', tag: 'Allergy' },
  { key: 'vaccination', label: 'Vaccinations', icon: '💉', tag: 'Vaccination' },
  { key: 'hospital', label: 'Hospital Records', icon: '🏥', tag: 'Hospital record' },
  { key: 'note', label: 'Doctor Notes', icon: '📝', tag: 'Doctor note' },
];
const iconFor = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? '📁';
const tagFor = (k: string) => KINDS.find((x) => x.key === k)?.tag ?? 'Other';
const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** One file on its way in: read by the server, then filed. */
interface Incoming { id: number; name: string; state: 'reading' | 'done' | 'error'; note: string }

/** The folder a document waits in when the reader could not tell what it is
 *  — record-reader.ts on the server names it the same. */
const UNSORTED = 'unsorted';

/** The first line the reader wrote under a file — its one-sentence summary. */
const summaryOf = (detail: string | null) =>
  (detail ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('• ')).join(' ');

/** One row of the list — the Drive's row, so the vault reads like the Drive. */
const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--line)' } as const;
const linkBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 } as const;

/**
 * Health Records — the vault, as simple as the Drive (owner, 10 Sep).
 *
 * One button. The citizen uploads files — any number, any kind — and the
 * server reads each one and files it in its folder: a blood report, a
 * prescription, a scan. The folders are the Drive's folders: a row each, open
 * one to see its files, a breadcrumb back. Every file carries one tag saying
 * what it is; there is no "Move to…" (owner, 10 Sep — "just keep the tag").
 * Nobody is asked what a file is unless the reader could not tell, and then
 * it waits at the top under "Tell us what these are" with a tag to pick. The
 * analysis of the whole record lives next door, on Record Analysis.
 */
export function Records() {
  const records = useRecords();
  // Read-only. The Master Profile asks for the blood group; this page shows it.
  const master = useMasterProfile();
  const storage = useStorageUsage();
  const upload = useUploadSorted();
  const tag = useTagRecord();
  const del = useDeleteRecord();
  const picker = useRef<HTMLInputElement>(null);
  // The open folder lives in the address, so Back closes it the way it would
  // in any file browser, and a folder can be linked to.
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder');
  const openFolder = (k: string | null) => setParams(k ? { folder: k } : {});
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const busy = incoming.some((f) => f.state === 'reading');

  // Open a private health document via a fresh short-lived signed link. The tab is
  // opened synchronously (within the click) then redirected, to avoid popup blocks.
  const openFile = async (id: string) => {
    const w = window.open('', '_blank');
    try {
      const { url } = await medicalApi.recordFile(id);
      if (url && w) w.location.href = url; else if (w) w.close();
    } catch { if (w) w.close(); }
  };

  const mark = (id: number, state: Incoming['state'], note: string) =>
    setIncoming((xs) => xs.map((x) => (x.id === id ? { ...x, state, note } : x)));

  // One at a time, in the order picked: each is a model read, and a citizen
  // watching a list fill in top to bottom can see exactly where it has got to.
  const onPick = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const batch = list.map((f, i) => ({ id: Date.now() + i, name: f.name, state: 'reading' as const, note: 'Reading…' }));
    setIncoming(batch);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const id = batch[i].id;
      if (file.size > 25 * 1024 * 1024) { mark(id, 'error', 'Over 25 MB — upload a smaller scan.'); continue; }
      try {
        const up = await mediaApi.uploadPrivate(file);
        const res = await upload.mutateAsync({ fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes, name: file.name });
        mark(id, 'done', res.note);
      } catch (e) {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        mark(id, 'error', msg ?? uploadErrorMessage(e));
      }
    }
  };

  if (records.isLoading) return <Spinner label="Opening your records…" />;

  /**
   * "No records yet", to somebody whose vault holds their records.
   *
   * This page had no failure branch, so a failed read fell through with
   * `records.data` undefined, `groups` empty, and an empty state that says the
   * filing cabinet is bare. In a medical vault that is not a cosmetic bug: the
   * first thought it produces is that something has been lost.
   *
   * Nothing is ever deleted by a failed GET, and the card says so in as many
   * words, because that is the actual question in somebody's head.
   */
  if (records.isError) {
    return (
      <div>
        <div className="eyebrow">Medical</div>
        <h1 style={{ fontSize: 26, margin: '2px 0 0' }}>We couldn’t open your records</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0', maxWidth: '56ch' }}>
          Your vault is untouched — we just couldn’t read it. Try again.
        </p>
        <div style={{ marginTop: 18 }}>
          <Button onClick={() => void records.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }
  const s = storage.data;
  const all = records.data ?? [];
  const untagged = all.filter((r) => r.kind === UNSORTED);
  // Folders exist because files are in them — the reader makes them, in the
  // KINDS order; a kind the page does not know goes under Other.
  const known = new Set(KINDS.map((k) => k.key));
  const folders = [
    ...KINDS.map((k) => ({ key: k.key, label: k.label, icon: k.icon, items: all.filter((r) => r.kind === k.key) })),
    { key: '__other', label: 'Other', icon: '📁', items: all.filter((r) => !known.has(r.kind) && r.kind !== UNSORTED) },
  ].filter((g) => g.items.length);
  const open = folder ? folders.find((f) => f.key === folder) ?? null : null;

  const fileRow = (r: MedicalRecord, untaggedRow = false) => {
    const summary = summaryOf(r.detail);
    return (
      <div key={r.id} style={{ ...rowStyle, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => r.hasFile && void openFile(r.id)} disabled={!r.hasFile}
          style={{ ...linkBtn, display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', color: 'var(--ink)' }}>
          <span style={{ fontSize: 20 }}>{untaggedRow ? '❔' : iconFor(r.kind)}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
            <span className="muted" style={{ display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[r.recordedOn, r.sizeBytes ? fmtBytes(r.sizeBytes) : null, summary || null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
        {untaggedRow ? (
          <select value="" disabled={tag.isPending} aria-label={`What is ${r.title}?`}
            onChange={(e) => { if (e.target.value) tag.mutate({ id: r.id, kind: e.target.value }); }}
            style={{ fontSize: 12.5, fontFamily: 'inherit', padding: '4px 8px', borderRadius: 'var(--r-full)', border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)' }}>
            <option value="">Tag it…</option>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.tag}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 'var(--r-full)', padding: '3px 10px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', whiteSpace: 'nowrap' }}>
            {tagFor(r.kind)}
          </span>
        )}
        {r.analyzed && (
          <Link to="/medical/blood" style={{ fontSize: 13, color: 'var(--ok-ink)', whiteSpace: 'nowrap' }}>Analysis ready →</Link>
        )}
        {r.hasFile && (
          <button type="button" onClick={() => void openFile(r.id)} style={{ ...linkBtn, color: 'var(--accent-ink)' }}>View</button>
        )}
        <button type="button" onClick={() => del.mutate(r.id)} disabled={del.isPending} style={{ ...linkBtn, color: 'var(--danger-ink)' }}>Delete</button>
      </div>
    );
  };

  return (
    <div>
      <div className="eyebrow">Medical Hub · Health Records</div>
      <h1 style={{ fontSize: 26 }}>Your health records</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Upload any report, prescription or scan — we read it and file it in the right folder. Only you can open these files.
      </p>

      {/* Blood group. Asked once on the Master Profile and read here — the only
          place in the city that shows it, and the reason the field exists at
          all. Read-only: one asker, one owner, and this page is not it.
          The three states are three different sentences, because "not
          recorded" and "answered: I don't know" are not the same fact. */}
      <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
        <strong>Blood group</strong>{' · '}
        {master.data?.bloodGroup === 'unknown'
          ? <>You told us you don’t know it. <Link to="/profile#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Update</Link></>
          : master.data?.bloodGroup
            ? bloodGroupLabel(master.data.bloodGroup)
            : <>Not recorded. <Link to="/profile#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Add it</Link></>}
      </p>

      {/* Health conditions. Asked once on the Master Profile and read here, for
          the same reason blood group is: a field that is collected and never
          shown is the H3 defect. Read-only — one asker, one owner.
          Three states, three sentences: never asked, asked and none, and the
          list itself with each qualifier beside the condition it belongs to. */}
      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
        <strong>Health conditions</strong>{' · '}
        {wasAsked(master.data?.healthConditions)
          ? <>
              {declaredSummary(master.data?.healthConditions, master.data?.pregnancyTrimester, master.data?.kidneyStage)}
              {'. '}
              <Link to="/profile#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Update</Link>
            </>
          : <>Not recorded. <Link to="/profile#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Add them</Link></>}
      </p>

      {/* The vault — the one 10 GB shared with mail and the Drive. */}
      {s && (
        <div className="card" style={{ marginTop: 16, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>Your vault</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>{fmtBytes(s.usedBytes)} of {fmtBytes(s.quotaBytes)} used · {fmtBytes(s.remainingBytes)} free</span>
          </div>
          <div style={{ height: 8, borderRadius: 'var(--r-full)', background: 'var(--line)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(1, s.usedPct)}%`, height: '100%', background: s.usedPct > 90 ? 'var(--danger-ink)' : 'var(--accent)' }} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Health {fmtBytes(s.healthBytes)} · Mail {fmtBytes(s.mailBytes)}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '16px 0 0' }}>
        <Button size="sm" variant="accent" onClick={() => picker.current?.click()} state={busy ? 'loading' : undefined} loadingLabel="Reading & filing…">
          ↑ Upload files
        </Button>
        <input ref={picker} type="file" multiple accept="image/*,.heic,.heif,.tiff,application/pdf,.txt" style={{ display: 'none' }}
          onChange={(e) => { void onPick(e.target.files); e.target.value = ''; }} />
        <span className="muted" style={{ fontSize: 12 }}>Photos or PDFs — reports, prescriptions, scans. We sort them for you.</span>
      </div>

      {incoming.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: '10px 14px' }} role="status">
          {incoming.map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '4px 0' }}>
              <span>{f.state === 'reading' ? '⏳' : f.state === 'done' ? '✓' : '⚠️'}</span>
              <strong className="flex-min" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>{f.name}</strong>
              <span style={{ color: f.state === 'error' ? 'var(--danger-ink)' : 'var(--ink-soft)' }}>{f.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Breadcrumb — the Drive's. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '18px 0 10px', fontSize: 13 }}>
        <button type="button" onClick={() => openFolder(null)}
          style={{ ...linkBtn, color: open ? 'var(--accent)' : 'var(--ink)', fontWeight: 600 }}>
          Health Records
        </button>
        {open && (
          <>
            <span className="muted">/</span>
            <span style={{ fontWeight: 600 }}>{open.label}</span>
          </>
        )}
      </div>

      {/* Asked only when the reader could not tell (owner, 10 Sep). */}
      {!open && untagged.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, background: 'var(--warn-soft)' }}>
            Tell us what these are — we couldn’t tell, so pick a tag and they move into the right folder.
          </div>
          {untagged.map((r) => fileRow(r, true))}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!open && folders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🗂</div>
            <p style={{ fontSize: 15, margin: '0 0 4px' }}>No records yet</p>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Upload a report, prescription or scan — it’s read and filed in the right folder for you.</p>
          </div>
        )}

        {!open && folders.map((f, i) => (
          <div key={f.key} style={i === 0 ? { ...rowStyle, borderTop: 'none' } : rowStyle}>
            <button type="button" onClick={() => openFolder(f.key)}
              style={{ ...linkBtn, display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', color: 'var(--ink)' }}>
              <span style={{ fontSize: 20 }}>📁</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{f.icon} {f.label}</span>
            </button>
            <span className="muted" style={{ fontSize: 12.5 }}>{f.items.length} file{f.items.length === 1 ? '' : 's'}</span>
          </div>
        ))}

        {open && open.items.map((r) => fileRow(r))}
        {folder && !open && (
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>This folder is empty.</p>
          </div>
        )}
      </div>

      {all.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          What does it all say? <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Read the analysis of your whole history →</Link>
        </p>
      )}
    </div>
  );
}
