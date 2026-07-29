import axios from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** The citizen's private drive — folders + files in the shared 10 GB vault. */
export interface DriveFolder { id: string; name: string; parentId: string | null; createdAt: string; updatedAt: string }
export interface DriveFile {
  id: string; name: string; mimeType: string | null; sizeBytes: number;
  folderId: string | null; attachedType: string | null; attachedId: string | null;
  createdAt: string; updatedAt: string;
}
export interface DriveListing {
  folderId: string | null;
  breadcrumb: Array<{ id: string; name: string }>;
  folders: DriveFolder[];
  files: DriveFile[];
}
export interface DriveUsage {
  quotaBytes: number; usedBytes: number; mailBytes: number; healthBytes: number;
  driveBytes: number; remainingBytes: number; usedPct: number;
}

export const driveApi = {
  list: (folderId?: string | null): Promise<DriveListing> =>
    api.get<DriveListing>('/drive', { params: folderId ? { folderId } : {} }).then((r) => r.data),
  usage: (): Promise<DriveUsage> => api.get<DriveUsage>('/drive/usage').then((r) => r.data),

  createFolder: (name: string, parentId?: string | null) =>
    api.post<DriveFolder>('/drive/folders', { name, ...(parentId ? { parentId } : {}) }).then((r) => r.data),
  updateFolder: (id: string, patch: { name?: string; parentId?: string | null }) =>
    api.patch<DriveFolder>(`/drive/folders/${id}`, patch).then((r) => r.data),
  deleteFolder: (id: string) =>
    api.delete<{ ok: boolean; deletedFiles: number }>(`/drive/folders/${id}`).then((r) => r.data),

  updateFile: (id: string, patch: { name?: string; folderId?: string | null }) =>
    api.patch<DriveFile>(`/drive/files/${id}`, patch).then((r) => r.data),
  deleteFile: (id: string) => api.delete<{ ok: boolean }>(`/drive/files/${id}`).then((r) => r.data),
  downloadUrl: (id: string) =>
    api.get<{ url: string; name: string; mimeType: string | null; sizeBytes: number }>(`/drive/files/${id}/url`).then((r) => r.data),

  /** Presign → PUT straight to private storage → confirm. */
  async upload(file: File, folderId?: string | null): Promise<DriveFile> {
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
    const { data: pre } = await api.post<{ uploadUrl: string; key: string }>('/drive/files/presign', {
      mimeType: file.type || 'application/octet-stream', ext, sizeBytes: file.size,
    });
    await axios.put(pre.uploadUrl, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    const { data } = await api.post<DriveFile>('/drive/files', {
      storageKey: pre.key, name: file.name, sizeBytes: file.size,
      mimeType: file.type || undefined, ...(folderId ? { folderId } : {}),
    });
    return data;
  },
};

const KEY = ['drive'] as const;

export function useDrive(folderId: string | null) {
  return useQuery({ queryKey: [...KEY, 'list', folderId ?? 'root'], queryFn: () => driveApi.list(folderId) });
}
export function useDriveUsage() {
  return useQuery({ queryKey: [...KEY, 'usage'], queryFn: () => driveApi.usage() });
}

/** Any change refreshes the current folder + the vault meter. */
function useDriveMutation<TArgs, TRes>(fn: (a: TArgs) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export const useCreateFolder = () => useDriveMutation((v: { name: string; parentId?: string | null }) => driveApi.createFolder(v.name, v.parentId));
export const useUpdateFolder = () => useDriveMutation((v: { id: string; name?: string; parentId?: string | null }) => driveApi.updateFolder(v.id, { name: v.name, parentId: v.parentId }));
export const useDeleteFolder = () => useDriveMutation((id: string) => driveApi.deleteFolder(id));
export const useUpdateFile = () => useDriveMutation((v: { id: string; name?: string; folderId?: string | null }) => driveApi.updateFile(v.id, { name: v.name, folderId: v.folderId }));
export const useDeleteFile = () => useDriveMutation((id: string) => driveApi.deleteFile(id));
export const useUploadFile = () => useDriveMutation((v: { file: File; folderId?: string | null }) => driveApi.upload(v.file, v.folderId));

/** Human file size. */
export function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** A rough icon for a file, from its mime type / extension. */
export function fileIcon(f: { mimeType: string | null; name: string }): string {
  const m = (f.mimeType ?? '').toLowerCase();
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (m.startsWith('image/')) return '🖼';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m.includes('pdf') || ext === 'pdf') return '📕';
  if (/(zip|rar|7z|tar|gz)/.test(m + ext)) return '🗜';
  if (/(sheet|excel|csv)/.test(m) || ['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
  if (/(word|document)/.test(m) || ['doc', 'docx'].includes(ext)) return '📄';
  if (/(presentation|powerpoint)/.test(m) || ['ppt', 'pptx'].includes(ext)) return '📽';
  if (m.startsWith('text/') || ['txt', 'md', 'json'].includes(ext)) return '📝';
  return '📎';
}
