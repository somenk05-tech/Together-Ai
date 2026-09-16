import { randomInt } from 'crypto';
import { CITY_DOMAINS, MAIL_DOMAIN } from '../mail/mail.constants';

/**
 * ── MEDICAL MAIL — the address (owner, 16 Sep) ──────────────────────────────
 *
 * "A permanent digital address for a user's healthcare life." One per citizen,
 * on the city's own mail domain, so it rides the inbound webhook Together City
 * Mail already has. The owner's final shape:
 *
 *     medical.somen4821@togethercity.app   — medical.<handle><4 digits>
 *
 * The handle, so a doctor can read it back to the patient; four digits that
 * only the citizen knows, so `@somen` alone does not reach it. The number is
 * minted once and never changes; the handle half FOLLOWS a rename
 * (ensureMailbox refreshes the row, keeping the digits), and inbound mail is
 * resolved by the handle in the address and then checked against the stored
 * address, so a wrong number is refused. A handle may not begin with
 * `medical.` (auth/admin.ts), so an ordinary mailbox never shares a name
 * with a medical one.
 */
export const MEDICAL_LOCAL_PREFIX = 'medical.';
/** The handle grammar auth accepts (auth.service.ts), then the four digits. */
const LOCAL = /^([a-z0-9_.]{3,30})([0-9]{4})$/;

export const mintMedicalDigits = (): string => String(randomInt(1000, 10000));

export const mintMedicalAddress = (handle: string, digits: string = mintMedicalDigits()): string =>
  `${MEDICAL_LOCAL_PREFIX}${handle.trim().toLowerCase()}${digits}@${MAIL_DOMAIN}`;

/** The handle and the digits a medical address names, or null when it is
 *  not one (a handle, a project tag, an outside domain). */
export const medicalPartsOf = (raw: string): { handle: string; digits: string } | null => {
  const v = (raw || '').trim().toLowerCase();
  const [local, domain] = v.split('@');
  if (!local || !domain || !CITY_DOMAINS.includes(domain)) return null;
  if (!local.startsWith(MEDICAL_LOCAL_PREFIX)) return null;
  const m = LOCAL.exec(local.slice(MEDICAL_LOCAL_PREFIX.length).split('+')[0]);
  return m ? { handle: m[1], digits: m[2] } : null;
};

/** The digits on an address the city already holds. */
export const medicalDigitsOf = (address: string): string | null => medicalPartsOf(address)?.digits ?? null;

/**
 * The medical address an inbound To names, normalised to the current domain,
 * or null when the address is not a medical one. A legacy-domain spelling
 * resolves to the same mailbox.
 */
export const medicalRecipient = (raw: string): string | null => {
  const p = medicalPartsOf(raw);
  return p ? mintMedicalAddress(p.handle, p.digits) : null;
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
