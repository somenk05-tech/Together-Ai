/**
 * Together City — Jobs Engine
 * ------------------------------------------------------------------
 * "Upload once. We do the rest." Parse a resume into a structured profile
 * (skills, seniority, titles, years), then match it against open roles with a
 * transparent, explainable score. No black box — every match shows which of the
 * candidate's skills it hit and which it's missing.
 */

/** Skill vocabulary the parser recognises (extend freely). */
export const SKILL_DICTIONARY: { key: string; label: string; aliases: string[] }[] = [
  { key: 'javascript', label: 'JavaScript', aliases: ['javascript', 'js', 'es6'] },
  { key: 'typescript', label: 'TypeScript', aliases: ['typescript', 'ts'] },
  { key: 'react', label: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { key: 'node', label: 'Node.js', aliases: ['node', 'nodejs', 'node.js'] },
  { key: 'nestjs', label: 'NestJS', aliases: ['nestjs', 'nest.js'] },
  { key: 'python', label: 'Python', aliases: ['python', 'django', 'flask', 'pandas'] },
  { key: 'java', label: 'Java', aliases: ['java', 'spring', 'spring boot'] },
  { key: 'sql', label: 'SQL', aliases: ['sql', 'postgres', 'postgresql', 'mysql', 'mssql'] },
  { key: 'nosql', label: 'NoSQL', aliases: ['nosql', 'mongodb', 'mongo', 'redis', 'dynamodb'] },
  { key: 'aws', label: 'AWS', aliases: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'] },
  { key: 'docker', label: 'Docker', aliases: ['docker', 'containers'] },
  { key: 'kubernetes', label: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { key: 'graphql', label: 'GraphQL', aliases: ['graphql', 'apollo'] },
  { key: 'ml', label: 'Machine Learning', aliases: ['machine learning', 'ml', 'deep learning', 'tensorflow', 'pytorch'] },
  { key: 'data', label: 'Data Analysis', aliases: ['data analysis', 'analytics', 'tableau', 'power bi', 'looker'] },
  { key: 'product', label: 'Product Management', aliases: ['product management', 'product manager', 'roadmap', 'prd'] },
  { key: 'design', label: 'Product Design', aliases: ['ux', 'ui', 'figma', 'product design', 'wireframe'] },
  { key: 'marketing', label: 'Marketing', aliases: ['marketing', 'seo', 'growth', 'campaign'] },
  { key: 'sales', label: 'Sales', aliases: ['sales', 'business development', 'crm', 'salesforce'] },
  { key: 'devops', label: 'DevOps', aliases: ['devops', 'ci/cd', 'terraform', 'jenkins'] },
  { key: 'mobile', label: 'Mobile', aliases: ['ios', 'android', 'flutter', 'react native', 'swift', 'kotlin'] },
  { key: 'excel', label: 'Excel', aliases: ['excel', 'spreadsheets', 'vlookup'] },
  { key: 'leadership', label: 'Leadership', aliases: ['leadership', 'led a team', 'managed', 'mentored', 'team lead'] },
  { key: 'communication', label: 'Communication', aliases: ['communication', 'stakeholder', 'presentation'] },
];

const SKILL_LABEL: Record<string, string> = Object.fromEntries(SKILL_DICTIONARY.map((s) => [s.key, s.label]));
export const labelFor = (key: string): string => SKILL_LABEL[key] ?? key;

export interface ParsedResume {
  headline: string;
  skills: string[];          // skill keys
  experienceYears: number;
  seniority: 'junior' | 'mid' | 'senior' | 'lead';
  location: string | null;
}

/** Extract a structured profile from raw resume text. */
export function parseResume(text: string): ParsedResume {
  const lower = ` ${text.toLowerCase()} `;
  const skills = SKILL_DICTIONARY
    .filter((s) => s.aliases.some((a) => lower.includes(` ${a} `) || lower.includes(`${a},`) || lower.includes(`${a}.`) || lower.includes(`${a}/`) || lower.includes(`(${a}`)))
    .map((s) => s.key);

  // years of experience: look for "N years" / "N+ years"
  let experienceYears = 0;
  const yr = lower.match(/(\d{1,2})\s*\+?\s*years?/);
  if (yr) experienceYears = Math.min(40, parseInt(yr[1], 10));

  const seniority: ParsedResume['seniority'] =
    /(principal|staff|lead|head of|director|vp )/.test(lower) || experienceYears >= 10 ? 'lead'
    : /(senior|sr\.)/.test(lower) || experienceYears >= 6 ? 'senior'
    : experienceYears >= 2 ? 'mid' : 'junior';

  // headline: first non-empty line, trimmed
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  const headline = firstLine.slice(0, 80) || `${seniority[0].toUpperCase()}${seniority.slice(1)} professional`;

  // location: look for common city markers
  const CITIES = ['bengaluru', 'bangalore', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai', 'remote', 'gurgaon', 'noida'];
  const loc = CITIES.find((c) => lower.includes(c));
  const location = loc ? loc.charAt(0).toUpperCase() + loc.slice(1) : null;

  return { headline, skills, experienceYears, seniority, location };
}

// ─────────────────────────── job matching ───────────────────────────
export interface JobSeed {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: ParsedResume['seniority']; skills: string[]; minYears: number; salaryLpa: number; blurb: string;
}

/** Seeded open roles across functions. Salaries in ₹ LPA (India). */
export const JOB_SEEDS: JobSeed[] = [
  { id: 'job_fe', title: 'Senior Frontend Engineer', company: 'Nimbus Labs', location: 'Bengaluru', remote: true, seniority: 'senior', skills: ['react', 'typescript', 'javascript', 'graphql'], minYears: 5, salaryLpa: 42, blurb: 'Own the design-system and core web app for a fast-growing SaaS.' },
  { id: 'job_be', title: 'Backend Engineer (Node)', company: 'Fintech Foundry', location: 'Remote', remote: true, seniority: 'mid', skills: ['node', 'nestjs', 'sql', 'aws'], minYears: 3, salaryLpa: 30, blurb: 'Build payment services at scale on a modern Node/Nest stack.' },
  { id: 'job_full', title: 'Full-Stack Engineer', company: 'Together City', location: 'Hyderabad', remote: true, seniority: 'mid', skills: ['react', 'node', 'typescript', 'sql'], minYears: 3, salaryLpa: 34, blurb: 'Ship end-to-end features across our super-app hubs.' },
  { id: 'job_data', title: 'Data Analyst', company: 'InsightIQ', location: 'Pune', remote: false, seniority: 'mid', skills: ['data', 'sql', 'python', 'excel'], minYears: 2, salaryLpa: 18, blurb: 'Turn product data into decisions with dashboards and deep-dives.' },
  { id: 'job_ml', title: 'ML Engineer', company: 'Vector AI', location: 'Bengaluru', remote: true, seniority: 'senior', skills: ['ml', 'python', 'aws', 'docker'], minYears: 5, salaryLpa: 48, blurb: 'Train and serve recommendation models in production.' },
  { id: 'job_pm', title: 'Product Manager', company: 'Orbit', location: 'Mumbai', remote: false, seniority: 'senior', skills: ['product', 'data', 'communication', 'leadership'], minYears: 5, salaryLpa: 40, blurb: 'Own a 0→1 product line end to end with a cross-functional pod.' },
  { id: 'job_design', title: 'Product Designer', company: 'Pixel & Co', location: 'Remote', remote: true, seniority: 'mid', skills: ['design', 'communication'], minYears: 3, salaryLpa: 26, blurb: 'Design flows for a consumer app used by millions.' },
  { id: 'job_devops', title: 'DevOps Engineer', company: 'CloudSpine', location: 'Gurgaon', remote: true, seniority: 'senior', skills: ['devops', 'kubernetes', 'aws', 'docker'], minYears: 5, salaryLpa: 38, blurb: 'Run resilient infra and CI/CD for a high-traffic platform.' },
];

const SEN_ORDER = ['junior', 'mid', 'senior', 'lead'];

/** Any postable/matchable role — seeds and company-posted rows share this shape. */
export interface JobLike {
  id: string; title: string; company: string; location: string; remote: boolean;
  seniority: ParsedResume['seniority']; skills: string[]; minYears: number; salaryLpa: number; blurb: string;
  postedByYou?: boolean;
}

export interface JobMatch extends JobLike {
  score: number;                 // 0..100
  matchedSkills: string[];       // keys the candidate has
  missingSkills: string[];       // keys the role wants that candidate lacks
  reasons: string[];
}

/** Score a set of roles against a parsed profile. Skills overlap dominates; seniority & years adjust. */
export function matchJobs(profile: ParsedResume, jobs: JobLike[] = JOB_SEEDS): JobMatch[] {
  const have = new Set(profile.skills);
  const out = jobs.map((job) => {
    const matched = job.skills.filter((s) => have.has(s));
    const missing = job.skills.filter((s) => !have.has(s));
    const skillPct = job.skills.length ? matched.length / job.skills.length : 0;
    let score = skillPct * 78; // up to 78 from skills

    const reasons: string[] = [];
    if (matched.length) reasons.push(`${matched.length}/${job.skills.length} required skills: ${matched.map(labelFor).join(', ')}`);
    // seniority fit
    const gap = SEN_ORDER.indexOf(profile.seniority) - SEN_ORDER.indexOf(job.seniority);
    if (gap === 0) { score += 12; reasons.push('Seniority is a strong fit'); }
    else if (Math.abs(gap) === 1) { score += 6; reasons.push(gap > 0 ? 'You are slightly above the level' : 'A small stretch up in seniority'); }
    // experience
    if (profile.experienceYears >= job.minYears) { score += 6; reasons.push(`${profile.experienceYears} yrs ≥ ${job.minYears} required`); }
    else if (profile.experienceYears > 0) reasons.push(`Wants ${job.minYears}+ yrs (you have ${profile.experienceYears})`);
    // location / remote
    if (job.remote) { score += 4; reasons.push('Remote-friendly'); }
    else if (profile.location && job.location.toLowerCase() === profile.location.toLowerCase()) { score += 4; reasons.push(`Same city (${job.location})`); }

    return { ...job, score: Math.max(0, Math.min(100, Math.round(score))), matchedSkills: matched, missingSkills: missing, reasons };
  });
  return out.sort((a, b) => b.score - a.score);
}
