import { z } from 'zod';
import axios from 'axios';
import { apiPost } from './http';
import { scrubImage, UnreadableImageError } from '@/lib/scrub-image';

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
  if (err instanceof UnreadableImageError) return err.message;
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

/**
 * Every upload in the app comes through here, which is the reason the location
 * strip lives here and not in the screens. A photo taken on a phone carries the
 * coordinates it was taken at; the bytes go straight from the browser to R2, so
 * this is the last moment anyone can do anything about that. Putting it in one
 * place means a screen added next year cannot forget — see lib/scrub-image.ts.
 *
 * The scrub happens BEFORE the presign, not after: stripping changes the size,
 * and re-encoding can change the type, and the pre-signed URL is issued against
 * both.
 */
export const mediaApi = {
  presign: (file: File): Promise<PresignResult> =>
    apiPost('/media/upload', { mimeType: file.type, sizeBytes: file.size }, PresignResult),

  /** Upload the bytes directly to R2 and return the public URL. */
  async upload(file: File): Promise<string> {
    const { file: safe } = await scrubImage(file, 'public');
    const { uploadUrl, publicUrl } = await this.presign(safe);
    await axios.put(uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return publicUrl;
  },

  /** Upload and return full metadata (url + key + size) for a public document. */
  async uploadDoc(file: File): Promise<UploadedFile> {
    const { file: safe } = await scrubImage(file, 'public');
    const { uploadUrl, publicUrl, key } = await this.presign(safe);
    await axios.put(uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return { fileUrl: publicUrl, fileKey: key, mimeType: safe.type, sizeBytes: safe.size };
  },

  /**
   * Upload a DATING photo to the private bucket — returns the key only. (M3.)
   *
   * It lives here rather than in the dating page for the reason this whole file
   * exists: the presigned PUT goes browser→bucket, so this is the last moment
   * anything can be taken out of the bytes, and a dating photo is the single
   * worst file in the app to publish with the coordinates it was taken at.
   *
   * The dating page resizes to a canvas first, which already drops EXIF as a
   * side effect of re-encoding — but "a side effect of how it happens to be
   * written today" is not a privacy control. Scrubbing here is.
   */
  async uploadDating(file: File): Promise<string> {
    const { file: safe } = await scrubImage(file, 'private');
    const res = await apiPost('/dating/photos/presign', { mimeType: safe.type, sizeBytes: safe.size },
      z.object({ uploadUrl: z.string(), key: z.string(), expiresInSec: z.number().optional() }));
    await axios.put(res.uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return res.key;
  },

  /** Upload to the PRIVATE health vault — returns the key only (no public URL).
   *  The file is viewable later solely via a short-lived signed link.
   *  A scan we cannot take apart still goes: nobody should be unable to file
   *  their own medical record because of a format we do not parse. */
  async uploadPrivate(file: File): Promise<{ fileKey: string; mimeType: string; sizeBytes: number }> {
    const { file: safe } = await scrubImage(file, 'private');
    const res = await apiPost('/media/upload-private', { mimeType: safe.type, sizeBytes: safe.size },
      z.object({ uploadUrl: z.string(), key: z.string(), expiresInSec: z.number().optional() }));
    await axios.put(res.uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return { fileKey: res.key, mimeType: safe.type, sizeBytes: safe.size };
  },

  /**
   * Upload a photograph somebody is keeping in their DAYBOOK — the private
   * vault, the `daybook/<userId>/` namespace, key only.
   *
   * It comes through this file rather than the daybook's own api module for the
   * reason at the top of it: the bytes go browser→bucket, so this is the last
   * moment anything can be taken out of them, and a picture of a Tuesday
   * afternoon at home carries the coordinates of the home. The scrub runs
   * before the presign, because stripping changes the size the URL is signed
   * against.
   */
  async uploadDaybook(file: File): Promise<{ fileKey: string; mimeType: string; sizeBytes: number }> {
    const { file: safe } = await scrubImage(file, 'private');
    const res = await apiPost('/daybook/photos/presign', { mimeType: safe.type, sizeBytes: safe.size },
      z.object({ uploadUrl: z.string(), key: z.string(), expiresInSec: z.number().optional() }));
    await axios.put(res.uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return { fileKey: res.key, mimeType: safe.type, sizeBytes: safe.size };
  },

  /**
   * Upload a photograph of somebody's ANIMAL — the private vault, the
   * `pets/<userId>/` namespace, key only.
   *
   * THE SCRUB HERE IS THE SECOND ONE AND IT STAYS. `features/pets/engine/photos`
   * has already run `scrubImage` and then squared the picture through a canvas,
   * which by itself leaves no Exif block to find — so on that path this call
   * finds nothing and costs a decode. It is here anyway, because the guarantee
   * this file exists to make is "nothing reaches storage unscrubbed", and a
   * guarantee that depends on every caller having done it first is a guarantee
   * held by whoever writes the next caller.
   */
  async uploadPet(file: File): Promise<{ fileKey: string; mimeType: string; sizeBytes: number }> {
    const { file: safe } = await scrubImage(file, 'private');
    const res = await apiPost('/pets/photos/presign', { mimeType: safe.type, sizeBytes: safe.size },
      z.object({ uploadUrl: z.string(), key: z.string(), expiresInSec: z.number().optional() }));
    await axios.put(res.uploadUrl, safe, { headers: { 'Content-Type': safe.type } });
    return { fileKey: res.key, mimeType: safe.type, sizeBytes: safe.size };
  },
};
