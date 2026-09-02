import { z } from 'zod';

/**
 * WHAT AN OWNER SENDS, AND WHAT AN ADMIN SENDS BACK.
 *
 * Its own file rather than an addition to local-services.dto.ts: verification
 * is the one part of this hub whose inputs are regulated documents, and a
 * reviewer looking for the rules about them should find them in one place
 * rather than between a menu item and an offer.
 */

const ENTITY_KIND_VALUES = ['individual', 'proprietor', 'registered', 'company'] as const;
const DOC_KIND_VALUES = [
  'gstin', 'udyam', 'shop_establishment', 'trade_licence', 'incorporation', 'fssai', 'professional', 'rera',
] as const;

/**
 * The claim, and the evidence for it.
 *
 * `docKind` and `docRef` are optional at this layer and required by the
 * service for everything except an individual — because "individual" is the
 * one answer for which no business document exists, and a schema that demanded
 * one would be teaching a freelance tutor to invent a GSTIN.
 */
export const SubmitVerificationSchema = z.object({
  entityKind: z.enum(ENTITY_KIND_VALUES),
  docKind: z.enum(DOC_KIND_VALUES).optional(),
  /** As printed on the certificate. Not validated against a checksum: a GSTIN
   *  has one and a trade licence number does not, and a per-document validator
   *  that is right about one format and wrong about seven refuses real
   *  businesses. A human reads it against the upload. */
  docRef: z.string().trim().min(4).max(40).optional(),
  /* `docUrl` is gone (2 Sep). No client ever sent one — the form takes a
     reference number, and a person reads it against the video — but the
     field accepted any public URL into the most sensitive column in the
     services schema. A document upload, when it exists, goes to the vault
     under `kyc/` like the video. */
});
export type SubmitVerificationDto = z.infer<typeof SubmitVerificationSchema>;

/** The owner's clip, already PUT into the vault under `kyc/<ownerId>/` via
 *  `verification/video/presign` — a key, never a URL (2 Sep). */
export const SubmitVideoSchema = z.object({ videoKey: z.string().regex(/^kyc\/[^/]+\/[A-Za-z0-9._-]+$/).max(300) });

/** What a verification clip may be. The three containers a phone records and
 *  a browser plays; 200 MB is generous for "under a minute is plenty". */
export const VideoPresignSchema = z.object({
  mimeType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  sizeBytes: z.number().int().min(1).max(200 * 1024 * 1024),
});
export type VideoPresignDto = z.infer<typeof VideoPresignSchema>;
export type SubmitVideoDto = z.infer<typeof SubmitVideoSchema>;
