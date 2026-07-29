/**
 * Turning a photographed prescription into structured medicine lines.
 *
 * Behind an interface on purpose. Whatever reads the handwriting — a vision
 * model, a specialist OCR service, a human review queue — the rest of the hub
 * only needs "here are the lines, and here is how sure I am about each field".
 *
 * The confidence map is the load-bearing part. A prescription that cannot be
 * read is not an error to hide; it is a normal outcome that has to reach the
 * citizen as "please confirm these", because the one failure mode that actually
 * hurts is a dosage silently guessed wrong.
 */

export interface ExtractedItem {
  medicineName: string;
  dosage?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
  /** Local wall-clock times this line implies, "HH:MM". */
  timesLocal?: string[];
  /** field → 0..1. A field absent from this map counts as unknown, not as certain. */
  confidence: Record<string, number>;
}

export interface PrescriptionExtraction {
  items: ExtractedItem[];
  providerJobId?: string;
  /** The provider's untouched response, stored so a bad read can be audited. */
  raw?: unknown;
}

export interface ExtractInput {
  fileKey: string;
  mimeType?: string | null;
}

export abstract class PrescriptionExtractor {
  abstract extract(input: ExtractInput): Promise<PrescriptionExtraction>;
}

/** Any field at or above this is taken as read; anything below needs a human. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** Fields that must be present and confident before a line can become a schedule. */
export const REQUIRED_FIELDS = ['medicineName', 'dosage', 'frequency'] as const;

/**
 * The provider used when none is configured.
 *
 * It returns no items and claims no confidence, which sends every upload to
 * review_required — the citizen types what the paper says. That is the honest
 * behaviour for "no OCR is connected": inventing plausible medicine names would
 * be far worse than asking.
 */
export class ManualEntryExtractor extends PrescriptionExtractor {
  extract(): Promise<PrescriptionExtraction> {
    return Promise.resolve({ items: [], providerJobId: undefined, raw: { provider: 'manual-entry' } });
  }
}

/** Does this line have every required field, each confidently read? */
export function needsReview(item: ExtractedItem): boolean {
  for (const field of REQUIRED_FIELDS) {
    const value = (item as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === '') return true;
    if ((item.confidence?.[field] ?? 0) < CONFIDENCE_THRESHOLD) return true;
  }
  return false;
}
