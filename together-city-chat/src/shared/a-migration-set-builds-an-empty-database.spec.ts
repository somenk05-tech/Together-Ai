import * as fs from 'fs';
import * as path from 'path';

/**
 * ── EVERY MIGRATION APPLIES TO AN EMPTY DATABASE, IN THE ORDER THEY SORT ──
 *
 * CI's API job runs `prisma migrate deploy` against a fresh Postgres, and its
 * comment says why: "the committed migrations are what production runs, so
 * this also proves they apply to an empty database."
 *
 * They did not. `20260814020000_mail_project_look` ALTERs "MailProject";
 * `20260814090000_mail_projects` CREATEs it, and 090000 sorts last. Production
 * never noticed — the table was already there, put in by hand, and 090000 is
 * written entirely in `IF NOT EXISTS` for exactly that reason.
 *
 * WHAT IT COST. `migrate deploy` stops at the first failure, and the three
 * steps after it are Type-check, Test and "API docs are current". So from
 * 14 Aug the API job died 57 seconds in, having run no test at all — every
 * guard in `src/security/`, the query-scoping budget, the frozen public-route
 * list, the account-purge classification and the runtime isolation suite, none
 * of them read by anything but a person remembering to run jest. Which is the
 * exact state ci.yml was written to end. The web job stayed green, so the
 * commit list said "3 / 4" rather than something anybody stops for.
 *
 * This file is the cheap half of the proof and it runs everywhere: no
 * database, no Postgres, just the ordering invariant that broke. The expensive
 * half is CI itself, which is now able to reach it.
 *
 * WHAT IT CANNOT SEE, stated so nobody trusts it too far: it is regex over
 * SQL, not a parser. A table created inside a DO block or by a function call
 * is invisible to it, and so is a column that does not exist yet. It answers
 * one question — is every ALTERed table created by this migration or an
 * earlier one — because that is the question that was answered wrong.
 */
const DIR = path.join(__dirname, '..', '..', 'prisma', 'migrations');

const migrations = fs.readdirSync(DIR)
  .filter((n) => fs.existsSync(path.join(DIR, n, 'migration.sql')))
  .sort();

/** Comments stripped: half of these files are prose, and prose names tables. */
const sqlOf = (name: string) => fs.readFileSync(path.join(DIR, name, 'migration.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

/**
 * Statements in the order they appear IN THE FILE, because a migration that
 * creates a table and then adds its foreign keys forty lines later is the
 * ordinary Prisma shape and is perfectly correct. Reading a file as an
 * unordered bag of CREATEs and ALTERs calls every one of those a fault — which
 * is what the first draft of this file did, on thirty of them.
 */
type Stmt = { at: number; kind: 'create' | 'alter'; table: string };
const statements = (sql: string): Stmt[] => [
  ...[...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)]
    .map((m) => ({ at: m.index ?? 0, kind: 'create' as const, table: m[1] })),
  ...[...sql.matchAll(/RENAME\s+TO\s+"([^"]+)"/gi)]
    .map((m) => ({ at: m.index ?? 0, kind: 'create' as const, table: m[1] })),
  ...[...sql.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"/gi)]
    .map((m) => ({ at: m.index ?? 0, kind: 'alter' as const, table: m[1] })),
].sort((a, b) => a.at - b.at);

describe('the migration set', () => {
  it('has migrations to check at all', () => {
    expect(migrations.length).toBeGreaterThan(50);
  });

  /**
   * The invariant, and the whole file. Walked in the order `migrate deploy`
   * walks them, carrying forward what exists by the time each one runs.
   */
  it('never alters a table before something has created it', () => {
    const exists = new Set<string>();
    const offences: string[] = [];
    for (const name of migrations) {
      for (const st of statements(sqlOf(name))) {
        if (st.kind === 'create') exists.add(st.table);
        else if (!exists.has(st.table)) offences.push(`${name} alters "${st.table}" before anything creates it`);
      }
    }
    expect(offences).toEqual([]);
  });

  /**
   * The fix is a NEW migration rather than a rename or an edit, because both of
   * those change the identity or the checksum of a migration production has
   * already applied and `migrate deploy` refuses that on the next run. If
   * somebody ever "tidies" it away, this says what it was for.
   */
  it('creates MailProject before the two migrations that alter it', () => {
    const i = (n: string) => migrations.indexOf(n);
    expect(i('20260814010000_mail_projects_before_their_columns')).toBeGreaterThan(-1);
    expect(i('20260814010000_mail_projects_before_their_columns'))
      .toBeLessThan(i('20260814020000_mail_project_look'));
    // And it must not add the foreign key: 090000 adds it with a bare ADD
    // CONSTRAINT, which has no IF NOT EXISTS, so a second one there would move
    // the failure rather than remove it.
    expect(sqlOf('20260814010000_mail_projects_before_their_columns')).not.toMatch(/ADD\s+CONSTRAINT/i);
  });
});
