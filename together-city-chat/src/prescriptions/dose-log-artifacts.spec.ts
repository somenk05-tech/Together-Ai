import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * The migration that deletes rows from a medical record, held to its predicate.
 *
 * `20260731170000_dose_log_sweep_artifacts` removes the `missed` DoseLog rows
 * the hourly sweep wrote back when there was no way in the app to answer it. It
 * is a DELETE against medical data, and the only thing that makes it defensible
 * is how narrow it is: the citizen's own taken/skipped rows must survive, and so
 * must every `missed` written after answering became possible.
 *
 * A structural test, like security/query-scoping.spec.ts — it reads the SQL
 * rather than a database, so it needs no fixture and cannot pass by luck. It
 * exists because a later edit widening that WHERE clause would be invisible in
 * review and irreversible in production.
 */
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');
const DIR = '20260731170000_dose_log_sweep_artifacts';

describe('the DoseLog sweep-artifact migration', () => {
  const dirs = readdirSync(MIGRATIONS).filter((d) => !d.startsWith('.'));
  const sql = readFileSync(join(MIGRATIONS, DIR, 'migration.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  it('is still in the migrations folder', () => {
    expect(dirs).toContain(DIR);
  });

  it('is exactly one statement, and it is the delete', () => {
    // One statement, so there is nothing else riding along in a file whose
    // review attention was spent on the DELETE.
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^DELETE FROM "DoseLog"/);
  });

  it('touches only rows the sweep wrote', () => {
    // recordDose always stamps actedAtUtc. Without this condition the delete
    // would take a citizen's own answers with it.
    expect(statements[0]).toMatch(/"actedAtUtc" IS NULL/);
  });

  it('touches only missed rows', () => {
    expect(statements[0]).toMatch(/action = 'missed'/);
    expect(statements[0]).not.toMatch(/'taken'|'skipped'/);
  });

  it('is bounded in time by the commit that made answering possible', () => {
    // 62e1fe3, 2026-07-30 13:23:12 UTC. After it a `missed` means something,
    // because by then there was a button to press instead.
    expect(statements[0]).toMatch(/"createdAt" < TIMESTAMP WITH TIME ZONE '2026-07-30 13:23:12\+00'/);
  });

  it('has no unbounded delete anywhere in the file', () => {
    for (const s of statements) {
      if (/^DELETE/i.test(s)) expect(s).toMatch(/\bWHERE\b/);
    }
  });

  it('says why, at length, in the file itself', () => {
    // Somebody reading `git log` on a medical table years from now needs the
    // reasoning next to the statement, not in a chat.
    const comments = sql.split('\n').filter((l) => l.trim().startsWith('--'));
    expect(comments.length).toBeGreaterThan(20);
    expect(sql).toMatch(/carries no information|cannot know/);
  });
});
