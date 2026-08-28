import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * ── A VARIABLE IN THE EXAMPLE THAT NOTHING READS ────────────────────────────
 *
 * `WEB_APP_URL` sat in `.env.example` with four lines of advice about how
 * leaving it unset would make email links read like phishing. It was set in
 * production because of that advice. Nothing read it: the verification email
 * carries a code and no links at all, so there was no origin to get wrong and
 * no fallback to fall back to. The link flow it described had been replaced.
 *
 * `env-manifest.ts` — the list `/dev` renders and the one checked at boot —
 * never listed it, and was right. But the manifest being right is invisible if
 * the example file can disagree with it silently, and the example file is what
 * a person copies when they stand up an environment.
 *
 * The cost is not the wasted variable. It is that a setting which looks
 * configured, in a table beside settings that matter, makes the whole table
 * read as verified. Somebody sets it, sees no error, and reasonably concludes
 * that everything else in the file was checked too.
 *
 * So: one direction, enforced. Every name we publish is a name we check.
 * The manifest may hold names the example omits — plenty are optional, or
 * platform-provided — but the example may not name anything the manifest has
 * never heard of.
 */
describe('every name we publish is a name we check', () => {
  const example = read('.env.example');
  const manifest = read('src/dev/env-manifest.ts');
  const published = [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
  const checked = new Set([...manifest.matchAll(/name:\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]));

  it('reads both files at all, so a rename cannot make this vacuous', () => {
    // A regex that silently matches nothing turns every assertion below green.
    expect(published.length).toBeGreaterThan(30);
    expect(checked.size).toBeGreaterThan(30);
  });

  it('names nothing in .env.example that env-manifest.ts has never heard of', () => {
    const orphans = published.filter((n) => !checked.has(n));
    // Named, not counted: the failure message has to say WHICH one, or the
    // next person deletes the assertion instead of the variable.
    expect(orphans).toEqual([]);
  });

  it('does not name WEB_APP_URL, which is the one that got here first', () => {
    // The specific regression. It came back once already, in the docs.
    expect(published).not.toContain('WEB_APP_URL');
    expect(read('docs/email-deliverability.md')).not.toMatch(/^\| `WEB_APP_URL`/m);
  });
});
