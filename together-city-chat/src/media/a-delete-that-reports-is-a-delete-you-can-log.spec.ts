/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StorageProvider } from './storage.provider';

/**
 * ── A DELETE THAT REPORTS IS A DELETE YOU CAN LOG ───────────────────────────
 *
 * `deleteObject` returned `void` and caught its own error, so "the bucket
 * refused" and "the object is deleted" were the same answer.
 *
 * The cost was not hypothetical, and it was not in this file. TWO callers had
 * already written the careful version of the failure — `purgePostObjects` in
 * AuthService and `purgeListingObjects` in LocalServicesService — each
 * collecting the keys that failed and logging them, on the stated reasoning
 * that once the rows are deleted that log line is the only record of what was
 * left behind. Neither could ever fire. The `catch` blocks were unreachable,
 * the `failed` arrays were always empty, and `removed` counted every failure
 * as a success: a deletion that stranded a hundred photographs logged
 * "removed 100 post object(s)".
 *
 * Worse, the spec covering that path stubbed `deletePrivateObject` to THROW —
 * something the real provider could not do — so the orphan branch was proved
 * against a fiction. That is the failure this file is really about: a mock may
 * only do what the thing it stands for can do.
 *
 * Two halves here:
 *
 *   · the provider tells the truth, including when it is not configured;
 *   · every caller reads the answer, or says in writing why it does not.
 */

describe('the provider says whether the object is gone', () => {
  const provider = (send: () => Promise<unknown>) => {
    const p = Object.create(StorageProvider.prototype) as StorageProvider;
    (p as any).s3 = { send };
    (p as any).bucket = 'b';
    (p as any).healthBucket = 'hb';
    (p as any).logger = { error: () => undefined, warn: () => undefined, log: () => undefined };
    return p;
  };

  it('is true when the object was deleted', async () => {
    await expect(provider(async () => ({})).deleteObject('k')).resolves.toBe(true);
  });

  it('is FALSE when the bucket refused, instead of swallowing it', async () => {
    await expect(provider(async () => { throw new Error('AccessDenied'); }).deleteObject('k')).resolves.toBe(false);
  });

  it('is false when storage is not configured, because nothing was deleted', async () => {
    // The old code returned early here and its callers read that as success.
    // An unconfigured provider has not removed anything; claiming otherwise is
    // the same lie one level up.
    const p = provider(async () => ({}));
    (p as any).s3 = null;
    await expect(p.deleteObject('k')).resolves.toBe(false);
  });

  it('is true for an empty key, because there was nothing to delete', async () => {
    await expect(provider(async () => ({})).deleteObject('')).resolves.toBe(true);
  });

  it('carries the answer through the two named wrappers', async () => {
    const bad = provider(async () => { throw new Error('nope'); });
    await expect(bad.deleteHealthObject('k')).resolves.toBe(false);
    await expect(bad.deletePrivateObject('k')).resolves.toBe(false);
    const good = provider(async () => ({}));
    await expect(good.deleteHealthObject('k')).resolves.toBe(true);
    await expect(good.deletePrivateObject('k')).resolves.toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

const SRC = join(__dirname, '..');
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { sources(full, out); continue; }
    if (!name.endsWith('.ts') || name.includes('.spec.')) continue;
    if (full.endsWith(join('media', 'storage.provider.ts'))) continue; // where they are defined
    out.push(full);
  }
  return out;
}

/**
 * The statement a call sits in: back to the previous `;`, `{` or `}`, forward
 * to the next `;`. Crude on purpose — it only has to be wide enough to see how
 * the value is treated, and being too wide makes this guard more permissive,
 * never less accurate about a real miss.
 */
function statementAround(text: string, at: number): string {
  let start = at;
  while (start > 0 && !';{}\n'.includes(text[start - 1])) start -= 1;
  // Walk back over a chained expression that began on an earlier line.
  while (start > 1 && text.slice(start - 2, start).trim() === '') start -= 1;
  const end = text.indexOf(';', at);
  return text.slice(start, end < 0 ? at + 200 : end + 1);
}

describe('every caller reads the answer, or says why it does not', () => {
  /**
   * The recurrence risk is a NEW call site written the way the old ones were.
   * A caller may consume the boolean (`if (await …)`, assign it, return it),
   * hand the promise to the codebase's own swallow/`.catch` plumbing, or carry
   * `// orphan-ok:` with a reason. Ignoring it silently is the one shape that
   * is not allowed, because that is the shape that shipped.
   */
  const CALL = /\.(deleteObject|deleteHealthObject|deletePrivateObject)\(/g;

  it('finds the call sites at all', () => {
    const n = sources(SRC).reduce((acc, f) => acc + (readFileSync(f, 'utf8').match(CALL)?.length ?? 0), 0);
    // A guard that walks a tree and finds nothing passes forever. This number
    // is a floor, not a ceiling — it exists so an emptied search fails loudly.
    expect(n).toBeGreaterThan(15);
  });

  it('leaves no call site that drops the answer on the floor', () => {
    const ignored: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(CALL)) {
        const stmt = statementAround(text, m.index ?? 0);
        /* The call is CONSUMED when it sits on the right of an assignment, a
           return, or inside a condition or another call — which is what these
           operators mean — or when the promise is handed to the codebase's own
           swallow / .catch / .then plumbing. A bare `await store.delete…(k);`
           matches none of them, and that is the one shape that shipped. */
        const before = stmt.slice(0, stmt.indexOf('.delete'));
        const consumed = /(=|\(|!|\?|:|\breturn\b)\s*(await\s+)?[\w.[\]]*$/.test(before)
          || /\bswallow\(/.test(stmt)
          || /\.catch\(/.test(stmt)
          || /\.then\(/.test(stmt)
          || /orphan-ok:/.test(stmt);
        if (!consumed) ignored.push(`${file.slice(SRC.length + 1)} — ${stmt.trim().replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
    expect(ignored).toEqual([]);
  });
});
