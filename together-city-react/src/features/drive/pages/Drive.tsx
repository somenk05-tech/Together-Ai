import { useRef, useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { uploadErrorMessage } from '@/api/media.api';
import {
  useDrive, useDriveUsage, useCreateFolder, useDeleteFolder, useUpdateFolder,
  useDeleteFile, useUpdateFile, useUploadFile, driveApi, fmtBytes, fileIcon,
  type DriveFile, type DriveFolder,
} from '../api';

/** Vault meter — one 10 GB allowance shared by mail, health documents and drive. */
function UsageBar() {
  const q = useDriveUsage();
  const u = q.data;
  if (!u) return null;
  const seg = (label: string, bytes: number, color: string) => (
    bytes > 0 ? <span key={label} style={{ color }}>{label} {fmtBytes(bytes)}</span> : null
  );
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <strong style={{ fontSize: 13.5 }}>Your vault</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {fmtBytes(u.usedBytes)} of {fmtBytes(u.quotaBytes)} used · {fmtBytes(u.remainingBytes)} free
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${Math.min(100, (u.driveBytes / u.quotaBytes) * 100)}%`, background: 'var(--accent)' }} />
        <div style={{ width: `${Math.min(100, (u.healthBytes / u.quotaBytes) * 100)}%`, background: 'var(--info-ink)' }} />
        <div style={{ width: `${Math.min(100, (u.mailBytes / u.quotaBytes) * 100)}%`, background: 'var(--accent-ink)' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 7, fontSize: 11.5, flexWrap: 'wrap' }}>
        {seg('Drive', u.driveBytes, 'var(--accent)')}
        {seg('Health', u.healthBytes, 'var(--info-ink)')}
        {seg('Mail', u.mailBytes, 'var(--accent-ink)')}
        {u.usedBytes === 0 && <span className="muted">Nothing stored yet.</span>}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
  borderBottom: '1px solid var(--line)',
};

/** Social Life-adjacent utility: the citizen's private online drive. */
export function Drive() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const listing = useDrive(folderId);
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();
  const upload = useUploadFile();
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  const data = listing.data;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const arr = Array.from(files);
    for (let i = 0; i < arr.length; i++) {
      setBusyMsg(`Uploading ${i + 1} of ${arr.length}: ${arr[i].name}`);
      try {
        await upload.mutateAsync({ file: arr[i], folderId });
      } catch (e) {
        const server = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(server ?? uploadErrorMessage(e));
        break;
      }
    }
    setBusyMsg(null);
  };

  const newFolder = () => {
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    createFolder.mutate({ name: name.trim(), parentId: folderId });
  };

  const openFile = async (f: DriveFile) => {
    setError(null);
    try {
      const { url } = await driveApi.downloadUrl(f.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      setError("Couldn't open that file — please try again.");
    }
  };

  const renameFile = (f: DriveFile) => {
    const name = window.prompt('Rename file', f.name);
    if (!name?.trim() || name === f.name) return;
    updateFile.mutate({ id: f.id, name: name.trim() });
  };

  const renameFolder = (d: DriveFolder) => {
    const name = window.prompt('Rename folder', d.name);
    if (!name?.trim() || name === d.name) return;
    updateFolder.mutate({ id: d.id, name: name.trim() });
  };

  const removeFolder = (d: DriveFolder) => {
    if (!window.confirm(`Delete “${d.name}” and everything inside it? This can't be undone.`)) return;
    deleteFolder.mutate(d.id);
  };

  const removeFile = (f: DriveFile) => {
    if (!window.confirm(`Delete “${f.name}”? This can't be undone.`)) return;
    deleteFile.mutate(f.id);
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Your drive</h1>
      <p className="lede" style={{ marginBottom: 18 }}>
        Private cloud storage for your documents and media — only you can open these files.
      </p>

      <UsageBar />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Button size="sm" variant="accent" onClick={() => picker.current?.click()} disabled={Boolean(busyMsg)}>
          {busyMsg ? 'Uploading…' : '↑ Upload files'}
        </Button>
        <Button size="sm" variant="line" onClick={newFolder} disabled={createFolder.isPending}>+ New folder</Button>
        <input ref={picker} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        {busyMsg && <span className="muted" style={{ fontSize: 12.5 }}>{busyMsg}</span>}
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
        <button type="button" onClick={() => setFolderId(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: folderId ? 'var(--accent)' : 'var(--ink)', fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
          Drive
        </button>
        {(data?.breadcrumb ?? []).map((b, i, all) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="muted">/</span>
            <button type="button" onClick={() => setFolderId(b.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                color: i === all.length - 1 ? 'var(--ink)' : 'var(--accent)', fontWeight: 600 }}>
              {b.name}
            </button>
          </span>
        ))}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      {listing.isLoading && <Spinner label="Loading your drive…" />}
      {listing.isError && <p className="muted" style={{ fontSize: 13.5 }}>Couldn't load your drive. Reload to try again.</p>}

      {data && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {data.folders.length === 0 && data.files.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>🗂</div>
              <p style={{ fontSize: 15, margin: '0 0 4px' }}>This folder is empty</p>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>Upload a file or create a folder to get started.</p>
            </div>
          )}

          {data.folders.map((d) => (
            <div key={d.id} style={rowStyle}>
              <button type="button" onClick={() => setFolderId(d.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', fontFamily: 'inherit', padding: 0, color: 'var(--ink)' }}>
                <span style={{ fontSize: 20 }}>📁</span>
                <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              </button>
              <button type="button" onClick={() => renameFolder(d)} title="Rename"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>Rename</button>
              <button type="button" onClick={() => removeFolder(d)} title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-ink)', fontSize: 13 }}>Delete</button>
            </div>
          ))}

          {data.files.map((f) => (
            <div key={f.id} style={rowStyle}>
              <button type="button" onClick={() => void openFile(f)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', fontFamily: 'inherit', padding: 0, color: 'var(--ink)' }}>
                <span style={{ fontSize: 20 }}>{fileIcon(f)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {fmtBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => void openFile(f)} title="Download"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', fontSize: 13 }}>Download</button>
              <button type="button" onClick={() => renameFile(f)} title="Rename"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>Rename</button>
              <button type="button" onClick={() => removeFile(f)} title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-ink)', fontSize: 13 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
