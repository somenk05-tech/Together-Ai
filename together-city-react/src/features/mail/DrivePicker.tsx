import { useRef, useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { uploadErrorMessage } from '@/api/media.api';
import { useDrive, useUploadFile, fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';

/**
 * Pick files from the citizen's Drive to attach to a message — or put one there
 * without leaving the message you are writing.
 *
 * IT USED TO BE READ-ONLY, AND ITS EMPTY STATE SAID SO: "This folder is empty.
 * Upload files in Drive first." Which is a dialog, opened from Compose, telling
 * somebody to go somewhere else, do a thing, and come back — for the single
 * most common reason anyone opens an attachment picker. Every mail client in
 * the world attaches from the device here.
 *
 * Uploads land in the folder being browsed and are selected the moment they
 * arrive, so the next click is Attach. One at a time and in order, because the
 * Drive page does it that way and a half-finished batch should say which file
 * it stopped on.
 */
export function DrivePicker({ onClose, onPick, alreadyPicked }: {
  onClose: () => void;
  onPick: (files: DriveFile[]) => void;
  alreadyPicked: string[];
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, DriveFile>>({});
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useUploadFile();
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

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null);
    for (let i = 0; i < files.length; i++) {
      setBusyMsg(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${files[i].name}` : `Uploading ${files[i].name}…`);
      try {
        const saved = await upload.mutateAsync({ file: files[i], folderId });
        // Selected on arrival: somebody who just picked a file off their desk
        // has already chosen it, and making them click it again is a step that
        // exists only because the dialog was built to browse.
        setSelected((cur) => ({ ...cur, [saved.id]: saved }));
      } catch (e) {
        const server = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(server ?? uploadErrorMessage(e));
        break;   // say which file it stopped on rather than press on quietly
      }
    }
    setBusyMsg(null);
    if (fileInput.current) fileInput.current.value = '';   // same file twice must work
  };

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
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, color: 'var(--accent-ink)', fontWeight: 600 }}>{b.name}</button>
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
            <div style={{ textAlign: 'center', padding: '30px 16px' }}>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
                This folder is empty — add a file from this device and it will be
                attached and saved to your Drive.
              </p>
              <Button size="sm" variant="line" disabled={Boolean(busyMsg)}
                onClick={() => fileInput.current?.click()}>Choose a file</Button>
            </div>
          )}
          {(data?.folders ?? []).map((d) => (
            <button key={d.id} type="button" onClick={() => setFolderId(d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <span style={{ fontSize: 17 }}>📁</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{d.name}</span>
            </button>
          ))}
          {(data?.files ?? []).map((f) => {
            const on = Boolean(selected[f.id]);
            const dup = alreadyPicked.includes(f.id);
            return (
              <button key={f.id} type="button" onClick={() => !dup && toggle(f)} disabled={dup}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--line)', cursor: dup ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ink)', opacity: dup ? 0.5 : 1, background: on ? 'var(--accent-soft)' : 'none' }}>
                <span style={{ fontSize: 17 }}>{fileIcon(f)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{fmtBytes(f.sizeBytes)}{dup ? ' · already attached' : ''}</span>
                </span>
                {on && <span style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, padding: '10px 16px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderTop: '1px solid var(--danger-line)' }}>
            {error}
          </p>
        )}

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileInput} type="file" multiple hidden
            onChange={(e) => void onFiles(e.target.files)} />
          <Button size="sm" variant="line" disabled={Boolean(busyMsg)}
            onClick={() => fileInput.current?.click()}>
            {busyMsg ? 'Uploading…' : '↑ Upload from this device'}
          </Button>
          <span className="muted" style={{ fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {busyMsg ?? `${chosen.length} selected`}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button size="sm" variant="line" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="accent" disabled={!chosen.length || Boolean(busyMsg)}
              onClick={() => { onPick(chosen); onClose(); }}>Attach</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
