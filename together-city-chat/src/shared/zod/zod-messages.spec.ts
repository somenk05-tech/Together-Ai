import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { z } from 'zod';
import { ZodValidationPipe, messageForIssues, parseOrThrow } from './zod-validation.pipe';

/**
 * The message a refused request carries is the message a citizen reads.
 *
 * Every 400 from this pipe used to say **"Validation failed"** — on the tarot
 * page, in red, under a button, with the real reason sitting unread in an
 * `issues` array two lines below it. Somebody with a perfectly good question
 * had no way to tell whether it was too short, too long, or fine.
 *
 * This file is here so that string cannot come back.
 */

const body = { type: 'body' } as const;

describe('a refused request says what was wrong', () => {
  it('never says "Validation failed"', () => {
    const pipe = new ZodValidationPipe(z.object({ question: z.string().min(5) }));
    try {
      pipe.transform({ question: 'hi' }, body);
      throw new Error('the pipe accepted something it should have refused');
    } catch (e) {
      const res = (e as { getResponse: () => { message: string } }).getResponse();
      expect(res.message).not.toBe('Validation failed');
      expect(res.message.toLowerCase()).not.toContain('validation failed');
    }
  });

  it('uses the schema author\'s own words when they wrote some', () => {
    // This is the whole mechanism: a good message is written where the rule is,
    // and the pipe's only job is to stop discarding it.
    const schema = z.object({
      picks: z.array(z.number()).min(1, 'Turn the cards before the reading is drawn.'),
    });
    try {
      new ZodValidationPipe(schema).transform({ picks: [] }, body);
      throw new Error('accepted');
    } catch (e) {
      const res = (e as { getResponse: () => { message: string } }).getResponse();
      expect(res.message).toBe('Turn the cards before the reading is drawn.');
    }
  });

  it('still returns the issues, so a client can mark the field', () => {
    try {
      new ZodValidationPipe(z.object({ a: z.string(), b: z.string() })).transform({}, body);
      throw new Error('accepted');
    } catch (e) {
      const res = (e as { getResponse: () => { issues: Array<{ path: string }> } }).getResponse();
      expect(res.issues.map((i) => i.path).sort()).toEqual(['a', 'b']);
    }
  });

  /**
   * THE FAILURE THAT LOOKS LIKE A BUG AND IS A DEPLOY.
   *
   * The web and the API ship separately, so there is always a window where a
   * browser tab is running a build from before a required field existed. Every
   * issue then reads "Required" — which names nothing and helps nobody — and the
   * citizen sees an error on a page that worked five minutes ago. Naming the
   * fields and saying "refresh" is the one instruction that fixes it.
   */
  it('tells somebody on a stale tab to refresh, and names what is missing', () => {
    const msg = messageForIssues([
      { code: 'invalid_type', expected: 'array', received: 'undefined', path: ['picks'], message: 'Required' },
    ] as never);
    expect(msg).toContain('picks');
    expect(msg.toLowerCase()).toContain('refresh');
  });

  it('does not repeat itself when several fields fail the same way', () => {
    const msg = messageForIssues([
      { code: 'custom', path: ['a'], message: 'Keep it under 300 characters.' },
      { code: 'custom', path: ['b'], message: 'Keep it under 300 characters.' },
    ] as never);
    expect(msg).toBe('Keep it under 300 characters.');
  });

  it('applies to parseOrThrow too — the gateways use that one', () => {
    try {
      parseOrThrow(z.object({ n: z.number().min(1, 'Pick at least one.') }), { n: 0 });
      throw new Error('accepted');
    } catch (e) {
      const res = (e as { getResponse: () => { message: string } }).getResponse();
      expect(res.message).toBe('Pick at least one.');
    }
  });
});

describe('the string is gone from the tree', () => {
  it('no source file hands a citizen the words "Validation failed"', () => {
    const SRC = join(__dirname, '..', '..');
    const offenders: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!full.endsWith('.ts') || full.endsWith('.spec.ts')) continue;
        // Comments stripped first — a file is allowed to EXPLAIN what it no
        // longer says. A guard that fires on its own explanation teaches people
        // to delete the explanation.
        const code = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
        if (/'Validation failed'|"Validation failed"/.test(code)) offenders.push(relative(SRC, full));
      }
    })(SRC);
    expect(offenders).toEqual([]);
  });
});
