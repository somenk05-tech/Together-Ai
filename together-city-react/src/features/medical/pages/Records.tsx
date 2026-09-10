import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Fold, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useMasterProfile } from '@/features/profile/hooks';
import { bloodGroupLabel } from '@/features/profile/bloodGroup';
import { declaredSummary, wasAsked } from '@/features/profile/healthConditions';
import { useRecords, useStorageUsage, useDeleteRecord, useUploadSorted, useTagRecord, medicalApi, type MedicalRecord } from '../api';

const KINDS: { key: string; label: string; icon: string }[] = [
  { key: 'blood-test', label: 'Blood Tests', icon: '🩸' },
  { key: 'urine-test', label: 'Urine Tests', icon: '🧫' },
  { key: 'stool-test', label: 'Stool Tests', icon: '🔬' },
  { key: 'imaging', label: 'Scans & Imaging', icon: '🩻' },
  { key: 'heart-test', label: 'Heart Tests', icon: '❤️' },
  { key: 'lung-test', label: 'Lung Tests', icon: '🫁' },
  { key: 'brain-test', label: 'Brain Tests', icon: '🧠' },
  { key: 'eye-test', label: 'Eye Tests', icon: '👁️' },
  { key: 'bone-joint', label: 'Bone & Joint Tests', icon: '🦴' },
  { key: 'genetic', label: 'Genetic Tests', icon: '🧬' },
  { key: 'womens-health', label: "Women's Health", icon: '♀️' },
  { key: 'mens-health', label: "Men's Health", icon: '♂️' },
  { key: 'prescription', label: 'Prescriptions', icon: '💊' },
  { key: 'report', label: 'Medical Reports', icon: '📄' },
  { key: 'condition', label: 'Medical Conditions', icon: '🩺' },
  { key: 'allergy', label: 'Allergies', icon: '⚠️' },
  { key: 'vaccination', label: 'Vaccinations', icon: '💉' },
  { key: 'hospital', label: 'Hospital Records', icon: '🏥' },
  { key: 'note', label: 'Doctor Notes', icon: '📝' },
];
const iconFor = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? '📁';
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

/** The reading the server wrote under a file: the summary, then "• " lines. */
const splitDetail = (detail: string | null) => {
  const lines = (detail ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return { summary: lines.filter((l) => !l.startsWith('• ')).join(' '), findings: lines.filter((l) => l.startsWith('• ')).map((l) => l.slice(2)) };
};

/**
 * Health Records — the vault, as simple as the Drive (owner, 10 Sep).
 *
 * One button. The citizen uploads files — any number, any kind — and the
 * server reads each one and files it in its folder: a blood report, a
 * prescription, a scan. Nobody is asked what a file is unless the reader could
 * not tell, and then it waits at the top under "Tell us what these are" with a
 * tag to pick. The folders below are the sort, the way the Blood Tests group
 * always looked. The analysis of the whole record lives next door, on Record
 * Analysis; the timeline that repeated this list is gone.
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
  // Sorted records under their folder heads, in the folder order below.
  const known = new Set(KINDS.map((k) => k.key));
  const groups = [
    ...KINDS.map((k) => ({ key: k.key, label: k.label, icon: k.icon, items: all.filter((r) => r.kind === k.key) })),
    { key: '__other', label: 'Other', icon: '📁', items: all.filter((r) => !known.has(r.kind) && r.kind !== UNSORTED) },
  ].filter((g) => g.items.length);

  const tagSelect = (r: MedicalRecord, placeholder: string) => (
    <select value="" disabled={tag.isPending} aria-label={`${placeholder} — ${r.title}`}
      onChange={(e) => { if (e.target.value) tag.mutate({ id: r.id, kind: e.target.value }); }}
      style={{ fontSize: 12.5, fontFamily: 'inherit', padding: '4px 8px', borderRadius: 'var(--r-full)', border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)' }}>
      <option value="">{placeholder}</option>
      {KINDS.filter((k) => k.key !== r.kind).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
    </select>
  );

  const card = (r: MedicalRecord, untaggedRow = false) => {
    const { summary, findings } = splitDetail(r.detail);
    const flagged = findings.filter((f) => /\((high|low|abnormal)\)$/.test(f)).length;
    return (
      <article key={r.id} className="card" style={{ marginBottom: 10, display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{untaggedRow ? '❔' : iconFor(r.kind)}</span>
        <div className="flex-min" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{r.title}</strong>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{r.recordedOn}</span>
          </div>
          {summary && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{summary}</p>}
          {findings.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <Fold title="What it says" meta={flagged ? `${flagged} flagged` : `${findings.length} item${findings.length === 1 ? '' : 's'}`}>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
                  {findings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </Fold>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {r.hasFile && (
              <button type="button" onClick={() => void openFile(r.id)}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', fontFamily: 'inherit' }}>
                View file{r.sizeBytes ? ` · ${fmtBytes(r.sizeBytes)}` : ''} ↗
              </button>
            )}
            {r.analyzed && (
              <Link to="/medical/blood" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ok-ink)' }}>
                Analysis ready →
              </Link>
            )}
            {tagSelect(r, untaggedRow ? 'Tag it…' : 'Move to…')}
            <button type="button" onClick={() => del.mutate(r.id)} disabled={del.isPending}
              style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--danger-ink)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
              Delete
            </button>
          </div>
        </div>
      </article>
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

      {/* Asked only when the reader could not tell (owner, 10 Sep). */}
      {untagged.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
            <span style={{ fontSize: 16 }}>❔</span>
            <h3 style={{ fontSize: 15, margin: 0 }}>Tell us what these are</h3>
            <span className="muted" style={{ fontSize: 12 }}>({untagged.length})</span>
          </div>
          {untagged.map((r) => card(r, true))}
        </div>
      )}

      {groups.length === 0 && untagged.length === 0 ? (
        <div style={{ marginTop: 18 }}>
          <EmptyState icon="🗂️" title="No records yet" hint="Upload a report, prescription or scan — it's read and filed in the right folder for you." />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <h3 style={{ fontSize: 15, margin: 0 }}>{g.label}</h3>
                <span className="muted" style={{ fontSize: 12 }}>({g.items.length})</span>
              </div>
              {g.items.map((r) => card(r))}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5 }}>
            What does it all say? <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Read the analysis of your whole history →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
