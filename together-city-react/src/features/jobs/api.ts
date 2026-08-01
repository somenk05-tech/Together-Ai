import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Skill { key: string; label: string }
export interface JobProfile {
  saved: boolean; headline: string; skills: Skill[]; experienceYears: number;
  seniority: string; location: string | null; resumeName: string | null;
}
export interface JobMatch {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: string; salaryLpa: number; blurb: string; minYears: number;
  score: number; matchedSkills: Skill[]; missingSkills: Skill[]; reasons: string[];
  applied: boolean; postedByYou?: boolean; fitLabel?: 'strong' | 'good' | 'fair' | 'weak';
}
export interface MatchesResponse { hasProfile: boolean; matches: JobMatch[] }
export interface Application { id: string; jobId: string; title: string; company: string; status: string; coverNote: string | null; appliedOn: string }
export interface Posting { id: string; title: string; company: string; location: string; remote: boolean; salaryLpa: number; minYears: number; seniority: string; blurb: string; skills: Skill[]; applicantCount: number; postedOn: string }
export interface PostJobInput { title: string; company: string; location: string; remote: boolean; skills: string[]; minYears: number; salaryLpa: number; blurb?: string; seniority?: 'junior' | 'mid' | 'senior' | 'lead' }
export interface Applicant { id: string; name: string; handle: string; headline: string; experienceYears: number; matchedSkills: string[]; coverNote: string | null; status: string; appliedOn: string }
export interface ApplicantsResponse { job: { id: string; title: string; company: string }; applicants: Applicant[] }

export const jobsApi = {
  profile: () => api.get<JobProfile>('/jobs/profile').then((r) => r.data),
  uploadResume: (resumeText: string, fileName?: string) =>
    api.post<{ parsed: JobProfile; matchCount: number }>('/jobs/resume', { resumeText, fileName }).then((r) => r.data),
  saveProfile: (input: { headline: string; skills: string[]; experienceYears: number; location?: string }) =>
    api.put<JobProfile>('/jobs/profile', input).then((r) => r.data),
  matches: () => api.get<MatchesResponse>('/jobs/matches').then((r) => r.data),
  applications: () => api.get<Application[]>('/jobs/applications').then((r) => r.data),
  apply: (jobId: string, coverNote?: string) => api.post<Application[]>('/jobs/applications', { jobId, coverNote }).then((r) => r.data),
  postJob: (input: PostJobInput) =>
    api.post<Posting[]>('/jobs/postings', input).then((r) => r.data),
  editPosting: (id: string, input: PostJobInput) =>
    api.put<Posting[]>(`/jobs/postings/${id}`, input).then((r) => r.data),
  deletePosting: (id: string) =>
    api.delete<Posting[]>(`/jobs/postings/${id}`).then((r) => r.data),
  myPostings: () => api.get<Posting[]>('/jobs/postings').then((r) => r.data),
  applicants: (id: string) => api.get<ApplicantsResponse>(`/jobs/postings/${id}/applicants`).then((r) => r.data),
  withdraw: (id: string) => api.delete<Application[]>(`/jobs/applications/${id}`).then((r) => r.data),
  updateApplicationStatus: (id: string, status: string) =>
    api.patch<ApplicantsResponse>(`/jobs/applications/${id}/status`, { status }).then((r) => r.data),
};

export function useJobProfile() {
  return useQuery({ queryKey: ['jobs', 'profile'], queryFn: () => jobsApi.profile() });
}
export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { resumeText: string; fileName?: string }) => jobsApi.uploadResume(v.resumeText, v.fileName),
    onSuccess: (res) => { qc.setQueryData(['jobs', 'profile'], res.parsed); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); void qc.invalidateQueries({ queryKey: ['profile'] }); },
  });
}
export function useJobMatches() {
  return useQuery({ queryKey: ['jobs', 'matches'], queryFn: () => jobsApi.matches() });
}
export function useApplications() {
  return useQuery({ queryKey: ['jobs', 'applications'], queryFn: () => jobsApi.applications() });
}
export function useApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { jobId: string; coverNote?: string }) => jobsApi.apply(v.jobId, v.coverNote),
    onSuccess: (apps) => { qc.setQueryData(['jobs', 'applications'], apps); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}
export function usePostJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.postJob,
    onSuccess: (list) => { qc.setQueryData(['jobs', 'postings'], list); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}
export function useEditPosting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: PostJobInput }) => jobsApi.editPosting(v.id, v.input),
    onSuccess: (list) => { qc.setQueryData(['jobs', 'postings'], list); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}
export function useDeletePosting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.deletePosting(id),
    onSuccess: (list) => { qc.setQueryData(['jobs', 'postings'], list); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}
export function useMyPostings() {
  return useQuery({ queryKey: ['jobs', 'postings'], queryFn: () => jobsApi.myPostings() });
}
export function useApplicants(id: string, enabled: boolean) {
  return useQuery({ queryKey: ['jobs', 'applicants', id], queryFn: () => jobsApi.applicants(id), enabled });
}
export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.withdraw(id),
    onSuccess: (apps) => { qc.setQueryData(['jobs', 'applications'], apps); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}
export function useUpdateApplicationStatus(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: 'shortlisted' | 'rejected' | 'applied' }) => jobsApi.updateApplicationStatus(v.id, v.status),
    onSuccess: (res) => { qc.setQueryData(['jobs', 'applicants', jobId], res); },
  });
}

// SAMPLE_RESUME lived here: a fabricated CV for "Priya Sharma", offered behind
// a "Use a sample" button that wrote it into the citizen's OWN jobs profile.
// Clicking it made their profile hers — seven years in Bengaluru, a fintech
// design system — and "Jobs for you" then ranked real vacancies against a person
// who does not exist. Removed under §3: no screen invents data, and the spec's
// BE-3.3 names this shape exactly ("fixture data imported by app code").

