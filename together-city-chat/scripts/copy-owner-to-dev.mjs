#!/usr/bin/env node
/**
 * COPY ONE ACCOUNT FROM THE LIVE DATABASE TO THE DEVELOPER COPY (owner, 16 Sep).
 *
 * "Take my @somen account and add the log in details" to dev.togethercity.app.
 *
 * It copies ONE row of "User" — same id, same handle, same password — from the
 * production Postgres into the development Postgres, plus the three empty
 * profile rows every new account gets at sign-up. Nothing else, and nobody else.
 *
 * - Both connection strings come from Railway through the CLI you are already
 *   logged into; they are never printed. Neither is the password hash.
 * - Production is opened READ ONLY.
 * - It refuses when the two databases are the same database.
 * - Running it again refreshes the copy (for example after a password change).
 *
 * Usage (from together-city-chat):  node scripts/copy-owner-to-dev.mjs somen
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const handle = (process.argv[2] ?? 'somen').trim().toLowerCase().replace(/^@/, '');
const die = (m) => { console.error(`  STOP ${m}`); process.exit(1); };

function publicUrl(env) {
  let raw;
  try {
    raw = execSync(`npx --yes @railway/cli variables -s Postgres -e ${env} --json`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
  } catch (e) {
    die(`could not read the ${env} Postgres variables from Railway (${String(e.stderr ?? e.message).trim().split('\n').pop()}). Run: npx @railway/cli login`);
  }
  const parsed = JSON.parse(raw);
  const vars = Array.isArray(parsed) ? Object.fromEntries(parsed.map((v) => [v.name ?? v.key, v.value])) : parsed;
  const url = vars.DATABASE_PUBLIC_URL;
  if (!url) die(`the ${env} Postgres service has no DATABASE_PUBLIC_URL`);
  return url;
}

const liveUrl = publicUrl('production');
const devUrl = publicUrl('development');
if (liveUrl === devUrl) die('production and development point at the same database - refusing');

const live = new pg.Client({ connectionString: liveUrl });
const dev = new pg.Client({ connectionString: devUrl });
await live.connect();
await dev.connect();

try {
  await live.query('BEGIN READ ONLY');
  const found = await live.query('SELECT * FROM "User" WHERE handle = $1', [handle]);
  await live.query('COMMIT');
  if (found.rowCount !== 1) die(`@${handle} is not an account on the live site`);
  const user = found.rows[0];
  if (user.deletedAt) die(`@${handle} is a deleted account on the live site`);

  const columnsOf = async (table) => (await dev.query(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`, [table])).rows;

  // Only the columns both databases have: the developer copy may be ahead.
  const devUserCols = new Set((await columnsOf('User')).map((c) => c.column_name));
  const cols = Object.keys(user).filter((c) => devUserCols.has(c));
  const skipped = Object.keys(user).filter((c) => !devUserCols.has(c));
  const q = (c) => `"${c}"`;

  await dev.query('BEGIN');
  const clash = await dev.query('SELECT id FROM "User" WHERE handle = $1 AND id <> $2', [handle, user.id]);
  if (clash.rowCount) die(`the developer copy already has a different @${handle} - delete it there first`);
  await dev.query(
    `INSERT INTO "User" (${cols.map(q).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT ("id") DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}`,
    cols.map((c) => user[c]),
  );

  // The three rows sign-up seeds (auth.service initializeAccount), empty.
  for (const table of ['FoodPref', 'BeautyProfile', 'FitnessProfile']) {
    const tcols = await columnsOf(table);
    if (!tcols.length) continue;
    const need = tcols.filter((c) => c.is_nullable === 'NO' && c.column_default === null);
    const names = []; const values = [];
    for (const c of need) {
      if (c.column_name === 'id') { names.push('id'); values.push(randomUUID()); }
      else if (c.column_name === 'userId') { names.push('userId'); values.push(user.id); }
      else if (/At$/.test(c.column_name)) { names.push(c.column_name); values.push(new Date()); }
      else { console.warn(`  ~ ${table}.${c.column_name} is required and has no default - ${table} row not seeded`); names.length = 0; break; }
    }
    if (!names.length) continue;
    await dev.query(
      `INSERT INTO "${table}" (${names.map(q).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT ("userId") DO NOTHING`, values);
  }
  await dev.query('COMMIT');

  console.log(`  ok  @${handle} (${user.id}) is on the developer copy with the same password.`);
  if (skipped.length) console.log(`  ~   not copied (the developer copy has no such column): ${skipped.join(', ')}`);
  console.log('      Sign in at https://dev.togethercity.app');
} catch (e) {
  await dev.query('ROLLBACK').catch(() => {});
  die(e.message);
} finally {
  await live.end();
  await dev.end();
}
