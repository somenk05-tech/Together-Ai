import { PURGE_RULES } from './purge-plan';
import { NEVER_EXPORT, exportPlan, manifest, scrubRow } from './data-export';

/**
 * The guard that makes this design worth having: the export and the purge are
 * one list. If they were two, they would drift the first time somebody added a
 * hub — and silently in both directions.
 */
describe('export and delete are the same list', () => {
  it('exports everything the app would destroy on request', () => {
    const purged = PURGE_RULES.filter((r) => r.action === 'purge').map((r) => r.model).sort();
    const exported = exportPlan().map((s) => s.model).sort();
    expect(exported).toEqual(purged);
  });

  it('carries a filter through for every split model, so half a table is not exported whole', () => {
    for (const r of PURGE_RULES.filter((x) => x.action === 'purge' && x.filter)) {
      const s = exportPlan().find((e) => e.model === r.model && JSON.stringify(e.filter) === JSON.stringify(r.filter));
      expect([r.model, Boolean(s)]).toEqual([r.model, true]);
    }
  });

  it('cannot drift, because one is derived from the other', () => {
    // A new hub added to the purge plan appears here without anybody
    // remembering to add it twice.
    const invented = [
      ...PURGE_RULES,
      { model: 'NewHubThing', by: 'userId' as const, action: 'purge' as const, reason: 'test' },
    ];
    expect(exportPlan(invented).map((s) => s.model)).toContain('NewHubThing');
  });

  it('carries the reason across, so the file can say why each part is in it', () => {
    for (const s of exportPlan()) expect(s.reason.length).toBeGreaterThan(10);
  });

  it('keeps the filter for models where only some rows are personal', () => {
    const withFilter = PURGE_RULES.filter((r) => r.action === 'purge' && r.filter);
    for (const r of withFilter) {
      expect(exportPlan().find((s) => s.model === r.model)?.filter).toEqual(r.filter);
    }
  });
});

describe('what is deliberately left out', () => {
  it('excludes rows other people can also see', () => {
    // Not a loophole. A `keep` row is kept because somebody else can see it —
    // a message in a group thread, a comment under another person's post — and
    // exporting it would hand one citizen a copy of somebody else's data.
    //
    // Compared RULE by rule, not model by model, because a model can appear
    // twice with different filters. MealPlan does exactly that: an individual
    // plan is the citizen's and purges, a family plan feeds a household and is
    // kept. Comparing by model name would have called that a leak and been
    // wrong — and, worse, a naive fix would have dropped the individual plans
    // from the export.
    const keptRules = PURGE_RULES.filter((r) => r.action === 'keep');
    const exported = exportPlan();
    for (const r of keptRules) {
      const leaked = exported.some((s) => s.model === r.model
        && JSON.stringify(s.filter ?? null) === JSON.stringify(r.filter ?? null));
      expect([r.model, JSON.stringify(r.filter ?? null), leaked]).toEqual([r.model, JSON.stringify(r.filter ?? null), false]);
    }
  });

  it('still exports the purged half of a model that is split by filter', () => {
    // MealPlan: individual plans are theirs, family plans are the household's.
    const meal = exportPlan().filter((s) => s.model === 'MealPlan');
    expect(meal).toHaveLength(1);
    expect(meal[0].filter).toEqual({ mode: 'individual' });
  });

  it('strips credentials wherever they appear', () => {
    const row = {
      id: 'x', email: 'a@b.c', passwordHash: 'nope', refreshTokenHash: 'nope',
      codeHash: 'nope', name: 'Somen',
    };
    expect(scrubRow(row)).toEqual({ id: 'x', email: 'a@b.c', name: 'Somen' });
  });

  it('strips by column name, not by table', () => {
    // So a credential column appearing in a new model is covered without
    // anybody remembering to come back here.
    for (const c of NEVER_EXPORT) {
      expect(scrubRow({ keep: 1, [c]: 'secret' })).toEqual({ keep: 1 });
    }
  });

  it('is case-insensitive about it', () => {
    expect(scrubRow({ PasswordHash: 'x', ok: 1 })).toEqual({ ok: 1 });
  });

  it('renders dates as ISO rather than as objects', () => {
    const out = scrubRow({ createdAt: new Date('2026-07-30T10:00:00Z') });
    expect(out.createdAt).toBe('2026-07-30T10:00:00.000Z');
  });
});

describe('the manifest', () => {
  const m = manifest([{ model: 'MedicalRecord', rows: 3, reason: 'Uploaded medical documents.' }], '2026-07-30T10:00:00.000Z');

  it('says what the export is and where the list came from', () => {
    expect(m.about).toMatch(/same list that decides what gets destroyed/);
  });

  it('says what is missing and why, so absence is not ambiguous', () => {
    // Without this a citizen cannot tell whether something is absent because
    // they never had it, or because the app withheld it.
    expect(m.omitted).toMatch(/other people can also see/);
    expect(m.omitted).toMatch(/password hashes/);
  });

  it('reports a row count per section', () => {
    expect(m.sections[0]).toEqual({ model: 'MedicalRecord', rows: 3, reason: 'Uploaded medical documents.' });
  });
});
