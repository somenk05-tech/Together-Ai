import { z } from 'zod';
import axios from 'axios';
import { apiPost } from './http';

/** Presigned-upload flow (S3-style) — matches POST /media/upload. */
export const PresignInput = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().positive(),
});
export type PresignInput = z.infer<typeof PresignInput>;

export const PresignResult = z.object({
  uploadUrl: z.string(),
  fileUrl: z.string(),
  fields: z.record(z.string()).optional(),
});
export type PresignResult = z.infer<typeof PresignResult>;

export const mediaApi = {
  presign: (input: PresignInput): Promise<PresignResult> =>
    apiPost('/media/upload', PresignInput.parse(input), PresignResult),
  /** Uploads the file bytes to the presigned URL (outside the API host). */
  async upload(file: File): Promise<string> {
    const { uploadUrl, fileUrl } = await this.presign({ filename: file.name, contentType: file.type, size: file.size });
    // Direct-to-storage PUT (no auth header, not the API host) — via axios, never fetch().
    await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
    return fileUrl;
  },
};
