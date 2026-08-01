import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useDrive, fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';

/**
 * Pick files from the citizen's Drive to attach to a message. Browses the same
 * folder tree as /drive (read-only) and hands back the chosen files.
 */
export function DrivePicker({ onClose, onPick, alreadyPicked }: {
  onClose: () => void;
  onPick: (files: DriveFile[]) => void;
  alreadyPicked: string[];
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, DriveFile>>({});
  const listing = useDrive(folderId);
  const data = listing.data;
  // An empty picker on a failed read looks like the Drive is EMPTY — files
  // reading as gone is the worst false sentence this dialog can show.
  const loadFailed = listing.isError;

  const toggle = (f: DriveFile) => setSelected((cur) => {
    const next = { ...cur };
    if (next[f.id]) delete next[f.id]; else next[f.id] = f;
    return next;
  });

  const chosen = Object.values(selected);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: 'min(560px, 96vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 15 }}>📎 Attach from Drive</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
        </div>

        {/* breadcrumb */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 16px', fontSize: 12.5, borderBottom: '1px solid var(--line)' }}>
          <button type="button" onClick={() => setFolderId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, color: folderId ? 'var(--accent)' : 'var(--ink)', fontWeight: 600 }}>Drive</button>
          {(data?.breadcrumb ?? []).map((b) => (
            <span key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="muted">/</span>
              <button type="button" onClick={() => setFolderId(b.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, color: 'var(--accent)', fontWeight: 600 }}>{b.name}</button>
            </span>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', minHeight: 140 }}>
          {listing.isLoading && <div style={{ padding: 24 }}><Spinner /></div>}
          {loadFailed && (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '32px 16px' }}>
              We couldn’t open your Drive just now. Nothing is missing — every
              file is where you left it. Close and reopen to retry.
            </p>
          )}
          {data && data.folders.length === 0 && data.files.length === 0 && (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '32px 16px' }}>
              This folder is empty. Upload files in <strong>Drive</strong> first.
            </p>
          )}
          {(data?.folders ?? []).map((d) => (
            <button key={d.id} type="button" onClick={() => setFolderId(d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <span style={{ fontSize: 18 }}>📁</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{d.name}</span>
            </button>
          ))}
          {(data?.files ?? []).map((f) => {
            const on = Boolean(selected[f.id]);
            const dup = alreadyPicked.includes(f.id);
            return (
              <button key={f.id} type="button" onClick={() => !dup && toggle(f)} disabled={dup}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--line)', cursor: dup ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ink)', opacity: dup ? 0.5 : 1, background: on ? 'var(--accent-soft)' : 'none' }}>
                <span style={{ fontSize: 18 }}>{fileIcon(f)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{fmtBytes(f.sizeBytes)}{dup ? ' · already attached' : ''}</span>
                </span>
                {on && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{chosen.length} selected</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button size="sm" variant="line" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="accent" disabled={!chosen.length} onClick={() => { onPick(chosen); onClose(); }}>Attach</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
