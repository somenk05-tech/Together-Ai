import { z } from 'zod';

export const UploadResumeSchema = z.object({
  resumeText: z.string().min(1).max(20_000),
  fileName: z.string().max(200).optional(),
  /** The stored file — a VAULT KEY under `cv/<userId>/`, never a URL. Kept so
   *  the citizen can see, download and replace the document they gave us
   *  rather than only our extraction of it. Until 2 Sep this was `fileUrl`,
   *  a public-bucket address any string could fill; the service checks the
   *  prefix is the caller's own. */
  fileKey: z.string().regex(/^cv\/[^/]+\/[A-Za-z0-9._-]+$/).max(300).optional(),
  fileBytes: z.number().int().min(0).max(20_000_000).optional(),
});
export type UploadResumeDto = z.infer<typeof UploadResumeSchema>;

/** What a CV may be, and how big. PDF, Word and plain text are what the
 *  reader parses; 20 MB matches `fileBytes` above. */
export const ResumePresignSchema = z.object({
  mimeType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain']),
  sizeBytes: z.number().int().min(1).max(20_000_000),
});
export type ResumePresignDto = z.infer<typeof ResumePresignSchema>;

export const UpdateApplicationStatusSchema = z.object({
  status: z.enum(['applied', 'shortlisted', 'rejected']),
});
export type UpdateApplicationStatusDto = z.infer<typeof UpdateApplicationStatusSchema>;

export const SaveJobProfileSchema = z.object({
  headline: z.string().min(1).max(120),
  skills: z.array(z.string().max(40)).max(40),
  experienceYears: z.number().int().min(0).max(50),
  location: z.string().max(60).optional(),
  // Everything below is the profile a person would actually show somebody.
  // All optional: a citizen who only wants to be matched should not have to
  // write a biography first.
  fullName: z.string().max(90).optional(),
  summary: z.string().max(900).optional(),
  currentTitle: z.string().max(90).optional(),
  currentCompany: z.string().max(90).optional(),
  education: z.string().max(1200).optional(),
  openToRoles: z.array(z.string().max(90)).max(5).optional(),
  noticeDays: z.number().int().min(0).max(365).nullable().optional(),
  expectedLpa: z.number().int().min(0).max(1000).nullable().optional(),
  links: z.string().max(600).optional(),
  photoUrl: z.string().max(500).nullable().optional(),
});
export type SaveJobProfileDto = z.infer<typeof SaveJobProfileSchema>;

/**
 * ONE ENTRY OF THE PROFESSIONAL RECORD — a job, a degree, a project, an award.
 *
 * Only `kind` is required, and it is a free string rather than an enum: the
 * table is one table precisely so a filmography or a patent list can be a new
 * kind rather than a migration, and an enum here would put that decision back
 * in a deploy. Everything else is optional because a citizen adding "Sound
 * design, Dharavi Rocks, 2021" should not have to fill in a location and a
 * qualifier to save it.
 *
 * Dates are strings and stay strings — the service derives the sortable
 * integer. A `z.coerce.date()` here would be the exact mistake the column
 * comment forbids.
 */
export const CvEntrySchema = z.object({
  kind: z.string().min(1).max(30),
  title: z.string().max(160).optional(),
  organisation: z.string().max(160).optional(),
  qualifier: z.string().max(90).optional(),
  location: z.string().max(90).optional(),
  startText: z.string().max(40).optional(),
  endText: z.string().max(40).optional(),
  current: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  bullets: z.array(z.string().max(300)).max(20).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  url: z.string().max(500).optional(),
  hidden: z.boolean().optional(),
});
export type CvEntryDto = z.infer<typeof CvEntrySchema>;

/** Hidden, not deleted. "I do not want this on my profile" and "this never
 *  happened" are different statements and only one of them is destructive. */
export const SetEntryHiddenSchema = z.object({ hidden: z.boolean() });
export type SetEntryHiddenDto = z.infer<typeof SetEntryHiddenSchema>;

/** A whole section's running order, sent as the ids in their new order. One
 *  section at a time: dragging inside Experience must never renumber Education. */
export const ReorderEntriesSchema = z.object({
  kind: z.string().min(1).max(30),
  ids: z.array(z.string().min(1).max(60)).max(200),
});
export type ReorderEntriesDto = z.infer<typeof ReorderEntriesSchema>;

/**
 * EMPLOYMENT, AVAILABILITY AND MONEY.
 *
 * Every field is optional AND nullable, and the two mean different things.
 * Absent is "the citizen did not touch this control" and leaves the stored
 * value alone; null is "clear it" — a salary they no longer want on record, a
 * status they would rather not state. Collapsing them would make an edit to the
 * notice period silently republish a salary.
 */
export const CareerPreferencesSchema = z.object({
  employmentStatus: z.enum([
    '', 'employed', 'selfEmployed', 'freelancer', 'entrepreneur',
    'student', 'betweenRoles', 'firstJob', 'retired', 'other',
  ]).nullable().optional(),
  openToOffers: z.enum(['', 'actively', 'open', 'notLooking', 'unsure']).nullable().optional(),
  employmentTypes: z.array(z.enum(['fullTime', 'partTime', 'contract', 'freelance', 'consulting', 'internship'])).max(6).nullable().optional(),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onSite'])).max(3).nullable().optional(),
  relocate: z.enum(['', 'yes', 'no', 'maybe']).nullable().optional(),
  preferredPlaces: z.array(z.string().max(60)).max(10).nullable().optional(),
  // Whole currency units per year. Minor units are pointless at this scale and
  // a float is worse.
  currentFixed: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currentVariable: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  expectedMin: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().min(3).max(3).nullable().optional(),
  salaryPeriod: z.enum(['annual', 'monthly']).nullable().optional(),
  noticeDays: z.number().int().min(0).max(365).nullable().optional(),
});
export type CareerPreferencesDto = z.infer<typeof CareerPreferencesSchema>;

/**
 * WHO CAN SEE WHAT. All three are required, because this is the one screen
 * where a field left out of the payload must not be read as "leave it as it
 * was" — a citizen turning their profile on and expecting their salary to stay
 * private needs the salary answer to have been sent and stored, not inferred.
 */
export const VisibilitySchema = z.object({
  profileVisibility: z.enum(['private', 'recruiters', 'everyone']),
  contactVisibility: z.enum(['private', 'recruiters', 'everyone']),
  salaryVisibility: z.enum(['private', 'recruiters', 'everyone']),
});
export type VisibilityDto = z.infer<typeof VisibilitySchema>;

export const ApplySchema = z.object({
  jobId: z.string().min(1).max(60),
  coverNote: z.string().max(1000).optional(),
});
export type ApplyDto = z.infer<typeof ApplySchema>;

export const PostJobSchema = z.object({
  title: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  location: z.string().min(1).max(60),
  remote: z.boolean().default(false),
  skills: z.array(z.string().max(40)).min(1).max(20),
  minYears: z.number().int().min(0).max(30),
  salaryLpa: z.number().int().min(1).max(1000),
  blurb: z.string().max(1000).optional(),
  // M5: let the recruiter set the level explicitly instead of deriving it from
  // min-years (which silently contradicted the title).
  seniority: z.enum(['junior', 'mid', 'senior', 'lead']).optional(),
});
export type PostJobDto = z.infer<typeof PostJobSchema>;
