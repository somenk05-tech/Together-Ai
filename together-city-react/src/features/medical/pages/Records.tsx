import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useMasterProfile } from '@/features/profile/hooks';
import { bloodGroupLabel } from '@/features/profile/bloodGroup';
import { declaredSummary, wasAsked } from '@/features/profile/healthConditions';
import { useAddRecord, useRecords, useStorageUsage, useDeleteRecord, useLatestPanel, useBloodHistory, useIngestBlood, useHealthSummary, medicalApi } from '../api';

const MSTATUS: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: 'var(--danger-ink)', bg: 'var(--danger-soft)', label: 'LOW' },
  high: { color: 'var(--warn-ink)', bg: 'var(--warn-soft)', label: 'HIGH' },
  normal: { color: 'var(--ok-ink)', bg: 'var(--ok-soft)', label: 'OK' },
};

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
const labelFor = (k: string) => KINDS.find((x) => x.key === k)?.label ?? k;
const iconFor = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? '📁';
const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** Medical Records — the secure record store + unified 10 GB document vault. */
export function Records() {
  const records = useRecords();
  // Read-only. The Master Profile asks for the blood group; this page shows it.
  const master = useMasterProfile();
  const storage = useStorageUsage();
  const latest = useLatestPanel();
  const history = useBloodHistory();
  const summary = useHealthSummary();
  const add = useAddRecord();
  const del = useDeleteRecord();
  const ingest = useIngestBlood();
  const qc = useQueryClient();
  const [kind, setKind] = useState('blood-test');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ingestNote, setIngestNote] = useState<string | null>(null);

  const reset = () => { setTitle(''); setDetail(''); setFile(null); };

  // Open a private health document via a fresh short-lived signed link. The tab is
  // opened synchronously (within the click) then redirected, to avoid popup blocks.
  const openFile = async (id: string) => {
    const w = window.open('', '_blank');
    try {
      const { url } = await medicalApi.recordFile(id);
      if (url && w) w.location.href = url; else if (w) w.close();
    } catch { if (w) w.close(); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setIngestNote(null);
    // A blood report uploaded here auto-analyses and is shared with Blood Test Analysis.
    const isBloodReport = kind === 'blood-test' && !!file;
    const effectiveTitle = title.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : '');
    if (!effectiveTitle) { setErr('Add a title for this record first.'); return; }
    if (file) {
      if (file.size > 25 * 1024 * 1024) { setErr('That file is over 25 MB.'); return; }
      setBusy(true);
      try {
        const up = await mediaApi.uploadPrivate(file);
        if (isBloodReport) {
          // One upload → filed once AND analysed; both Medical Hub pages reference it.
          const res = await ingest.mutateAsync({
            fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes,
            title: effectiveTitle, detail: detail.trim() || undefined,
          });
          setIngestNote(res.bloodTestId
            ? `${res.note} It now appears on your Blood Test Analysis page too — no need to upload it again.`
            : res.note);
        } else {
          const recs = await medicalApi.uploadDocument({
            kind, title: effectiveTitle, detail: detail.trim() || undefined,
            fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes,
          });
          qc.setQueryData(['medical', 'records'], recs);
          void qc.invalidateQueries({ queryKey: ['medical', 'storage'] });
        }
        reset();
      } catch (e2) {
        const msg = (e2 as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setErr(msg ?? uploadErrorMessage(e2));
      } finally { setBusy(false); }
    } else {
      add.mutate({ kind, title: effectiveTitle, detail: detail.trim() || undefined }, { onSuccess: reset });
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
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div className="eyebrow">Medical</div>
        <h1 style={{ fontSize: 26, margin: '2px 0 0' }}>We couldn’t open your records</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0', maxWidth: '56ch' }}>
          Your vault is untouched — nothing has been deleted or changed. We simply couldn’t
          read it just now, and we would rather say that than show you an empty shelf.
        </p>
        <div style={{ marginTop: 18 }}>
          <Button onClick={() => void records.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }
  const s = storage.data;
  const panel = latest.data;
  const hasPanel = Boolean(panel && panel.markers.length);
  const flagged = (panel?.markers ?? []).filter((m) => m.status !== 'normal');
  const reportDocs = (records.data ?? []).filter((r) => r.kind === 'report').length;
  // total, not items.length: the list is paged, and a count that quietly means
  // "as many as this page happened to hold" is worse than no count.
  const panelCount = history.data?.total ?? (hasPanel ? 1 : 0);
  const tile = (value: string | number, label: string, alert = false) => (
    <div style={{ textAlign: 'center', padding: '10px 6px', border: '1px solid var(--line)', borderRadius: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: alert ? 'var(--danger-ink)' : 'var(--ink)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
  // Group stored records under their category heads.
  const known = new Set(KINDS.map((k) => k.key));
  const groups = [
    ...KINDS.map((k) => ({ key: k.key, label: k.label, icon: k.icon, items: (records.data ?? []).filter((r) => r.kind === k.key) })),
    { key: '__other', label: 'Other', icon: '📁', items: (records.data ?? []).filter((r) => !known.has(r.kind)) },
  ].filter((g) => g.items.length);
  // Health timeline — one entry per thing that happened, newest first.
  //
  // Review p5: "the lower two blood tests were never added, but still shows some
  // random names". They had been added. Uploading a report creates the document
  // AND a parsed panel linked to it (MedicalRecord.bloodTestId), and this list
  // rendered both — so each test appeared twice, once under the name the citizen
  // gave it and once as "Blood panel · Redcliffe Lifetech Pvt. Ltd." dated to the
  // collection date printed inside the PDF.
  //
  // Nothing was invented. The lab names and dates were read from their own
  // reports. But two entries for one test, under a name they never typed and a
  // date they did not recognise, is indistinguishable from invented data — and a
  // record of your own health that appears to contain things you did not put
  // there is worse than one that is merely cluttered.
  //
  // So a record that produced a panel is shown ONCE, keeping the title the
  // citizen chose and gaining what the panel knows: the collection date, the
  // marker count, the flags.
  const panels = history.data?.items ?? [];
  const panelById = new Map(panels.map((t) => [t.id, t]));
  const claimedPanels = new Set(
    (records.data ?? []).map((r) => r.bloodTestId).filter((id): id is string => Boolean(id && panelById.has(id))),
  );

  const timeline = [
    // Panels with no document behind them — entered by hand rather than uploaded.
    ...panels
      .filter((t) => !claimedPanels.has(t.id))
      .map((t) => ({
        date: t.takenOn, icon: '🩸',
        title: `Blood panel${t.lab ? ` · ${t.lab}` : ''}`,
        sub: `${t.markerCount} markers${t.flagged.length ? ` · ${t.flagged.length} flagged` : ''}`,
      })),
    ...(records.data ?? []).map((r) => {
      const panel = r.bloodTestId ? panelById.get(r.bloodTestId) : undefined;
      if (!panel) return { date: r.recordedOn, icon: iconFor(r.kind), title: r.title, sub: labelFor(r.kind) };
      return {
        // The collection date, not the upload date. A report uploaded today
        // about a sample drawn in May belongs in May on a health timeline.
        date: panel.takenOn,
        icon: '🩸',
        title: r.title,
        sub: [
          panel.lab,
          `${panel.markerCount} markers`,
          panel.flagged.length ? `${panel.flagged.length} flagged` : null,
        ].filter(Boolean).join(' · '),
      };
    }),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Records</div>
      <h1 style={{ fontSize: 26 }}>Your health record</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        One secure place for conditions, prescriptions, reports, allergies and vaccinations —
        your <strong>source of truth</strong>, shared with other hubs only with your consent.
      </p>

      {/* Blood group. Asked once on the Master Profile and read here — the only
          place in the city that shows it, and the reason the field exists at
          all. Read-only: one asker, one owner, and this page is not it.
          The three states are three different sentences, because "not
          recorded" and "answered: I don't know" are not the same fact. */}
      <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
        <strong>Blood group</strong>{' · '}
        {master.data?.bloodGroup === 'unknown'
          ? <>You told us you don’t know it. <Link to="/profile/master#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Update</Link></>
          : master.data?.bloodGroup
            ? bloodGroupLabel(master.data.bloodGroup)
            : <>Not recorded. <Link to="/profile/master#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Add it</Link></>}
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
              <Link to="/profile/master#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Update</Link>
            </>
          : <>Not recorded. <Link to="/profile/master#medical" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Add them</Link></>}
      </p>

      {/* Health highlights — analysis across your reports/panels */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="eyebrow" style={{ margin: 0 }}>Health highlights</div>
          {hasPanel && <Link to="/medical/blood" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>Full analysis →</Link>}
        </div>

        {hasPanel && panel ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
              Latest panel · {panel.takenOn}{panel.lab ? ` · ${panel.lab}` : ''}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {tile(panel.markers.length, 'Markers')}
              {tile(flagged.length, 'Out of range', flagged.length > 0)}
              {tile(panel.alerts.length, 'Alerts', panel.alerts.length > 0)}
              {tile(panelCount, panelCount === 1 ? 'Panel' : 'Panels')}
            </div>

            {panel.alerts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {panel.alerts.map((a) => (
                  <div key={a.key + a.value} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12, marginBottom: 8, background: a.urgent ? 'var(--danger-soft)' : 'var(--warn-soft)', border: `1.5px solid ${a.urgent ? 'var(--danger-ink)' : 'var(--warn-ink)'}` }}>
                    <span style={{ fontSize: 17 }}>{a.urgent ? '🚑' : '⚠️'}</span>
                    <div style={{ fontSize: 12.5 }}><b style={{ color: a.urgent ? 'var(--danger-ink)' : 'var(--warn-ink)' }}>{a.label} {a.value}</b> — {a.message}</div>
                  </div>
                ))}
              </div>
            )}

            {flagged.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {flagged.map((m) => {
                  const st = MSTATUS[m.status] ?? MSTATUS.normal;
                  return (
                    <span key={m.key} title={m.advice} style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 11px', background: st.bg, color: st.color }}>
                      {m.label} {m.value}{m.unit} · {st.label}{m.trend && m.trend !== 'flat' ? (m.trend === 'up' ? ' ▲' : ' ▼') : ''}
                    </span>
                  );
                })}
              </div>
            ) : (
              // This line used to declare every marker in range full stop — a claim
              // about the citizen made from a band that is not theirs. The server
              // states what the markers actually cleared, and names the band.
              // See range-basis.ts; the old wording is banned by its spec.
              <p style={{ fontSize: 12.5, marginTop: 12, color: 'var(--ok-ink)' }}>✓ {panel.inRangeLine}</p>
            )}

            {panel.rangeNote && (
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 8 }}>{panel.rangeNote}</p>
            )}

            {panel.conditions.length > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                Guidance from this panel: {panel.conditions.map((c) => c.name).join(', ')}.
              </p>
            )}

            {/* The SAME AI summary shown on Blood Test Analysis — one analysis, both pages. */}
            {summary.data?.hasPanel && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {summary.data.score != null && (
                    <span style={{ fontSize: 20, fontWeight: 800 }} title={summary.data.scoreBasis ?? undefined}>{summary.data.score}<span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>/100 · {summary.data.band}</span></span>
                  )}
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>AI health summary</span>
                </div>
                {summary.data.priorities.length > 0 && (
                  <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
                    {summary.data.priorities.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                  </ol>
                )}
                {summary.data.interpretation[0] && (
                  <p style={{ fontSize: 12.5, margin: '8px 0 0', color: 'var(--ink-soft)' }}>{summary.data.interpretation[0]}</p>
                )}
                <Link to="/medical/blood" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', display: 'inline-block', marginTop: 8 }}>Read the full analysis →</Link>
              </div>
            )}

            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              {reportDocs} report{reportDocs === 1 ? '' : 's'} on file · Educational, not a diagnosis.
            </p>
          </>
        ) : latest.isError ? (
          // Its own query, so the early return above does not cover it.
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            We couldn’t load your latest panel just now — which is not the same as there not
            being one. Nothing has been lost; it’s worth another try in a moment.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            No blood panels analysed yet. Upload a <strong>Blood Tests</strong> report below (or on <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Blood Test Analysis</Link>) — it's read and analysed automatically, and your key markers, flags and trends appear here.
          </p>
        )}
      </div>

      {/* Unified 10 GB vault meter (mail + health documents) */}
      {s && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Storage vault</div>
            <span className="muted" style={{ fontSize: 12 }}>{fmtBytes(s.usedBytes)} of {fmtBytes(s.quotaBytes)} used</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(1, s.usedPct)}%`, height: '100%', background: s.usedPct > 90 ? 'var(--danger-ink)' : 'var(--accent)' }} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Shared with your city mailbox · Mail {fmtBytes(s.mailBytes)} · Health documents {fmtBytes(s.healthBytes)}
          </p>
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Add to your record</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                border: '1.5px solid var(--line)', background: kind === k.key ? 'var(--accent)' : 'transparent', color: kind === k.key ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Type 2 diabetes, Vitamin D 60k, Penicillin allergy)"
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (optional)" rows={2}
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13 }}>
          <input type="file" accept="image/*,.heic,.heif,.tiff,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12.5 }} />
          {file && <span className="muted" style={{ fontSize: 12 }}>{fmtBytes(file.size)}</span>}
        </label>
        <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          Attach a report, prescription or scan (JPG, PNG, PDF) — it's stored in your vault.
          {kind === 'blood-test' && <> A <strong>Blood Tests</strong> report is read and analysed automatically, and shared with Blood Test Analysis.</>}
        </p>
        {err && <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', marginTop: 8 }}>{err}</p>}
        {ingestNote && <p style={{ fontSize: 12.5, marginTop: 8, padding: '8px 10px', background: 'var(--ok-soft)', borderRadius: 8 }}>✓ {ingestNote}</p>}
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="accent" disabled={busy || add.isPending}>
            {busy ? (kind === 'blood-test' && file ? 'Reading & analysing…' : 'Uploading…') : add.isPending ? 'Saving…' : file ? (kind === 'blood-test' ? 'Upload & analyse' : 'Upload & save') : 'Add record'}
          </Button>
        </div>
      </form>

      {groups.length === 0 ? (
        <div style={{ marginTop: 18 }}>
          <EmptyState icon="🗂️" title="No records yet" hint="Pick a category above, add a title, attach a file — it's filed under that heading." />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <h3 style={{ fontSize: 14.5, margin: 0 }}>{g.label}</h3>
                <span className="muted" style={{ fontSize: 12 }}>({g.items.length})</span>
              </div>
              {g.items.map((r) => (
                <article key={r.id} className="card" style={{ marginBottom: 10, display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{iconFor(r.kind)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{r.title}</strong>
                      <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{r.recordedOn}</span>
                    </div>
                    {r.detail && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{r.detail}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
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
                      <button type="button" onClick={() => del.mutate(r.id)} disabled={del.isPending}
                        style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--danger-ink)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}

      {/*
        Health Timeline — panels + records, most recent first.

        When it is empty it now says so (FE-5.2). Before, the whole block simply
        did not render, so a citizen who had added nothing yet saw a page that
        stopped, with no statement that the history was empty rather than still
        loading and no way onward from where they were looking.
      */}
      {!history.isLoading && !history.isError && !records.isLoading && timeline.length === 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">Health timeline</div>
          <EmptyState
            icon="🩸"
            title="No blood tests added yet"
            hint="Upload a lab report and we will read the values off it, or type them in yourself. Everything stays in your private vault."
            action={<Link to="/medical/blood"><Button>Add a blood test</Button></Link>}
          />
        </div>
      )}

      {timeline.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">Health timeline</div>
          <div style={{ marginTop: 12 }}>
            {timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 15 }}>{t.icon}</span>
                  {i < timeline.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--line)', margin: '4px 0' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: i < timeline.length - 1 ? 14 : 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{t.date}{t.sub ? ` · ${t.sub}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
