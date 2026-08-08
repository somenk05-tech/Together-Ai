import { defaultSectionOrder, diffEntries, entryKey, toStartSort, type CvEntryLike } from './cv-entries';
import { JobsService } from './jobs.service';

describe('cv-entries — dates stay written, sorting is separate', () => {
  it('reads the formats a CV actually uses', () => {
    expect(toStartSort('Mar 2019')).toBe(201903);
    expect(toStartSort('March 2019')).toBe(201903);
    expect(toStartSort('Sept 2019')).toBe(201909);
    expect(toStartSort('Aug. 2018')).toBe(201808);
    expect(toStartSort('May 2020')).toBe(202005);
    expect(toStartSort('2019')).toBe(201901);
    expect(toStartSort('2019-09')).toBe(201909);
    expect(toStartSort('2019/03')).toBe(201903);
    expect(toStartSort('2019-09-01')).toBe(201909);
    expect(toStartSort('09/2019')).toBe(201909);
    expect(toStartSort('09-2019')).toBe(201909);
  });

  it('takes the START of a range, and the year of a range written with a dash', () => {
    expect(toStartSort('Mar 2019 – Present')).toBe(201903);
    expect(toStartSort('2019-2021')).toBe(201901);
  });

  it('day-first when both numbers could be a day, and settles it when one cannot', () => {
    expect(toStartSort('15/03/2019')).toBe(201903);   // 15 can only be the day
    expect(toStartSort('03/15/2019')).toBe(201903);   // so can 15, the other way round
    expect(toStartSort('01/03/2019')).toBe(201903);   // ambiguous → day first
  });

  it('returns 0 rather than guessing', () => {
    expect(toStartSort('')).toBe(0);
    expect(toStartSort('   ')).toBe(0);
    expect(toStartSort('Present')).toBe(0);
    expect(toStartSort('ongoing')).toBe(0);
    expect(toStartSort('till date')).toBe(0);
    expect(toStartSort('March')).toBe(0);             // a month with no year cannot be placed
    expect(toStartSort('19')).toBe(0);                // two digits are not a year
    expect(toStartSort('n/a')).toBe(0);
  });

  it('a year with no readable month is January of that year, not a fabricated month', () => {
    expect(toStartSort('Spring 2019')).toBe(201901);
    expect(toStartSort('Winter 2019')).toBe(201901);
  });

  it('a word that merely starts like a month is not a month', () => {
    // "Junior Analyst, 2019" must not become June.
    expect(toStartSort('Junior Analyst 2019')).toBe(201901);
    expect(toStartSort('Junior Analyst')).toBe(0);
  });
});

describe('cv-entries — the running order follows the person', () => {
  const many = (kind: string, n: number) => Array.from({ length: n }, () => kind);

  it('a developer leads with experience', () => {
    const order = defaultSectionOrder([
      ...many('experience', 3), 'education', 'certification', ...many('project', 2),
    ]);
    expect(order).toEqual(['experience', 'education', 'project', 'certification']);
  });

  it('a student — one internship, four projects — leads with the projects', () => {
    const order = defaultSectionOrder(['experience', 'education', ...many('project', 4)]);
    expect(order).toEqual(['project', 'experience', 'education']);
  });

  it('a freelancer with no salaried job leads with the work', () => {
    const order = defaultSectionOrder([...many('project', 5), 'language', ...many('link', 2)]);
    expect(order).toEqual(['project', 'language', 'link']);
  });

  it('a creative puts the awards straight after the work', () => {
    const order = defaultSectionOrder([
      'experience', 'education', ...many('project', 4), ...many('award', 2),
    ]);
    expect(order).toEqual(['project', 'award', 'experience', 'education']);
    // …and the same rule holds when they also have a career, without stealing
    // the lead from it.
    expect(defaultSectionOrder([
      ...many('experience', 3), 'education', ...many('project', 3), ...many('award', 2),
    ])).toEqual(['experience', 'education', 'project', 'award']);
  });

  it('one award is not a creative, and two projects are not a portfolio', () => {
    expect(defaultSectionOrder([...many('experience', 2), ...many('project', 3), 'award']))
      .toEqual(['experience', 'project', 'award']);
    expect(defaultSectionOrder(['experience', ...many('project', 2), ...many('award', 2)]))
      .toEqual(['experience', 'project', 'award']);
  });

  it('never invents a section that has no entries', () => {
    expect(defaultSectionOrder([])).toEqual([]);
    expect(defaultSectionOrder(['experience', 'experience'])).toEqual(['experience']);
  });

  it('a kind nobody planned for still gets a section, after the ones that were', () => {
    expect(defaultSectionOrder(['filmography', 'experience', 'filmography']))
      .toEqual(['experience', 'filmography']);
  });
});

describe('cv-entries — what a re-upload would change', () => {
  const existing: CvEntryLike[] = [
    { id: 'a', kind: 'experience', title: 'Senior Backend Engineer', organisation: 'Zeta Labs', startText: 'Mar 2019', location: 'Bengaluru' },
    { id: 'b', kind: 'education', title: 'B.Tech Computer Science', organisation: 'VIT' },
  ];

  it('separates added, changed and unchanged', () => {
    const diff = diffEntries(existing, [
      // Same job, same place, punctuation and case moved around — the same row.
      { kind: 'experience', title: 'senior backend engineer', organisation: 'Zeta Labs.', startText: 'Mar 2019', location: 'Bengaluru' },
      // Same degree, and now it says where.
      { kind: 'education', title: 'B.Tech Computer Science', organisation: 'VIT', location: 'Vellore' },
      // Genuinely new.
      { kind: 'experience', title: 'Staff Engineer', organisation: 'Nilgiri Systems' },
    ]);
    expect(diff.unchanged.map((e) => e.title)).toEqual(['senior backend engineer']);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fields).toEqual(['location']);
    expect(diff.added.map((e) => e.organisation)).toEqual(['Nilgiri Systems']);
  });

  it('an empty incoming field is silence, not a deletion', () => {
    const diff = diffEntries(existing, [
      { kind: 'experience', title: 'Senior Backend Engineer', organisation: 'Zeta Labs', startText: '', location: '' },
    ]);
    expect(diff.changed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
  });

  it('the same key the service uses to protect a citizen\'s own row', () => {
    expect(entryKey({ kind: 'experience', title: 'Sr.  Engineer', organisation: 'Zeta Labs' }))
      .toBe(entryKey({ kind: 'experience', title: 'sr engineer', organisation: 'ZETA  LABS' }));
  });
});

/**
 * The one rule of the merge, proven end to end rather than by inspection: a row
 * the citizen wrote is not the CV's to overwrite.
 *
 * Prisma is faked rather than mocked per call, because the assertion is about
 * the ROWS that survive, not about which query ran. Everything the upload path
 * touches beyond the entries — the matcher, the master profile — is stubbed to
 * the smallest thing that lets it finish.
 */
describe('uploadResume — a citizen\'s own edit survives a re-upload', () => {
  type Row = Record<string, unknown>;

  function harness(entries: Row[]) {
    const rows: Row[] = entries.map((e, i) => ({
      id: `e${i}`, profileId: 'p1', order: i, hidden: false, kind: '', title: '', organisation: '',
      qualifier: '', location: '', startText: '', endText: '', startSort: 0, current: false,
      description: '', bullets: '', tags: '', url: '', confidence: 'high', source: 'cv', evidence: '',
      createdAt: new Date(), updatedAt: new Date(), ...e,
    }));
    const profile: Row = { id: 'p1', userId: 'u1', sectionOrder: '', revision: 1, skills: '', headline: '', experienceYears: 0, seniority: 'junior', location: null, resumeName: null };
    const match = (where: Row) => rows.filter((r) => Object.entries(where)
      .every(([k, v]) => r[k] === v));
    const prisma = {
      jobProfile: {
        upsert: async () => profile,
        findUnique: async () => profile,
        updateMany: async () => ({ count: 1 }),
      },
      job: { findMany: async () => [] },
      cvEntry: {
        findMany: async ({ where }: { where: Row }) => match(where),
        create: async ({ data }: { data: Row }) => {
          const row = { id: `e${rows.length}`, ...data };
          rows.push(row);
          return row;
        },
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const hit = match(where);
          for (const r of hit) Object.assign(r, data);
          return { count: hit.length };
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };
    const ai = {
      readCv: async () => null,
      readCvEntries: async () => ({
        entries: [
          {
            kind: 'experience', title: 'Senior Backend Engineer', organisation: 'Zeta Labs',
            qualifier: '', location: 'Hyderabad', startText: 'Mar 2019', endText: '', current: false,
            description: 'Read off the PDF.', bullets: [], tags: [], url: '', confidence: 'high' as const,
          },
          {
            kind: 'experience', title: 'Staff Engineer', organisation: 'Nilgiri Systems',
            qualifier: '', location: '', startText: '2023', endText: '', current: true,
            description: '', bullets: ['Ran the platform team.'], tags: ['go'], url: '', confidence: 'medium' as const,
          },
        ],
      }),
    };
    const service = new JobsService(
      prisma as unknown as ConstructorParameters<typeof JobsService>[0],
      { get: async () => null, syncShared: async () => undefined } as unknown as ConstructorParameters<typeof JobsService>[1],
      { now: () => new Date(), timezoneFor: async () => 'Asia/Kolkata', dayIn: () => '2026-08-08' } as unknown as ConstructorParameters<typeof JobsService>[2],
      ai as unknown as ConstructorParameters<typeof JobsService>[3],
    );
    return { service, rows };
  }

  it('leaves the row they edited alone and appends the one that is new', async () => {
    const { service, rows } = harness([{
      kind: 'experience', title: 'Senior Backend Engineer', organisation: 'Zeta Labs',
      location: 'Bengaluru', startText: 'Mar 2019', description: 'What I actually did.',
      source: 'citizen', confidence: 'high',
    }]);

    const out = await service.uploadResume('u1', { resumeText: 'Ananya Rao\nSenior Backend Engineer\n' });

    expect(out.entries).toEqual({ added: 1, updated: 0, keptYours: 1 });
    const mine = rows.find((r) => r.organisation === 'Zeta Labs')!;
    expect(mine.source).toBe('citizen');
    expect(mine.location).toBe('Bengaluru');            // NOT 'Hyderabad'
    expect(mine.description).toBe('What I actually did.');
    const added = rows.find((r) => r.organisation === 'Nilgiri Systems')!;
    expect(added.source).toBe('cv');
    expect(added.startSort).toBe(202301);
    expect(added.bullets).toBe('Ran the platform team.');
  });

  it('refreshes a row an earlier upload wrote, because nobody has claimed it', async () => {
    const { service, rows } = harness([{
      kind: 'experience', title: 'Senior Backend Engineer', organisation: 'Zeta Labs',
      location: 'Bengaluru', startText: '', source: 'cv', confidence: 'low',
    }]);

    const out = await service.uploadResume('u1', { resumeText: 'Ananya Rao\n' });

    expect(out.entries).toEqual({ added: 1, updated: 1, keptYours: 0 });
    const refreshed = rows.find((r) => r.organisation === 'Zeta Labs')!;
    expect(refreshed.location).toBe('Hyderabad');
    expect(refreshed.startText).toBe('Mar 2019');
    expect(refreshed.startSort).toBe(201903);
    expect(refreshed.confidence).toBe('high');
  });
});
