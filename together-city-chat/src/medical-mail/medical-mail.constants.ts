import { randomBytes } from 'crypto';
import { CITY_DOMAINS, MAIL_DOMAIN } from '../mail/mail.constants';

/**
 * ── MEDICAL MAIL — the address (owner, 16 Sep) ──────────────────────────────
 *
 * "A permanent digital address for a user's healthcare life." One per citizen,
 * on the city's own mail domain, so it rides the inbound webhook Together City
 * Mail already has — but it is NOT the handle with a tag on it. `somen@` says
 * who you are; a doctor's office, a lab portal and an insurer's mail-merge all
 * get to keep this address on file for years, and a name-shaped address is
 * one that can be guessed, mistyped into somebody else's inbox, or scraped.
 * So the local part is `medical.` and twenty random hex characters: unique,
 * stable, opaque, and tied to exactly one account by a table lookup.
 */
export const MEDICAL_LOCAL_PREFIX = 'medical.';
export const MEDICAL_TOKEN_LENGTH = 20;

export const mintMedicalAddress = (): string =>
  `${MEDICAL_LOCAL_PREFIX}${randomBytes(MEDICAL_TOKEN_LENGTH / 2).toString('hex')}@${MAIL_DOMAIN}`;

/**
 * The medical address an inbound To names, normalised to the current domain,
 * or null when the address is not a medical one (a handle, a project tag, an
 * outside domain). A legacy-domain spelling resolves to the same mailbox.
 */
export const medicalRecipient = (raw: string): string | null => {
  const v = (raw || '').trim().toLowerCase();
  const [local, domain] = v.split('@');
  if (!local || !domain || !CITY_DOMAINS.includes(domain)) return null;
  if (!local.startsWith(MEDICAL_LOCAL_PREFIX)) return null;
  const token = local.slice(MEDICAL_LOCAL_PREFIX.length).split('+')[0];
  if (!/^[a-f0-9]{20}$/.test(token)) return null;
  return `${MEDICAL_LOCAL_PREFIX}${token}@${MAIL_DOMAIN}`;
};

/** Medical Mail's own ceilings — the same as Together City Mail's inbound. */
export const MAX_MEDICAL_ATTACHMENTS = 10;
export const MAX_MEDICAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_MEDICAL_BODY_CHARS = 50_000;

/** What a medical email is about. The page's chips carry the same keys. */
export const MEDICAL_CATEGORIES = [
  'doctor', 'hospital', 'laboratory', 'pharmacy', 'insurance', 'appointment', 'prescription',
  'diagnostic-report', 'blood-test', 'radiology', 'pathology', 'vaccination', 'medical-bill', 'other-medical',
] as const;
export type MedicalCategory = (typeof MEDICAL_CATEGORIES)[number];
export const isMedicalCategory = (v: unknown): v is MedicalCategory =>
  typeof v === 'string' && (MEDICAL_CATEGORIES as readonly string[]).includes(v);

export const CATEGORY_LABEL: Record<MedicalCategory, string> = {
  doctor: 'Doctor', hospital: 'Hospital', laboratory: 'Laboratory', pharmacy: 'Pharmacy', insurance: 'Insurance',
  appointment: 'Appointment', prescription: 'Prescription', 'diagnostic-report': 'Diagnostic report',
  'blood-test': 'Blood test', radiology: 'Radiology', pathology: 'Pathology', vaccination: 'Vaccination',
  'medical-bill': 'Medical bill', 'other-medical': 'Other medical',
};

/** The verdicts. `medical` and `likely-medical` file attachments; the rest wait. */
export const CLASSIFICATIONS = ['medical', 'likely-medical', 'unknown', 'personal', 'spam', 'blocked'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Attachment pipeline states, as the page prints them. */
export const ATTACHMENT_STATUS = ['processing', 'stored', 'analyzed', 'needs_review', 'duplicate', 'failed'] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUS)[number];

/**
 * A medical email's folder → the vault folder its document goes to when the
 * reader could not tell on its own. The reader (record-reader.ts) decides
 * first; this only breaks a tie the email's own words can settle.
 */
export const CATEGORY_TO_RECORD_KIND: Partial<Record<MedicalCategory, string>> = {
  'blood-test': 'blood-test', prescription: 'prescription', radiology: 'imaging', pathology: 'report',
  'diagnostic-report': 'report', vaccination: 'vaccination', hospital: 'hospital', 'medical-bill': 'hospital',
};
