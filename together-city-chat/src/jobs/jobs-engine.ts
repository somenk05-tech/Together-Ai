/**
 * Together City — Jobs Engine
 * ------------------------------------------------------------------
 * "Upload once. We do the rest." Parse a resume into a structured profile
 * (contact, skills, education, certifications, seniority, years), score it
 * against open roles with a transparent, explainable score, and produce CV
 * intelligence (ATS score, summary, suggested roles, missing skills, tips).
 *
 * Pure, dependency-free, deterministic — every output is unit-testable and the
 * backend imports these functions without any DB coupling.
 */

/** Skill vocabulary the parser recognises — tech AND non-tech, so a nurse, a
 *  teacher or an accountant parses to real skills, not zero. Each entry carries
 *  the broad industry it belongs to (used for industry-aware matching). */
export interface SkillDef { key: string; label: string; industry: Industry; aliases: string[] }
export type Industry =
  | 'software' | 'data' | 'design' | 'product' | 'marketing' | 'sales'
  | 'finance' | 'healthcare' | 'education' | 'legal' | 'hr' | 'operations'
  | 'support' | 'content' | 'general';

export const SKILL_DICTIONARY: SkillDef[] = [
  // ── software / data / infra ──
  { key: 'javascript', label: 'JavaScript', industry: 'software', aliases: ['javascript', 'js', 'es6'] },
  { key: 'typescript', label: 'TypeScript', industry: 'software', aliases: ['typescript', 'ts'] },
  { key: 'react', label: 'React', industry: 'software', aliases: ['react', 'reactjs', 'react.js'] },
  { key: 'node', label: 'Node.js', industry: 'software', aliases: ['node', 'nodejs', 'node.js'] },
  { key: 'nestjs', label: 'NestJS', industry: 'software', aliases: ['nestjs', 'nest.js'] },
  { key: 'python', label: 'Python', industry: 'software', aliases: ['python', 'django', 'flask', 'pandas'] },
  { key: 'java', label: 'Java', industry: 'software', aliases: ['java', 'spring', 'spring boot'] },
  { key: 'sql', label: 'SQL', industry: 'data', aliases: ['sql', 'postgres', 'postgresql', 'mysql', 'mssql'] },
  { key: 'nosql', label: 'NoSQL', industry: 'data', aliases: ['nosql', 'mongodb', 'mongo', 'redis', 'dynamodb'] },
  { key: 'aws', label: 'AWS', industry: 'software', aliases: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'] },
  { key: 'docker', label: 'Docker', industry: 'software', aliases: ['docker', 'containers'] },
  { key: 'kubernetes', label: 'Kubernetes', industry: 'software', aliases: ['kubernetes', 'k8s'] },
  { key: 'graphql', label: 'GraphQL', industry: 'software', aliases: ['graphql', 'apollo'] },
  { key: 'ml', label: 'Machine Learning', industry: 'data', aliases: ['machine learning', 'ml', 'deep learning', 'tensorflow', 'pytorch'] },
  { key: 'data', label: 'Data Analysis', industry: 'data', aliases: ['data analysis', 'analytics', 'tableau', 'power bi', 'looker'] },
  { key: 'devops', label: 'DevOps', industry: 'software', aliases: ['devops', 'ci/cd', 'terraform', 'jenkins'] },
  { key: 'mobile', label: 'Mobile', industry: 'software', aliases: ['ios', 'android', 'flutter', 'react native', 'swift', 'kotlin'] },
  // ── product / design ──
  { key: 'product', label: 'Product Management', industry: 'product', aliases: ['product management', 'product manager', 'roadmap', 'prd'] },
  { key: 'design', label: 'Product Design', industry: 'design', aliases: ['ux', 'ui', 'figma', 'product design', 'wireframe', 'sketch'] },
  // ── business ──
  { key: 'marketing', label: 'Marketing', industry: 'marketing', aliases: ['marketing', 'seo', 'sem', 'growth', 'campaign', 'content marketing'] },
  { key: 'sales', label: 'Sales', industry: 'sales', aliases: ['sales', 'business development', 'crm', 'salesforce', 'lead generation', 'account management'] },
  { key: 'excel', label: 'Excel', industry: 'general', aliases: ['excel', 'spreadsheets', 'vlookup', 'pivot table'] },
  { key: 'leadership', label: 'Leadership', industry: 'general', aliases: ['leadership', 'led a team', 'managed', 'mentored', 'team lead', 'people management'] },
  { key: 'communication', label: 'Communication', industry: 'general', aliases: ['communication', 'stakeholder', 'presentation', 'public speaking'] },
  { key: 'project', label: 'Project Management', industry: 'operations', aliases: ['project management', 'pmp', 'scrum', 'agile', 'jira', 'kanban'] },
  // ── finance ──
  { key: 'accounting', label: 'Accounting', industry: 'finance', aliases: ['accounting', 'accountant', 'tally', 'bookkeeping', 'gst', 'taxation', 'accounts payable', 'accounts receivable'] },
  { key: 'finance', label: 'Finance', industry: 'finance', aliases: ['finance', 'financial analysis', 'fp&a', 'cfa', 'valuation', 'budgeting', 'auditing', 'audit'] },
  // ── healthcare ──
  { key: 'nursing', label: 'Nursing', industry: 'healthcare', aliases: ['nursing', 'nurse', 'patient care', 'icu', 'bsc nursing', 'gnm'] },
  { key: 'clinical', label: 'Clinical Care', industry: 'healthcare', aliases: ['clinical', 'physician', 'doctor', 'mbbs', 'diagnosis', 'phlebotomy', 'pharmacy', 'pharmacist'] },
  // ── education ──
  { key: 'teaching', label: 'Teaching', industry: 'education', aliases: ['teaching', 'teacher', 'lecturer', 'tutor', 'curriculum', 'lesson planning', 'b.ed', 'faculty'] },
  // ── legal ──
  { key: 'legal', label: 'Legal', industry: 'legal', aliases: ['legal', 'lawyer', 'advocate', 'litigation', 'contract drafting', 'compliance', 'llb', 'paralegal'] },
  // ── hr / ops / support / content ──
  { key: 'hr', label: 'Human Resources', industry: 'hr', aliases: ['human resources', 'hr', 'recruitment', 'talent acquisition', 'payroll', 'onboarding', 'hrbp'] },
  { key: 'operations', label: 'Operations', industry: 'operations', aliases: ['operations', 'supply chain', 'logistics', 'inventory', 'procurement', 'warehouse'] },
  { key: 'support', label: 'Customer Support', industry: 'support', aliases: ['customer support', 'customer service', 'call center', 'help desk', 'technical support', 'customer success'] },
  { key: 'content', label: 'Content & Writing', industry: 'content', aliases: ['content writing', 'copywriting', 'content writer', 'editor', 'journalism', 'technical writing'] },
];

const SKILL_LABEL: Record<string, string> = Object.fromEntries(SKILL_DICTIONARY.map((s) => [s.key, s.label]));
const SKILL_INDUSTRY: Record<string, Industry> = Object.fromEntries(SKILL_DICTIONARY.map((s) => [s.key, s.industry]));
export const labelFor = (key: string): string => SKILL_LABEL[key] ?? key;

/** City synonyms → canonical display name (fixes "Bangalore" ≠ "Bengaluru"). */
const CITY_CANON: Record<string, string> = {
  bengaluru: 'Bengaluru', bangalore: 'Bengaluru', blr: 'Bengaluru',
  mumbai: 'Mumbai', bombay: 'Mumbai',
  delhi: 'Delhi', 'new delhi': 'Delhi', ncr: 'Delhi',
  gurgaon: 'Gurgaon', gurugram: 'Gurgaon',
  noida: 'Noida', hyderabad: 'Hyderabad', hyd: 'Hyderabad',
  pune: 'Pune', chennai: 'Chennai', madras: 'Chennai',
  kolkata: 'Kolkata', ahmedabad: 'Ahmedabad', jaipur: 'Jaipur',
  kochi: 'Kochi', remote: 'Remote',
};
/** Normalise any city string to its canonical form for equality checks. */
export function normCity(s: string | null | undefined): string | null {
  if (!s) return null;
  const key = s.trim().toLowerCase();
  return CITY_CANON[key] ?? (s.trim() ? s.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : null);
}

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead';
export type RemotePref = 'remote' | 'hybrid' | 'office' | 'any';

export interface ParsedResume {
  headline: string;
  skills: string[];          // skill keys
  experienceYears: number;
  seniority: Seniority;
  location: string | null;
  // Optional, richer fields (added; existing call-sites unaffected).
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  education?: string[];
  certifications?: string[];
  salaryExpectationLpa?: number | null;
  remotePref?: RemotePref;
}

const SEN_ORDER: Seniority[] = ['junior', 'mid', 'senior', 'lead'];

function detectSkills(lowerPadded: string): string[] {
  return SKILL_DICTIONARY
    .filter((s) => s.aliases.some((a) =>
      lowerPadded.includes(` ${a} `) || lowerPadded.includes(`${a},`) || lowerPadded.includes(`${a}.`) ||
      lowerPadded.includes(`${a}/`) || lowerPadded.includes(`(${a}`) || lowerPadded.includes(`${a};`)))
    .map((s) => s.key);
}

/** Best-effort years-of-experience: prefer an explicit "N years [of] experience",
 *  else the largest dated range (2019–2023), else the largest "N years" mention,
 *  ignoring obvious non-experience numbers. */
function detectYears(text: string, lower: string): number {
  const explicit = lower.match(/(\d{1,2})\s*\+?\s*years?(?:\s+of)?\s+(?:experience|exp|work)/);
  if (explicit) return Math.min(45, parseInt(explicit[1], 10));
  // dated ranges e.g. 2018 - 2023 / 2018–Present
  let rangeMax = 0;
  const thisYear = 2026;
  const ranges = text.matchAll(/(19|20)\d{2}\s*[–\-to]+\s*((19|20)\d{2}|present|current|now)/gi);
  for (const m of ranges) {
    const start = parseInt(m[0].slice(0, 4), 10);
    const endRaw = m[2].toLowerCase();
    const end = /present|current|now/.test(endRaw) ? thisYear : parseInt(endRaw.slice(0, 4), 10);
    if (end >= start && end - start <= 45) rangeMax = Math.max(rangeMax, end - start);
  }
  if (rangeMax) return rangeMax;
  const generic = lower.match(/(\d{1,2})\s*\+?\s*years?/);
  if (generic) return Math.min(45, parseInt(generic[1], 10));
  return 0;
}

function seniorityFor(lower: string, years: number): Seniority {
  if (/(principal|staff|\blead\b|head of|director|\bvp\b|chief|cto|ceo|founder)/.test(lower) || years >= 10) return 'lead';
  if (/(senior|sr\.?)/.test(lower) || years >= 6) return 'senior';
  if (years >= 2) return 'mid';
  return 'junior';
}

const DEGREE_RE = /\b(b\.?tech|b\.?e\.?|b\.?sc|b\.?a\.?|b\.?com|bba|bca|mbbs|ll\.?b|m\.?tech|m\.?sc|m\.?a\.?|mba|mca|ph\.?d|diploma|bachelor(?:'?s)?|master(?:'?s)?|doctorate)\b/gi;

function detectEducation(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(DEGREE_RE)) found.add(m[0].replace(/\s+/g, ' ').trim());
  return [...found].slice(0, 6);
}

const CERT_HINTS = ['aws certified', 'azure', 'gcp', 'pmp', 'cfa', 'cpa', 'scrum master', 'csm', 'six sigma', 'cissp', 'ccna', 'comptia', 'google analytics', 'hubspot', 'salesforce certified', 'prince2', 'itil'];
function detectCertifications(text: string, lower: string): string[] {
  const out = new Set<string>();
  for (const h of CERT_HINTS) if (lower.includes(h)) out.add(h.replace(/\b\w/g, (c) => c.toUpperCase()));
  // lines that literally say "certified …" / "certification"
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (/certificat(e|ion)|certified/i.test(l) && l.length < 90) out.add(l.replace(/^[\-•*\s]+/, ''));
  }
  return [...out].slice(0, 8);
}

function detectEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}
function detectPhone(text: string): string | null {
  const m = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g);
  if (!m) return null;
  const cand = m.map((s) => s.trim()).find((s) => s.replace(/\D/g, '').length >= 10);
  return cand ?? null;
}
function detectName(text: string, email: string | null): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // A name-like first line: 2–4 words, mostly letters, not an email/phone/header.
  for (const l of lines.slice(0, 4)) {
    if (email && l.toLowerCase().includes(email.toLowerCase())) continue;
    if (/@|\d{3}/.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z.'-]*$/.test(words[0]) && l.length <= 40) return l;
  }
  return null;
}

function detectRemotePref(lower: string): RemotePref | undefined {
  if (/(remote only|fully remote|work from home|wfh|open to remote|prefer(?:s|ring)? remote|seeking remote|remote(?:-| )(?:work|role|position|friendly|opportunit))/.test(lower)) return 'remote';
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/(on-?site only|in-office only|office only|willing to relocate|relocat)/.test(lower)) return 'office';
  return undefined;
}
function detectSalaryExpectation(lower: string): number | null {
  // "expected ctc 24 lpa" / "expected: ₹18 lakh" / "24 lpa"
  const m = lower.match(/(?:expected|ctc|expectation)[^0-9]{0,12}(\d{1,3})(?:\.\d+)?\s*(?:lpa|lakh|lac|l\b)/) ||
            lower.match(/(\d{1,3})(?:\.\d+)?\s*lpa/);
  if (m) { const v = parseInt(m[1], 10); if (v >= 1 && v <= 1000) return v; }
  return null;
}

/** Extract a structured profile from raw resume text. */
export function parseResume(text: string): ParsedResume {
  const lower = ` ${text.toLowerCase()} `;
  const skills = detectSkills(lower);
  const experienceYears = detectYears(text, lower);
  const seniority = seniorityFor(lower, experienceYears);
  const email = detectEmail(text);
  const phone = detectPhone(text);
  const name = detectName(text, email);

  // Match a city as a whole word so it's found on "…| Bengaluru" / "Pune," etc.
  const CITY_KEYS = Object.keys(CITY_CANON).sort((a, b) => b.length - a.length); // prefer "new delhi" over "delhi"
  const loc = CITY_KEYS.find((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  const location = loc ? normCity(loc) : null;

  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  const headline = (name && firstLine.toLowerCase() === name.toLowerCase())
    // if first line is the name, use the next meaningful line as a title
    ? (text.split('\n').map((l) => l.trim()).filter(Boolean)[1] ?? firstLine).slice(0, 80)
    : (firstLine.slice(0, 80) || `${seniority[0].toUpperCase()}${seniority.slice(1)} professional`);

  return {
    headline: headline || 'Professional',
    skills, experienceYears, seniority, location,
    name, email, phone,
    education: detectEducation(text),
    certifications: detectCertifications(text, lower),
    remotePref: detectRemotePref(lower),
    salaryExpectationLpa: detectSalaryExpectation(lower),
  };
}

// ─────────────────────────── CV intelligence ───────────────────────────
export interface CvAnalysis {
  atsScore: number;                 // 0..100
  summary: string;                  // professional summary
  suggestedRoles: string[];         // role titles the profile fits
  topMissingSkills: { key: string; label: string }[]; // in-demand skills the user lacks
  improvements: string[];           // resume improvement tips
  extracted: {
    name: string | null; email: string | null; phone: string | null;
    education: string[]; certifications: string[];
    skillCount: number; experienceYears: number;
  };
}

/** In-demand skills across the given roles, ranked by how many roles want them. */
function demandBySkill(jobs: JobLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const j of jobs) for (const s of j.skills) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

/** Produce CV intelligence: ATS score, summary, suggested roles, gaps, tips. */
export function analyzeResume(p: ParsedResume, jobs: JobLike[] = JOB_SEEDS): CvAnalysis {
  // ATS score — weighted, transparent.
  let ats = 0;
  const improvements: string[] = [];
  if (p.name) ats += 8; else improvements.push('Add your full name at the top of the CV.');
  if (p.email) ats += 12; else improvements.push('Add a professional email address — recruiters and ATS both need it.');
  if (p.phone) ats += 8; else improvements.push('Add a phone number so recruiters can reach you.');
  if (p.skills.length >= 8) ats += 25; else if (p.skills.length >= 4) ats += 16; else if (p.skills.length >= 1) ats += 8;
  if (p.skills.length < 6) improvements.push('List more concrete, recognised skills (tools, languages, methods) — aim for 8+.');
  if (p.experienceYears > 0) ats += 12; else improvements.push('State your years of experience explicitly (e.g. "4 years of experience").');
  if ((p.education?.length ?? 0) > 0) ats += 12; else improvements.push('Add an Education section with your degree(s).');
  if ((p.certifications?.length ?? 0) > 0) ats += 8;
  if (p.location) ats += 5; else improvements.push('Add your city (and whether you\'re open to remote).');
  // headline quality
  if (p.headline && p.headline.length > 6 && p.headline.toLowerCase() !== 'professional') ats += 10;
  else improvements.push('Add a clear headline/title (e.g. "Senior Backend Engineer").');
  ats = Math.max(0, Math.min(100, ats));
  if (p.experienceYears > 0 && !/\d/.test(p.headline)) improvements.push('Quantify achievements with numbers (%, ₹, users, time saved) — ATS and recruiters reward specifics.');

  // Summary
  const topSkills = p.skills.slice(0, 5).map(labelFor);
  const senLabel = p.seniority.charAt(0).toUpperCase() + p.seniority.slice(1);
  const yrsPart = p.experienceYears > 0 ? `${p.experienceYears}-year ` : '';
  const skillPart = topSkills.length ? ` with strengths in ${topSkills.join(', ')}` : '';
  const locPart = p.location ? ` Based in ${p.location}.` : '';
  const summary = `${senLabel}-level ${yrsPart}professional${skillPart}.${locPart}`.replace(/\s+/g, ' ').trim();

  // Suggested roles — the top-scoring role titles for this profile.
  const suggestedRoles = matchJobs(p, jobs).filter((m) => m.score >= 45).slice(0, 4).map((m) => m.title);

  // Top missing in-demand skills the candidate lacks.
  const have = new Set(p.skills);
  const demand = [...demandBySkill(jobs).entries()].filter(([k]) => !have.has(k)).sort((a, b) => b[1] - a[1]);
  const topMissingSkills = demand.slice(0, 5).map(([key]) => ({ key, label: labelFor(key) }));

  return {
    atsScore: ats, summary, suggestedRoles, topMissingSkills, improvements: improvements.slice(0, 6),
    extracted: {
      name: p.name ?? null, email: p.email ?? null, phone: p.phone ?? null,
      education: p.education ?? [], certifications: p.certifications ?? [],
      skillCount: p.skills.length, experienceYears: p.experienceYears,
    },
  };
}

// ─────────────────────────── job matching ───────────────────────────
export interface JobSeed {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: Seniority; skills: string[]; minYears: number; salaryLpa: number; blurb: string;
}

/** Seeded open roles across functions AND industries. Salaries in ₹ LPA (India). */
export const JOB_SEEDS: JobSeed[] = [
  { id: 'job_fe', title: 'Senior Frontend Engineer', company: 'Nimbus Labs', location: 'Bengaluru', remote: true, seniority: 'senior', skills: ['react', 'typescript', 'javascript', 'graphql'], minYears: 5, salaryLpa: 42, blurb: 'Own the design-system and core web app for a fast-growing SaaS.' },
  { id: 'job_be', title: 'Backend Engineer (Node)', company: 'Fintech Foundry', location: 'Remote', remote: true, seniority: 'mid', skills: ['node', 'nestjs', 'sql', 'aws'], minYears: 3, salaryLpa: 30, blurb: 'Build payment services at scale on a modern Node/Nest stack.' },
  { id: 'job_full', title: 'Full-Stack Engineer', company: 'Together City', location: 'Hyderabad', remote: true, seniority: 'mid', skills: ['react', 'node', 'typescript', 'sql'], minYears: 3, salaryLpa: 34, blurb: 'Ship end-to-end features across our super-app hubs.' },
  { id: 'job_data', title: 'Data Analyst', company: 'InsightIQ', location: 'Pune', remote: false, seniority: 'mid', skills: ['data', 'sql', 'python', 'excel'], minYears: 2, salaryLpa: 18, blurb: 'Turn product data into decisions with dashboards and deep-dives.' },
  { id: 'job_ml', title: 'ML Engineer', company: 'Vector AI', location: 'Bengaluru', remote: true, seniority: 'senior', skills: ['ml', 'python', 'aws', 'docker'], minYears: 5, salaryLpa: 48, blurb: 'Train and serve recommendation models in production.' },
  { id: 'job_pm', title: 'Product Manager', company: 'Orbit', location: 'Mumbai', remote: false, seniority: 'senior', skills: ['product', 'data', 'communication', 'leadership'], minYears: 5, salaryLpa: 40, blurb: 'Own a 0→1 product line end to end with a cross-functional pod.' },
  { id: 'job_design', title: 'Product Designer', company: 'Pixel & Co', location: 'Remote', remote: true, seniority: 'mid', skills: ['design', 'communication'], minYears: 3, salaryLpa: 26, blurb: 'Design flows for a consumer app used by millions.' },
  { id: 'job_devops', title: 'DevOps Engineer', company: 'CloudSpine', location: 'Gurgaon', remote: true, seniority: 'senior', skills: ['devops', 'kubernetes', 'aws', 'docker'], minYears: 5, salaryLpa: 38, blurb: 'Run resilient infra and CI/CD for a high-traffic platform.' },
  // ── non-tech roles so every job seeker gets real matches ──
  { id: 'job_nurse', title: 'Staff Nurse (ICU)', company: 'Apollo Care', location: 'Chennai', remote: false, seniority: 'mid', skills: ['nursing', 'clinical', 'communication'], minYears: 2, salaryLpa: 6, blurb: 'Deliver critical patient care in a 24/7 ICU team.' },
  { id: 'job_teacher', title: 'Secondary School Teacher', company: 'Vidya Public School', location: 'Delhi', remote: false, seniority: 'mid', skills: ['teaching', 'communication'], minYears: 2, salaryLpa: 7, blurb: 'Teach and mentor students; plan an engaging curriculum.' },
  { id: 'job_acct', title: 'Senior Accountant', company: 'Ledgerly', location: 'Mumbai', remote: true, seniority: 'senior', skills: ['accounting', 'finance', 'excel'], minYears: 5, salaryLpa: 12, blurb: 'Own month-end close, GST filings and financial reporting.' },
  { id: 'job_sales', title: 'Business Development Manager', company: 'GrowthWorks', location: 'Bengaluru', remote: true, seniority: 'senior', skills: ['sales', 'communication', 'leadership'], minYears: 5, salaryLpa: 20, blurb: 'Drive B2B revenue and lead a small sales pod.' },
  { id: 'job_hr', title: 'HR Business Partner', company: 'PeopleFirst', location: 'Gurgaon', remote: true, seniority: 'senior', skills: ['hr', 'communication', 'leadership'], minYears: 5, salaryLpa: 16, blurb: 'Partner with leaders on hiring, engagement and growth.' },
  { id: 'job_support', title: 'Customer Success Associate', company: 'HelpNest', location: 'Remote', remote: true, seniority: 'junior', skills: ['support', 'communication'], minYears: 0, salaryLpa: 5, blurb: 'Be the voice of the customer; resolve and delight.' },
  { id: 'job_content', title: 'Content Writer', company: 'Storyline', location: 'Remote', remote: true, seniority: 'mid', skills: ['content', 'marketing', 'communication'], minYears: 2, salaryLpa: 9, blurb: 'Craft clear, compelling content across formats.' },
  { id: 'job_ops', title: 'Operations Manager', company: 'MoveFast Logistics', location: 'Pune', remote: false, seniority: 'senior', skills: ['operations', 'leadership', 'excel'], minYears: 5, salaryLpa: 15, blurb: 'Run regional supply-chain and warehouse operations.' },
  { id: 'job_legal', title: 'Legal Associate', company: 'Justitia LLP', location: 'Delhi', remote: false, seniority: 'mid', skills: ['legal', 'communication'], minYears: 2, salaryLpa: 11, blurb: 'Draft contracts and support litigation and compliance.' },
];

/** Any postable/matchable role — seeds and company-posted rows share this shape. */
export interface JobLike {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: Seniority; skills: string[]; minYears: number; salaryLpa: number; blurb: string;
  postedByYou?: boolean;
}

export interface JobMatch extends JobLike {
  score: number;                 // 0..100
  matchedSkills: string[];       // keys the candidate has
  missingSkills: string[];       // keys the role wants that candidate lacks
  reasons: string[];
  fitLabel: 'strong' | 'good' | 'fair' | 'weak';
}

export interface MatchOpts {
  /** exclude the candidate's own postings from their matches */
  excludeOwn?: boolean;
}

function fitLabelFor(score: number): JobMatch['fitLabel'] {
  return score >= 75 ? 'strong' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'weak';
}

/**
 * Score roles against a parsed profile. Skills overlap dominates; seniority,
 * experience, salary fit, location and remote preference adjust — and a real
 * PENALTY applies for being under the experience bar or two levels off, so an
 * unqualified candidate isn't shown as a strong match.
 */
export function matchJobs(profile: ParsedResume, jobs: JobLike[] = JOB_SEEDS, opts: MatchOpts = {}): JobMatch[] {
  const have = new Set(profile.skills);
  const candIndustries = new Set(profile.skills.map((k) => SKILL_INDUSTRY[k]).filter(Boolean));
  const candCity = normCity(profile.location);

  const pool = opts.excludeOwn ? jobs.filter((j) => !j.postedByYou) : jobs;

  const out = pool.map((job) => {
    const matched = job.skills.filter((s) => have.has(s));
    const missing = job.skills.filter((s) => !have.has(s));
    const skillPct = job.skills.length ? matched.length / job.skills.length : 0;
    let score = skillPct * 70; // up to 70 from skills
    const reasons: string[] = [];
    if (matched.length) reasons.push(`${matched.length}/${job.skills.length} required skills: ${matched.map(labelFor).join(', ')}`);
    else reasons.push('None of the required skills detected on your CV');

    // Industry alignment — a small transferable-skills bonus if the domains overlap.
    const jobIndustries = new Set(job.skills.map((k) => SKILL_INDUSTRY[k]).filter(Boolean));
    const sharesIndustry = [...jobIndustries].some((i) => candIndustries.has(i));
    if (sharesIndustry && matched.length === 0) { score += 4; reasons.push('Related field (transferable experience)'); }

    // Seniority fit — reward a match, penalise a 2+ level gap.
    const gap = SEN_ORDER.indexOf(profile.seniority) - SEN_ORDER.indexOf(job.seniority);
    if (gap === 0) { score += 12; reasons.push('Seniority is a strong fit'); }
    else if (Math.abs(gap) === 1) { score += 5; reasons.push(gap > 0 ? 'Slightly above the level' : 'A small stretch up'); }
    else { score -= 8; reasons.push(gap > 0 ? 'You may be over-qualified for this level' : 'This is a big step up in seniority'); }

    // Experience — reward meeting the bar, PENALISE missing it (the key C3 fix).
    if (profile.experienceYears >= job.minYears) {
      score += 8; reasons.push(`${profile.experienceYears} yrs ≥ ${job.minYears} required`);
    } else {
      const shortBy = job.minYears - profile.experienceYears;
      score -= Math.min(30, shortBy * 7);
      reasons.push(`Wants ${job.minYears}+ yrs — you have ${profile.experienceYears} (short by ${shortBy})`);
    }

    // Salary fit — only when the candidate stated an expectation (C4).
    if (profile.salaryExpectationLpa && job.salaryLpa) {
      const ratio = job.salaryLpa / profile.salaryExpectationLpa;
      if (ratio >= 0.9) { score += 5; reasons.push(`Pays ₹${job.salaryLpa} LPA (meets your ₹${profile.salaryExpectationLpa} expectation)`); }
      else if (ratio >= 0.7) { reasons.push(`Pays ₹${job.salaryLpa} LPA (below your ₹${profile.salaryExpectationLpa} expectation)`); }
      else { score -= 6; reasons.push(`Pays ₹${job.salaryLpa} LPA — well below your ₹${profile.salaryExpectationLpa} expectation`); }
    }

    // Location / remote — respect a stated remote preference (H5).
    const pref = profile.remotePref ?? 'any';
    if (job.remote) {
      if (pref === 'remote' || pref === 'hybrid' || pref === 'any') { score += 5; reasons.push('Remote-friendly (matches your preference)'); }
      else { score += 1; reasons.push('Remote-friendly'); }
    } else if (candCity && normCity(job.location) === candCity) {
      score += 5; reasons.push(`Same city (${normCity(job.location)})`);
    } else if (pref === 'remote') {
      score -= 4; reasons.push(`On-site in ${job.location} — you prefer remote`);
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return { ...job, score: finalScore, matchedSkills: matched, missingSkills: missing, reasons, fitLabel: fitLabelFor(finalScore) };
  });
  return out.sort((a, b) => b.score - a.score);
}
