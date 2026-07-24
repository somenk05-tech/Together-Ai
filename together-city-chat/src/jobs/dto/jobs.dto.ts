import { z } from 'zod';

export const UploadResumeSchema = z.object({
  resumeText: z.string().min(1).max(20_000),
  fileName: z.string().max(200).optional(),
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
});
export type PostJobDto = z.infer<typeof PostJobSchema>;
