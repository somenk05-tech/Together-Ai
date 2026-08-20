import { z } from 'zod';

/**
 * WHAT AN OWNER SENDS, AND WHAT AN ADMIN SENDS BACK.
 *
 * Its own file rather than an addition to local-services.dto.ts: verification
 * is the one part of this hub whose inputs are regulated documents, and a
 * reviewer looking for the rules about them should find them in one place
 * rather than between a menu item and an offer.
 */

export const ENTITY_KIND_VALUES = ['individual', 'proprietor', 'registered', 'company'] as const;
export const DOC_KIND_VALUES = [
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
  docUrl: z.string().url().optional(),
});
export type SubmitVerificationDto = z.infer<typeof SubmitVerificationSchema>;

/**
 * The decision. A rejection MUST carry a reason — an owner who is refused and
 * told nothing has no path forward and files a support ticket instead, which
 * costs more than the sentence would have.
 */
export const DecideVerificationSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  reason: z.string().trim().max(400).optional(),
}).refine((v) => v.decision !== 'rejected' || (v.reason?.length ?? 0) >= 4, {
  message: 'Say why it was refused — the owner is shown this.',
  path: ['reason'],
});
export type DecideVerificationDto = z.infer<typeof DecideVerificationSchema>;
