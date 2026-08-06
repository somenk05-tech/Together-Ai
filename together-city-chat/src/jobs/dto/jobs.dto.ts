import { z } from 'zod';

export const UploadResumeSchema = z.object({
  resumeText: z.string().min(1).max(20_000),
  fileName: z.string().max(200).optional(),
  /** The stored file. Kept so the citizen can see, download and replace the
   *  document they gave us rather than only our extraction of it. */
  fileUrl: z.string().max(500).optional(),
  fileBytes: z.number().int().min(0).max(20_000_000).optional(),
});
export type UploadResumeDto = z.infer<typeof UploadResumeSchema>;

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
