import { parseResume, analyzeResume, matchJobs, JOB_SEEDS, normCity } from './jobs-engine';

describe('jobs-engine — parsing & extraction', () => {
  const cv = `Ananya Rao
Senior Backend Engineer
ananya.rao@example.com | +91 98765 43210 | Bengaluru
5 years of experience building Node.js and NestJS services on AWS.
Skills: TypeScript, SQL, Docker, Kubernetes.
Education: B.Tech Computer Science
AWS Certified Solutions Architect
Expected CTC 32 LPA. Open to remote.`;

  it('extracts contact, education, certs, years, remote, salary', () => {
    const p = parseResume(cv);
    expect(p.name).toBe('Ananya Rao');
    expect(p.email).toBe('ananya.rao@example.com');
    expect(p.phone && p.phone.replace(/\D/g, '').length >= 10).toBe(true);
    expect(p.location).toBe('Bengaluru');
    expect(p.experienceYears).toBe(5);
    expect(p.seniority).toBe('senior');
    expect(p.skills).toEqual(expect.arrayContaining(['node', 'nestjs', 'aws', 'typescript', 'sql', 'docker', 'kubernetes']));
    expect(p.education?.join(' ').toLowerCase()).toContain('tech');
    expect(p.certifications?.some((c) => /aws/i.test(c))).toBe(true);
    expect(p.remotePref).toBe('remote');
    expect(p.salaryExpectationLpa).toBe(32);
    // headline should be the title line, not the name
    expect(p.headline.toLowerCase()).toContain('backend');
  });

  it('city normalisation: Bangalore === Bengaluru', () => {
    expect(normCity('Bangalore')).toBe('Bengaluru');
    expect(normCity('BLR')).toBe('Bengaluru');
    expect(normCity('Gurugram')).toBe('Gurgaon');
  });

  it('non-tech CV parses to real skills', () => {
    const nurse = parseResume('Priya Nair\nStaff Nurse\n8 years of experience in ICU patient care and nursing.\nBSc Nursing');
    expect(nurse.skills).toEqual(expect.arrayContaining(['nursing']));
    const acct = parseResume('Ravi K\nAccountant\n6 years of experience in accounting, GST and auditing. Tally, Excel.');
    expect(acct.skills).toEqual(expect.arrayContaining(['accounting', 'excel']));
  });
});

describe('jobs-engine — CV intelligence (analyzeResume)', () => {
  it('produces ATS score, summary, suggested roles, gaps, tips', () => {
    const p = parseResume(`Ananya Rao
Senior Backend Engineer
ananya@example.com | +91 9876543210 | Bengaluru
5 years of experience with Node.js, NestJS, SQL, AWS.
B.Tech`);
    const a = analyzeResume(p);
    expect(a.atsScore).toBeGreaterThanOrEqual(70);
    expect(a.summary).toMatch(/Senior/i);
    expect(a.suggestedRoles.length).toBeGreaterThan(0);
    expect(a.extracted.email).toBe('ananya@example.com');
    expect(Array.isArray(a.improvements)).toBe(true);
  });

  it('thin CV → low ATS + concrete improvement tips', () => {
    const a = analyzeResume(parseResume('just some text with no contact and no skills'));
    expect(a.atsScore).toBeLessThan(45);
    expect(a.improvements.join(' ')).toMatch(/email|skills|experience/i);
    expect(a.topMissingSkills.length).toBeGreaterThan(0);
  });
});

describe('jobs-engine — matching logic (audit fixes)', () => {
  it('C3: 0-yr fresh grad is NOT a strong match for a 5-yr senior role', () => {
    const grad = parseResume('Fresh Grad\nJunior Developer\nSkills: React, TypeScript, JavaScript, GraphQL. 0 years.');
    const fe = matchJobs(grad, JOB_SEEDS).find((m) => m.id === 'job_fe')!;
    expect(fe.score).toBeLessThan(60);             // was 82 before the fix
    expect(fe.fitLabel).not.toBe('strong');
    expect(fe.reasons.join(' ')).toMatch(/short by|step up/i);
  });

  it('a qualified senior IS a strong match', () => {
    const sr = parseResume('Sr Dev\nSenior Frontend Engineer\n8 years of experience. React, TypeScript, JavaScript, GraphQL. Bengaluru. Open to remote.');
    const fe = matchJobs(sr, JOB_SEEDS).find((m) => m.id === 'job_fe')!;
    expect(fe.score).toBeGreaterThanOrEqual(85);
    expect(fe.fitLabel).toBe('strong');
  });

  it('C4: salary expectation influences score', () => {
    const base = parseResume('Analyst\nData Analyst\n3 years of experience. Data analysis, SQL, Python, Excel.');
    const highExpect = { ...base, salaryExpectationLpa: 40 };
    const lowExpect = { ...base, salaryExpectationLpa: 15 };
    const dataHigh = matchJobs(highExpect, JOB_SEEDS).find((m) => m.id === 'job_data')!; // pays 18
    const dataLow = matchJobs(lowExpect, JOB_SEEDS).find((m) => m.id === 'job_data')!;
    expect(dataLow.score).toBeGreaterThan(dataHigh.score);
  });

  it('H2: non-tech seeker gets a real same-field top match', () => {
    const nurse = parseResume('Priya\nStaff Nurse\n4 years of experience in ICU patient care and clinical nursing, with strong communication with patients and families. Chennai.');
    const ranked = matchJobs(nurse, JOB_SEEDS);
    const top = ranked[0];
    expect(top.id).toBe('job_nurse');                         // same-field role ranks #1
    expect(top.fitLabel === 'strong' || top.fitLabel === 'good').toBe(true);
    // and it beats every tech role for this candidate
    const bestTech = ranked.find((m) => ['job_fe', 'job_be', 'job_ml'].includes(m.id))!;
    expect(top.score).toBeGreaterThan(bestTech.score);
  });

  it('H7: fit labels separate signal from noise; excludeOwn works', () => {
    const empty = parseResume('nothing relevant here');
    const all = matchJobs(empty, JOB_SEEDS);
    expect(all.every((m) => m.fitLabel === 'weak' || m.fitLabel === 'fair')).toBe(true);
    const withOwn = [{ ...JOB_SEEDS[0], postedByYou: true }];
    expect(matchJobs(empty, withOwn, { excludeOwn: true }).length).toBe(0);
  });
});
