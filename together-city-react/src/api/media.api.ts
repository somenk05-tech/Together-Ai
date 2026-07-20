import { z } from 'zod';
import axios from 'axios';
import { apiPost } from './http';

/** Presigned-upload flow (S3/R2) — matches POST /media/upload. */
export const PresignInput = z.object({
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
});
export type PresignInput = z.infer<typeof PresignInput>;

export const PresignResult = z.object({
  uploadUrl: z.string(),
  publicUrl: z.string(),
  key: z.string(),
  expiresInSec: z.number().optional(),
});
export type PresignResult = z.infer<typeof PresignResult>;

/** Metadata returned after a direct-to-storage upload (for health-doc records). */
export interface UploadedFile {
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Turn an upload failure into a message that says WHICH step broke, so a stuck
 * upload is self-diagnosing:
 *  - the browser's direct PUT to R2 blocked (no HTTP response / network / CORS)
 *    → the bucket needs a CORS rule allowing PUT from this site;
 *  - our presign API returned an error status → backend / auth;
 *  - otherwise a generic connection hint.
 */
export function uploadErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number }; message?: string; config?: { url?: string } };
  const url = e?.config?.url ?? '';
  const status = e?.response?.status;
  const toStorage = /r2\.cloudflarestorage|amazonaws|__presigned__/i.test(url);
  if (toStorage && !status) {
    return 'The file reached the upload step but your storage bucket rejected it — this is the bucket’s CORS setting blocking uploads from this site. Add the CORS rule to the R2 bucket, then try again.';
  }
  if (status === 401 || status === 403) return 'Your session may have expired — please sign in again and retry.';
  if (status && status >= 500) return `The server had a problem (${status}). Please try again in a moment.`;
  if (status) return `Upload failed (${status}). Please try again.`;
  return 'Could not reach the server — check your connection and try again.';
}

export const mediaApi = {
  presign: (file: File): Promise<PresignResult> =>
    apiPost('/media/upload', { mimeType: file.type, sizeBytes: file.size }, PresignResult),

  /** Upload the bytes directly to R2 and return the public URL. */
  async upload(file: File): Promise<string> {
    const { uploadUrl, publicUrl } = await this.presign(file);
    await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
    return publicUrl;
  },

  /** Upload and return full metadata (url + key + size) for a public document. */
  async uploadDoc(file: File): Promise<UploadedFile> {
    const { uploadUrl, publicUrl, key } = await this.presign(file);
    await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
    return { fileUrl: publicUrl, fileKey: key, mimeType: file.type, sizeBytes: file.size };
  },

  /** Upload to the PRIVATE health vault — returns the key only (no public URL).
   *  The file is viewable later solely via a short-lived signed link. */
  async uploadPrivate(file: File): Promise<{ fileKey: string; mimeType: string; sizeBytes: number }> {
    const res = await apiPost('/media/upload-private', { mimeType: file.type, sizeBytes: file.size },
      z.object({ uploadUrl: z.string(), key: z.string(), expiresInSec: z.number().optional() }));
    await axios.put(res.uploadUrl, file, { headers: { 'Content-Type': file.type } });
    return { fileKey: res.key, mimeType: file.type, sizeBytes: file.size };
  },
};
