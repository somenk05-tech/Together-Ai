import { Logger } from '@nestjs/common';

/**
 * The end of `.catch(() => undefined)`.
 *
 * ~246 call sites swallowed failures with a bare catch — three different
 * intents wearing one costume: "this is optional", "this is best-effort but I
 * want to know", and "this must not fail and I have not thought about what
 * happens if it does". Replacing all of them with logging would be as wrong
 * as the silence was: the fix is that the author says which one they meant.
 *
 * `swallow(p, context, meta)` — best-effort, but visible. The failure lands
 * in the logs under [swallowed] with enough context to act on. This is the
 * default choice.
 *
 * `optional(p)` — genuinely optional: absence is a normal outcome, not an
 * incident. Use it rarely, and only where a comment nearby says why silence
 * is correct.
 *
 * src/shared/swallow-ceiling.json counts the bare catches that remain; the
 * count may only go down. See swallow.spec.ts.
 *
 * PII discipline: `meta` goes to the logs verbatim. IDs and channel names are
 * fine; email addresses, phone numbers and message bodies are not.
 */
const log = new Logger('swallowed');

export async function swallow<T>(
  p: Promise<T> | undefined,
  context: string,
  meta: Record<string, unknown> = {},
): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const detail = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    log.warn(`${context} failed — ${reason}${detail}`);
    return undefined;
  }
}

/**
 * Drop-in replacement for a bare catch HANDLER, for call sites where
 * restructuring into swallow(p, ...) would disturb a long expression chain:
 * `.catch(() => null)` becomes `.catch(swallowed('context', null))`.
 * Same log line as swallow(); the fallback keeps its exact type.
 */
export const swallowed = <F>(context: string, fallback: F, meta: Record<string, unknown> = {}) =>
  (e: unknown): F => {
    const reason = e instanceof Error ? e.message : String(e);
    const detail = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    log.warn(`${context} failed — ${reason}${detail}`);
    return fallback;
  };

/** Genuinely optional: absence is a normal outcome, not an incident. */
export const optional = <T>(p: Promise<T> | undefined): Promise<T | undefined> =>
  Promise.resolve(p).then(
    (v) => v,
    () => undefined,
  );
