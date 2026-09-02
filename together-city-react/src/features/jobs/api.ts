import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Skill { key: string; label: string }

/**
 * THE KINDS THIS APP KNOWS HOW TO SET, in the order a CV is conventionally
 * read. Mirrors KNOWN_KINDS in the API's cv-entries.ts.
 *
 * `kind` is an OPEN string on both sides of the wire, and that is the point:
 * the entries table is one table precisely so a filmography or a patent list
 * can be a new kind rather than a migration. A union here would put that
 * decision back in a deploy, so the union is only what this client can put a
 * heading on — anything else still renders, under its own name.
 */
export const CV_KINDS = [
  'experience', 'education', 'project', 'certification', 'award', 'language', 'link',
] as const;
export type KnownCvKind = typeof CV_KINDS[number];
/** `Record<never, never>` rather than `{}`: it widens to any string while
 *  keeping the seven names in an editor's autocomplete, and it is the one
 *  spelling of that trick eslint's ban-types rule does not read as "any". */
export type CvKind = KnownCvKind | (string & Record<never, never>);

/**
 * ONE ENTRY OF THE PROFESSIONAL RECORD — a job, a degree, a project, an award.
 *
 * `confidence` and `evidence` are provenance, not decoration. A row the reader
 * was unsure about is a QUESTION until the citizen answers it, and
 * `needsConfirming` is the server saying so rather than every screen having to
 * know that 'high' is the only value that means "this is a claim they are
 * making".
 */
export interface CvEntry {
  id: string; kind: CvKind; order: number; hidden: boolean;
  title: string; organisation: string; qualifier: string; location: string;
  startText: string; endText: string; startSort: number; current: boolean;
  description: string; bullets: string[]; tags: string[]; url: string;
  confidence: string; source: string; evidence: string;
  needsConfirming: boolean;
}

/** What an editor sends back. Only `kind` is required — somebody adding
 *  "Sound design, Dharavi Rocks, 2021" should not have to fill in a location. */
export interface CvEntryInput {
  kind: CvKind; title?: string; organisation?: string; qualifier?: string; location?: string;
  startText?: string; endText?: string; current?: boolean; description?: string;
  bullets?: string[]; tags?: string[]; url?: string; hidden?: boolean;
}

export type Visibility = 'private' | 'recruiters' | 'everyone';
export type EmploymentStatus = '' | 'employed' | 'selfEmployed' | 'freelancer' | 'entrepreneur'
  | 'student' | 'betweenRoles' | 'firstJob' | 'retired' | 'other';
export type OpenToOffers = '' | 'actively' | 'open' | 'notLooking' | 'unsure';
export type EmploymentType = 'fullTime' | 'partTime' | 'contract' | 'freelance' | 'consulting' | 'internship';
export type WorkMode = 'remote' | 'hybrid' | 'onSite';
export type Relocate = '' | 'yes' | 'no' | 'maybe';

/**
 * The profile WITHOUT its entries.
 *
 * Two shapes rather than one because the API really does return two: POST
 * /jobs/resume answers with a freshly parsed summary and no record attached,
 * and typing that as the whole profile is how a screen comes to read
 * `profile.entries` off an object that has none.
 */
export interface JobProfileCore {
  saved: boolean; headline: string; skills: Skill[]; experienceYears: number;
  seniority: string; location: string | null;
  /** The document, not only what was read out of it. */
  resumeName: string | null; resumeUrl: string | null; resumeBytes: number; resumeAt: string | null;
  photoUrl: string | null;
  /** The person. Kept apart from the headline, which is the job title. */
  fullName: string;
  summary: string; currentTitle: string; currentCompany: string;
  education: string; openToRoles: string[];
  noticeDays: number | null; expectedLpa: number | null; links: string;
  // Employment, availability and money. Every one of these is a thing a CV
  // cannot answer, which is why they are asked rather than read.
  employmentStatus: EmploymentStatus; openToOffers: OpenToOffers;
  employmentTypes: EmploymentType[]; workModes: WorkMode[];
  relocate: Relocate; preferredPlaces: string[];
  currentFixed: number | null; currentVariable: number | null; expectedMin: number | null;
  currency: string; salaryPeriod: string;
  profileVisibility: Visibility; contactVisibility: Visibility; salaryVisibility: Visibility;
}

/** GET /jobs/profile — the profile with its record, grouped by kind and with
 *  the running order of the sections already reconciled against what exists. */
export interface JobProfile extends JobProfileCore {
  entries: Record<string, CvEntry[]>;
  sectionOrder: string[];
}


/** PUT /jobs/preferences. Absent leaves a column alone; `null` clears it, and
 *  the difference matters — an edit to the notice period must not silently
 *  republish a salary somebody removed last week. */
export interface CareerPreferencesInput {
  employmentStatus?: EmploymentStatus | null;
  openToOffers?: OpenToOffers | null;
  employmentTypes?: EmploymentType[] | null;
  workModes?: WorkMode[] | null;
  relocate?: Relocate | null;
  preferredPlaces?: string[] | null;
  currentFixed?: number | null;
  currentVariable?: number | null;
  expectedMin?: number | null;
  currency?: string | null;
  salaryPeriod?: 'annual' | 'monthly' | null;
  noticeDays?: number | null;
}

/** PUT /jobs/visibility. All three are required: a citizen turning their
 *  profile on and expecting their salary to stay private needs that answer to
 *  have been sent, not inferred from its absence. */
export interface VisibilityInput {
  profileVisibility: Visibility;
  contactVisibility: Visibility;
  salaryVisibility: Visibility;
}

export interface CompletionSection {
  key: string; label: string; done: number; total: number; percent: number; missing: string[];
}
export interface ProfileCompletion {
  overall: number; sections: CompletionSection[]; needsConfirming: number;
}

/** What a fold of a read CV into the existing record amounted to. */
export interface ResumeEntryCounts { added: number; updated: number; keptYours: number }
export interface UploadResumeResponse {
  parsed: JobProfileCore; matchCount: number; entries: ResumeEntryCounts;
}
export interface SaveJobProfileInput {
  headline: string; skills: string[]; experienceYears: number; location?: string;
  fullName?: string; summary?: string; currentTitle?: string; currentCompany?: string;
  education?: string; openToRoles?: string[];
  noticeDays?: number | null; expectedLpa?: number | null; links?: string; photoUrl?: string | null;
}
export interface JobMatch {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: string; salaryLpa: number; blurb: string; minYears: number;
  score: number; matchedSkills: Skill[]; missingSkills: Skill[]; reasons: string[];
  applied: boolean; postedByYou?: boolean; fitLabel?: 'strong' | 'good' | 'fair' | 'weak';
  /** Set when the role was found on the company's own public ATS board:
   *  the citizen applies THERE, and the card says which board it came from. */
  externalUrl?: string | null; source?: string | null;
}
export interface MatchesResponse { hasProfile: boolean; matches: JobMatch[] }
export interface Application { id: string; jobId: string; title: string; company: string; status: string; coverNote: string | null; appliedOn: string }
export interface Posting { id: string; title: string; company: string; location: string; remote: boolean; salaryLpa: number; minYears: number; seniority: string; blurb: string; skills: Skill[]; applicantCount: number; postedOn: string }
export interface PostJobInput { title: string; company: string; location: string; remote: boolean; skills: string[]; minYears: number; salaryLpa: number; blurb?: string; seniority?: 'junior' | 'mid' | 'senior' | 'lead' }
export interface Applicant { id: string; name: string; handle: string; headline: string; experienceYears: number; matchedSkills: string[]; coverNote: string | null; status: string; appliedOn: string }
export interface ApplicantsResponse { job: { id: string; title: string; company: string }; applicants: Applicant[] }

export const jobsApi = {
  profile: () => api.get<JobProfile>('/jobs/profile').then((r) => r.data),
  uploadResume: (input: { resumeText: string; fileName?: string; fileKey?: string; fileBytes?: number }) =>
    api.post<UploadResumeResponse>('/jobs/resume', input).then((r) => r.data),
  /** The stored CV, as a signed download link that lasts minutes. The only
   *  way the document comes back — `resumeUrl` on the profile is a vault
   *  key, not an address (2 Sep). */
  resumeLink: () => api.get<{ url: string | null; fileName: string | null }>('/jobs/resume/link').then((r) => r.data),
  deleteResume: () => api.delete<JobProfile>('/jobs/resume').then((r) => r.data),
  // ── the professional record ──
  addEntry: (input: CvEntryInput) => api.post<JobProfile>('/jobs/entries', input).then((r) => r.data),
  editEntry: (id: string, input: CvEntryInput) => api.put<JobProfile>(`/jobs/entries/${id}`, input).then((r) => r.data),
  setEntryHidden: (id: string, hidden: boolean) =>
    api.patch<JobProfile>(`/jobs/entries/${id}/hidden`, { hidden }).then((r) => r.data),
  deleteEntry: (id: string) => api.delete<JobProfile>(`/jobs/entries/${id}`).then((r) => r.data),
  reorderEntries: (kind: CvKind, ids: string[]) =>
    api.post<JobProfile>('/jobs/entries/reorder', { kind, ids }).then((r) => r.data),
  savePreferences: (input: CareerPreferencesInput) =>
    api.put<JobProfile>('/jobs/preferences', input).then((r) => r.data),
  saveVisibility: (input: VisibilityInput) =>
    api.put<JobProfile>('/jobs/visibility', input).then((r) => r.data),
  completion: () => api.get<ProfileCompletion>('/jobs/completion').then((r) => r.data),
  saveProfile: (input: SaveJobProfileInput) =>
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
/**
 * REFETCH THE PROFILE, DO NOT WRITE THE PARSE INTO IT.
 *
 * This used to `setQueryData(['jobs','profile'], res.parsed)`. The upload's
 * answer is a summary of what was just READ — it carries no `entries` and no
 * `sectionOrder`, because the fold into the record happens after it is built.
 * Writing it into the profile cache handed every screen an object whose record
 * was `undefined` rather than empty, which is the exact difference between
 * "you have nothing" and "we do not know yet".
 */
export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { resumeText: string; fileName?: string; fileKey?: string; fileBytes?: number }) => jobsApi.uploadResume(v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs', 'profile'] });
      void qc.invalidateQueries({ queryKey: ['jobs', 'entries'] });
      void qc.invalidateQueries({ queryKey: ['jobs', 'completion'] });
      void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
/** The typed profile — everything the reader proposed, after the citizen has
 *  seen it. Nothing here is published unread. */
export function useSaveJobProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SaveJobProfileInput) => jobsApi.saveProfile(v),
    onSuccess: (p) => {
      qc.setQueryData(['jobs', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['jobs', 'completion'] });
      void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/** Removes the CV — the file, the text and the name. The typed profile stays. */
export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => jobsApi.deleteResume(),
    onSuccess: (p) => { qc.setQueryData(['jobs', 'profile'], p); void qc.invalidateQueries({ queryKey: ['jobs', 'matches'] }); },
  });
}

// ─────────────────── the professional record ───────────────────
/**
 * ONE INVALIDATION RULE FOR THE WHOLE RECORD.
 *
 * Every write below answers with the FULL profile — grouped entries, section
 * order and all — so the profile cache is set rather than refetched, and the
 * two things that are derived from it downstream are dropped: the flat list
 * a reorder screen reads, and the completion score, which counts entries and
 * would otherwise keep saying "add at least one role" after somebody added one.
 *
 * Matches are deliberately NOT invalidated. Matching reads the headline, the
 * skills and the years; adding a project does not change any of them, and
 * refetching a scored list on every keystroke of an editor is a request nobody
 * asked for.
 */
function useRecordMutation<TArgs>(fn: (v: TArgs) => Promise<JobProfile>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (p) => {
      qc.setQueryData(['jobs', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['jobs', 'entries'] });
      void qc.invalidateQueries({ queryKey: ['jobs', 'completion'] });
    },
  });
}

export function useAddCvEntry() {
  return useRecordMutation((v: CvEntryInput) => jobsApi.addEntry(v));
}
export function useEditCvEntry() {
  return useRecordMutation((v: { id: string; input: CvEntryInput }) => jobsApi.editEntry(v.id, v.input));
}
/** Hidden, not deleted. "I do not want this on my profile" and "this never
 *  happened" are different statements and only one of them is destructive. */
export function useSetCvEntryHidden() {
  return useRecordMutation((v: { id: string; hidden: boolean }) => jobsApi.setEntryHidden(v.id, v.hidden));
}
export function useDeleteCvEntry() {
  return useRecordMutation((id: string) => jobsApi.deleteEntry(id));
}
/** One section's running order. One section at a time, because dragging inside
 *  Experience must never renumber Education. */
export function useReorderCvEntries() {
  return useRecordMutation((v: { kind: CvKind; ids: string[] }) => jobsApi.reorderEntries(v.kind, v.ids));
}
export function useSaveCareerPreferences() {
  return useRecordMutation((v: CareerPreferencesInput) => jobsApi.savePreferences(v));
}
/** Who can see the profile, the contact details and the money. Three separate
 *  answers because they are three separate risks. */
export function useSaveVisibility() {
  return useRecordMutation((v: VisibilityInput) => jobsApi.saveVisibility(v));
}

/** How finished the profile is, section by section. One number would tell
 *  nobody what to do next; these name what is missing. */
export function useProfileCompletion() {
  return useQuery({ queryKey: ['jobs', 'completion'], queryFn: () => jobsApi.completion() });
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

