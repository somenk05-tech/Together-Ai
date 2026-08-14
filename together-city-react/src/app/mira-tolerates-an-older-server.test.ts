import { describe, it, expect } from 'vitest';
import { MiraReplySchema } from '@/features/chat/mira/api';

/**
 * A NEW RESPONSE FIELD IS OPTIONAL ON THE CLIENT. ALWAYS.
 *
 * ── WHAT THIS COST ────────────────────────────────────────────────────────
 *
 * `mood` was added to Mira's reply and made required in the same commit. The
 * web app deploys to Vercel and the API deploys to Railway, INDEPENDENTLY — so
 * there is always a window where the new frontend is live against the old
 * backend. Minutes usually; longer when a build queues.
 *
 * In that window every turn threw. `schema.parse` rejected a reply that was
 * otherwise perfect, the mutation failed, and the citizen got "I'm not reaching
 * the city right now" — while the API sat there healthy, answering correctly,
 * unreachable only in the sense that the client refused to read the answer.
 *
 * ── WHY THIS IS A TEST AND NOT A NOTE ─────────────────────────────────────
 *
 * Because the failure is invisible on the machine that writes it. Locally the
 * two halves are always the same version, so the schema always matches and
 * every test passes. The defect exists ONLY in the gap between two deploys, and
 * nothing else in this repo looks at that gap.
 *
 * The guard is deliberately shaped as "parse what the OLD server sends" rather
 * than "assert this field is optional": a list of field names would need editing
 * every time one is added, which is the moment nobody is thinking about the
 * skew. A recorded historical payload keeps working without maintenance, and
 * fails the day somebody makes a new field required.
 */

/**
 * The reply as it was shipped in `5992d29` — the shape the deployed API sent
 * before any of the recent work. Frozen on purpose: do not add fields to it.
 * Its whole value is that it is OLD.
 */
const AS_FIRST_SHIPPED = {
  text: 'You have ₹48,200.',
  lane: 'RETRIEVE',
  capabilityId: 'financial GET wallet',
  confidence: 0.85,
  levity: 3,
  trace: ['route: matched financial GET wallet (0.85)'],
};

describe('the client reads a reply from a server older than itself', () => {
  it('parses the reply exactly as it was first shipped', () => {
    expect(() => MiraReplySchema.parse(AS_FIRST_SHIPPED)).not.toThrow();
  });

  it('parses it without the optional capability id, too', () => {
    const rest = { ...AS_FIRST_SHIPPED };
    delete (rest as Partial<typeof AS_FIRST_SHIPPED>).capabilityId;
    expect(() => MiraReplySchema.parse(rest)).not.toThrow();
  });

  /** The newer fields are read when they arrive and simply absent when they do
   *  not. Nothing in the thread may depend on one being there. */
  it('parses a reply from the current server as well', () => {
    const parsed = MiraReplySchema.parse({
      ...AS_FIRST_SHIPPED,
      mood: 'wry',
      goto: { label: 'Financial', path: '/financial' },
      choices: [{ label: 'Budgets', path: '/financial/budgets' }],
    });
    expect(parsed.mood).toBe('wry');
    expect(parsed.choices).toHaveLength(1);
  });

  /**
   * AND THE FIELDS THAT WERE ALWAYS THERE STAY REQUIRED.
   *
   * The rule is about NEW fields, not about giving up on validation. A reply
   * with no `text` is not an older server, it is a broken one, and the parse
   * should still refuse it — otherwise this guard quietly turns the schema into
   * a suggestion.
   */
  it('still refuses a reply that is actually malformed', () => {
    const noText = { ...AS_FIRST_SHIPPED };
    delete (noText as Partial<typeof AS_FIRST_SHIPPED>).text;
    expect(() => MiraReplySchema.parse(noText)).toThrow();
    expect(() => MiraReplySchema.parse({ ...AS_FIRST_SHIPPED, lane: 'DANCING' })).toThrow();
    expect(() => MiraReplySchema.parse({ ...AS_FIRST_SHIPPED, levity: 9 })).toThrow();
  });

  /**
   * AND SHE SAYS WHICH FAILURE IT WAS.
   *
   * "I'm not reaching the city right now" was the only thing she said for both
   * causes, and for this one it was false — the city answered. A surface that
   * reports the wrong failure sends the next person looking in the wrong place,
   * which is exactly what it did.
   */
  it('tells the two failures apart in the thread', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../features/chat/mira/MiraThread.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/instanceof ZodError/);
    expect(src).toMatch(/not speaking the same language/);
    expect(src).toMatch(/not reaching the city/);
  });
});
