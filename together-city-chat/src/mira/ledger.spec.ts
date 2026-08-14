import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cityDay, MiraLedger } from './ledger';

/** The ledger writes on a floated promise, so a test has to let the microtask
 *  and the fs callback both land. One tick is not enough; a real await is. */
const settle = () => new Promise((r) => setTimeout(r, 20));

function ledgerIn(dir: string, salt = 'test-salt'): MiraLedger {
  process.env.MIRA_LOG_DIR = dir;
  process.env.MIRA_LOG_SALT = salt;
  return new MiraLedger();
}

const ENTRY = {
  userId: 'usr_abc',
  text: 'whats my balance',
  lane: 'RETRIEVE',
  confidence: 0.8231,
  capability: 'financial GET wallet',
  outcome: 'capability' as const,
  levity: 3,
};

describe('Mira writes down what she was asked', () => {
  const KEEP = { dir: process.env.MIRA_LOG_DIR, salt: process.env.MIRA_LOG_SALT };
  afterAll(() => {
    process.env.MIRA_LOG_DIR = KEEP.dir;
    process.env.MIRA_LOG_SALT = KEEP.salt;
  });

  /**
   * THE DAY IS THE CITY'S, NOT THE SERVER'S.
   *
   * Railway runs in UTC. An Indian evening — 9pm on the 14th — is 15:30 UTC on
   * the 14th, but 1am on the 15th is 19:30 UTC on the FOURTEENTH. A UTC file
   * name splits one evening across two days and joins two evenings into one,
   * which is the specific failure that makes a daily file useless.
   */
  it('files a question under the city’s day, not the server’s', () => {
    // 2026-08-14T19:30:00Z is 2026-08-15T01:00 in Kolkata.
    expect(cityDay(new Date('2026-08-14T19:30:00Z'))).toBe('2026-08-15');
    // …and 2026-08-14T15:30:00Z is 9pm the same evening.
    expect(cityDay(new Date('2026-08-14T15:30:00Z'))).toBe('2026-08-14');
  });

  it('writes one JSON object per line, into the day’s file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    const at = new Date('2026-08-14T15:30:00Z');
    led.record(ENTRY, at);
    await settle();

    const file = join(dir, 'asks-2026-08-14.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row.q).toBe('whats my balance');
    expect(row.lane).toBe('RETRIEVE');
    expect(row.capability).toBe('financial GET wallet');
    expect(row.outcome).toBe('capability');
    expect(row.answered).toBe(true);
    /** Rounded, because fifteen decimal places of a router score is noise in a
     *  file a person is meant to read. */
    expect(row.confidence).toBe(0.82);
  });

  /**
   * THE QUESTION IS IN THE FILE. THE ASKER IS NOT.
   *
   * The point of the hash is that the file is still useful — you can count
   * distinct citizens, and you can see one person asking the same unanswerable
   * thing four times — while not being a list of what a named person asked.
   */
  it('records a stable hash and never the user id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    led.record(ENTRY, new Date('2026-08-14T15:30:00Z'));
    led.record({ ...ENTRY, text: 'and my last few charges' }, new Date('2026-08-14T15:31:00Z'));
    await settle();

    const body = readFileSync(join(dir, 'asks-2026-08-14.jsonl'), 'utf8');
    expect(body).not.toContain('usr_abc');
    const rows = body.trim().split('\n').map((l) => JSON.parse(l) as { who: string });
    // Same citizen, same hash — otherwise "how many people asked this" is
    // unanswerable and the field is decoration.
    expect(rows[0].who).toBe(rows[1].who);
    expect(rows[0].who).toMatch(/^[0-9a-f]{12}$/);
  });

  it('gives a different hash under a different salt', () => {
    const a = ledgerIn(mkdtempSync(join(tmpdir(), 'mira-')), 'salt-one').who('usr_abc');
    const b = ledgerIn(mkdtempSync(join(tmpdir(), 'mira-')), 'salt-two').who('usr_abc');
    expect(a).not.toBe(b);
  });

  /** A paste is not a question, and a disk is finite. */
  it('cuts a very long ask, and marks that it cut it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    led.record({ ...ENTRY, text: 'x'.repeat(4000) }, new Date('2026-08-14T15:30:00Z'));
    await settle();

    const row = JSON.parse(readFileSync(join(dir, 'asks-2026-08-14.jsonl'), 'utf8').trim()) as { q: string };
    expect(row.q).toHaveLength(500 + '…[cut]'.length);
    expect(row.q.endsWith('…[cut]')).toBe(true);
  });

  /**
   * RETENTION IS DELETING A FILE.
   *
   * Which is the whole argument for one file per day: expiring a log that is a
   * single growing file means parsing and rewriting it, and nobody does that,
   * so in practice such a log is kept forever.
   */
  it('drops files older than the retention window and keeps the rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    writeFileSync(join(dir, 'asks-2020-01-01.jsonl'), '{}\n');
    writeFileSync(join(dir, `asks-${cityDay(new Date())}.jsonl`), '{}\n');
    // Not ours, and not touched.
    writeFileSync(join(dir, 'notes.txt'), 'hello\n');

    await ledgerIn(dir).onModuleInit();

    const left = readdirSync(dir).sort();
    expect(left).toContain('notes.txt');
    expect(left).toContain(`asks-${cityDay(new Date())}.jsonl`);
    expect(left).not.toContain('asks-2020-01-01.jsonl');
  });

  /**
   * AND A BROKEN DISK DOES NOT BREAK AN ANSWER.
   *
   * The whole point of recording on a floated promise. If this ever throws
   * synchronously, one unwritable directory takes down every reply Mira gives.
   */
  it('never throws at the caller, even pointed at a path it cannot use', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const file = join(dir, 'a-file-not-a-directory');
    writeFileSync(file, 'x');
    const led = ledgerIn(file);
    await expect(led.onModuleInit()).resolves.toBeUndefined();
    expect(() => led.record(ENTRY)).not.toThrow();
    await settle();
  });
});
