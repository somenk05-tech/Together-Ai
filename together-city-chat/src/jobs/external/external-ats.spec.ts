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
  isIndiaPosting, isRemoteLocation, seniorityFromTitle,
} from './ats';
import { skillsInText } from '../jobs-engine';

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
