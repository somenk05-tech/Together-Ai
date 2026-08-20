/**
 * Jobs from the web — the pure layer, proven without a network.
 *
 * Fixtures mirror the three vendors' real response shapes (the same shapes
 * career-ops' providers parse). Everything the scanner decides — what a
 * posting is, whether it is for India, what the safe URL is — is decided in
 * ats.ts, and this spec is where those decisions are answerable.
 */
import {
  isSafeSlug, boardUrl, htmlToText,
  normalizeGreenhouse, normalizeLever, normalizeAshby,
  normalizeAdzuna, normalizeJooble, adzunaSearchUrl, joobleRequestBody, inrYearToLpa,
  isIndiaPosting, isRemoteLocation, seniorityFromTitle,
} from './ats';
import { skillsInText, relevantMatches, type JobMatch } from '../jobs-engine';

describe('board slugs are validated before they touch a URL', () => {
  it('accepts the shapes the public directories actually contain', () => {
    for (const s of ['postman', '10pearls', 'a16z', 'two_sigma', 'foo-bar', 'x.ai']) {
      expect(isSafeSlug(s)).toBe(true);
    }
  });

  it('rejects anything that could steer the request', () => {
    for (const s of ['', 'a/b', 'a?x=1', 'a#f', 'a b', '../etc', 'a\\b', '.hidden', 'x'.repeat(101)]) {
      expect(isSafeSlug(s)).toBe(false);
    }
  });

  it('builds URLs only on the vendors’ own hosts', () => {
    expect(boardUrl('greenhouse', 'postman')).toBe('https://boards-api.greenhouse.io/v1/boards/postman/jobs?content=true');
    expect(boardUrl('lever', 'zluri')).toBe('https://api.lever.co/v0/postings/zluri?mode=json');
    expect(boardUrl('ashby', 'openai')).toBe('https://api.ashbyhq.com/posting-api/job-board/openai');
    expect(() => boardUrl('greenhouse', 'a/b')).toThrow();
  });
});

describe('the three vendors normalize to one posting shape', () => {
  it('greenhouse: jobs[] with location.name and escaped HTML content', () => {
    const out = normalizeGreenhouse({
      jobs: [
        { title: 'Senior Backend Engineer', location: { name: 'Bengaluru, India' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', content: '&lt;p&gt;Build with &lt;b&gt;Node&lt;/b&gt; and postgres.&lt;/p&gt;', updated_at: '2026-08-01T00:00:00Z', company_name: 'Postman' },
        { title: '', location: { name: 'Pune' }, absolute_url: 'https://x/2' }, // no title → dropped
      ],
    }, 'postman');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Senior Backend Engineer', company: 'Postman', location: 'Bengaluru, India', url: 'https://boards.greenhouse.io/x/jobs/1' });
    expect(out[0].description).toBe('Build with Node and postgres.');
    expect(out[0].postedAt).toBe(Date.parse('2026-08-01T00:00:00Z'));
  });

  it('lever: a bare array with categories.location and descriptionPlain', () => {
    const out = normalizeLever([
      { text: 'Data Analyst', categories: { location: 'Mumbai, Maharashtra, India' }, hostedUrl: 'https://jobs.lever.co/y/2', descriptionPlain: 'SQL and Excel daily.', createdAt: 1754000000000 },
    ], 'zluri');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Data Analyst', company: 'zluri', location: 'Mumbai, Maharashtra, India', postedAt: 1754000000000 });
  });

  it('ashby: folds secondaryLocations in, because "Remote" primary with an India secondary IS an India posting', () => {
    const out = normalizeAshby({
      jobs: [{ title: 'Product Designer', location: 'Remote', secondaryLocations: [{ location: 'Bengaluru, India' }], jobUrl: 'https://jobs.ashbyhq.com/z/3', publishedAt: '2026-08-10T00:00:00Z' }],
    }, 'linear');
    expect(out[0].location).toBe('Remote; Bengaluru, India');
    expect(isIndiaPosting(out[0].location)).toBe(true);
  });
});

describe('what counts as an India posting', () => {
  it('is decided by the location field naming India or an Indian city', () => {
    for (const loc of ['Bengaluru, India', 'Bangalore', 'Remote - India', 'Hyderabad, Telangana', 'Mumbai / Pune', 'New Delhi', 'Gurugram']) {
      expect(isIndiaPosting(loc)).toBe(true);
    }
  });

  it('a bare "Remote" is a job for everywhere, and everywhere is not India', () => {
    // Flooding an Indian citizen's matches with roles that may be
    // US-payroll-only would be the feed inventing relevance.
    for (const loc of ['Remote', 'Remote - US', 'San Francisco, CA', 'London', 'Indianapolis', 'Indiana, US', '']) {
      expect(isIndiaPosting(loc)).toBe(false);
    }
  });

  it('remote-ness is a separate fact, read for the flag and never for the India decision', () => {
    expect(isRemoteLocation('Remote - India')).toBe(true);
    expect(isRemoteLocation('Bengaluru, India')).toBe(false);
  });
});

describe('a posting speaks the same vocabulary as a CV', () => {
  it('skills come from the posting’s own words through the one shared dictionary', () => {
    const skills = skillsInText('Senior Backend Engineer. Build with Node and postgres, deploy on AWS.');
    expect(skills).toEqual(expect.arrayContaining(['node', 'sql', 'aws']));
  });

  it('seniority is read from the title alone, defaulting to mid', () => {
    expect(seniorityFromTitle('Senior Backend Engineer')).toBe('senior');
    expect(seniorityFromTitle('Staff Software Engineer')).toBe('lead');
    expect(seniorityFromTitle('Engineering Intern')).toBe('junior');
    expect(seniorityFromTitle('Backend Engineer')).toBe('mid');
  });

  it('htmlToText strips markup without inventing words', () => {
    expect(htmlToText('&lt;div&gt;GST &amp; taxation&lt;/div&gt;<style>p{}</style>')).toBe('GST & taxation');
  });
});

describe('the aggregators — Adzuna and Jooble', () => {
  it('adzuna: India-scoped by URL, salary kept only when stated, never predicted', () => {
    expect(adzunaSearchUrl('id1', 'key1', 'software engineer'))
      .toBe('https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=id1&app_key=key1&what=software+engineer&results_per_page=50&content-type=application%2Fjson');
    const out = normalizeAdzuna({
      results: [
        { title: 'Backend <strong>Engineer</strong>', company: { display_name: 'Zed Corp' }, location: { display_name: 'Salem, Tamil Nadu' }, redirect_url: 'https://www.adzuna.in/land/ad/1', description: 'Node and SQL work.', created: '2026-08-12T00:00:00Z', salary_min: 1200000, salary_max: 1800000, salary_is_predicted: '0' },
        { title: 'Analyst', company: { display_name: 'Guess Ltd' }, location: { display_name: 'Pune' }, redirect_url: 'https://www.adzuna.in/land/ad/2', description: '', salary_min: 900000, salary_max: 900000, salary_is_predicted: '1' },
        { title: 'No Company', company: {}, location: { display_name: 'Pune' }, redirect_url: 'https://x/3', description: '' }, // nameless → dropped
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'Backend Engineer', company: 'Zed Corp', location: 'Salem, Tamil Nadu', salaryLpa: 15 });
    expect(out[1].salaryLpa).toBe(0); // predicted salary is a guess, and a guess is not a fact
  });

  it('jooble: a POST with keywords + location India; snippet HTML stripped; free-text salary NOT parsed', () => {
    expect(JSON.parse(joobleRequestBody('nurse'))).toEqual({ keywords: 'nurse', location: 'India', page: '1' });
    const out = normalizeJooble({
      jobs: [
        { title: 'Staff <b>Nurse</b>', company: 'Apollo', location: 'Chennai', snippet: 'ICU &nbsp;patient care', salary: '₹40,000/month', link: 'https://jooble.org/jdp/1', updated: '2026-08-14T00:00:00Z' },
        { title: 'Ghost role', company: '', location: 'Delhi', snippet: '', link: 'https://jooble.org/jdp/2' }, // nameless → dropped
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Staff Nurse', company: 'Apollo', location: 'Chennai', description: 'ICU patient care' });
    expect(out[0].salaryLpa).toBeUndefined(); // "₹40,000/month" misread as 40 LPA would be worse than silence
  });

  it('inrYearToLpa refuses predictions, nonsense and out-of-band figures', () => {
    expect(inrYearToLpa(1200000, 1800000, '0')).toBe(15);
    expect(inrYearToLpa(1200000, 1800000, '1')).toBe(0);
    expect(inrYearToLpa(0, 0, '0')).toBe(0);
    expect(inrYearToLpa(999999999, 999999999, '0')).toBe(0); // 10,000 LPA is not a salary, it is a typo
  });
});

describe('the shortlist rule — relevant to the CV, or not shown', () => {
  const base = { id: 'x', title: 't', company: 'c', location: 'l', remote: false, seniority: 'mid' as const, skills: [], minYears: 0, salaryLpa: 0, blurb: '', score: 50, missingSkills: [], reasons: [] };

  it('drops weak fits entirely, internal and external alike', () => {
    const out = relevantMatches([
      { ...base, id: 'a', matchedSkills: ['react'], fitLabel: 'good' },
      { ...base, id: 'b', matchedSkills: ['react'], fitLabel: 'weak' },
    ] as JobMatch[]);
    expect(out.map((m) => m.id)).toEqual(['a']);
  });

  it('an external role must share at least one skill with the CV; a city posting may stretch', () => {
    const out = relevantMatches([
      { ...base, id: 'ext-none', matchedSkills: [], fitLabel: 'fair', externalUrl: 'https://x/1' },
      { ...base, id: 'ext-one', matchedSkills: ['sql'], fitLabel: 'fair', externalUrl: 'https://x/2' },
      { ...base, id: 'city-none', matchedSkills: [], fitLabel: 'fair' },
    ] as JobMatch[]);
    expect(out.map((m) => m.id)).toEqual(['ext-one', 'city-none']);
  });

  it('caps the page at a shortlist, keeping the top of the score order it was given', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...base, id: `m${i}`, matchedSkills: ['sql'], fitLabel: 'good' })) as JobMatch[];
    expect(relevantMatches(many)).toHaveLength(80);
    expect(relevantMatches(many)[0].id).toBe('m0');
  });
});
