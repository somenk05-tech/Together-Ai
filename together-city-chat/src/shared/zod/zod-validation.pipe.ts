import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodIssue, ZodSchema, ZodTypeAny, z } from 'zod';

/**
 * "Validation failed" is not a sentence anybody can act on.
 *
 * That string was the `message` on every 400 this pipe has ever thrown, across
 * the whole API — and `message` is exactly what the web reads and shows.
 * Somebody drawing a tarot spread saw *Validation failed* in red under the
 * button, with no way to know whether their question was too short, too long,
 * or perfectly fine. The real reasons were sitting in `issues`, one per field,
 * and nothing ever read them.
 *
 * So the message is now BUILT FROM the issues. `issues` is still returned
 * unchanged, because a client that wants to mark the offending field needs the
 * paths.
 *
 * WHAT MAKES A GOOD MESSAGE IS THE SCHEMA, NOT THIS FILE. Zod's default text
 * ("String must contain at least 5 character(s)") is clumsy but true, and true
 * beats "Validation failed" every time. Where a schema author wrote a human
 * message — 'Use YYYY-MM-DD', 'Turn all the cards before the reading is drawn'
 * — the citizen now gets that instead. This file's only job is to stop throwing
 * those away.
 */
function sentenceFor(issues: ZodIssue[]): string {
  const said = issues
    .map((i) => i.message.trim())
    .filter((m) => m.length > 0 && m.toLowerCase() !== 'required');
  if (said.length) return [...new Set(said)].slice(0, 3).join(' ');

  /**
   * Every issue was a bare "Required", which names no field and helps nobody.
   *
   * Name them — and say the thing this shape of failure usually means. A
   * request missing a field the server requires is, far more often than not, a
   * browser tab running a build from before that field existed. The web and the
   * API deploy separately, so there is always a window where that is true, and
   * "please refresh" is the one instruction that actually fixes it.
   */
  const fields = [...new Set(issues.map((i) => i.path.join('.')).filter(Boolean))];
  const named = fields.length ? ` (${fields.slice(0, 4).join(', ')})` : '';
  return `This request is missing something the server needs${named}. `
    + 'If this page has been open a while, refresh it and try again.';
}

function refuse(issues: ZodIssue[]): never {
  throw new BadRequestException({
    message: sentenceFor(issues),
    issues: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * Validates request payloads (REST bodies, socket DTOs) against a Zod schema.
 * Usage: @UsePipes(new ZodValidationPipe(MySchema))
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Only validate the request payload (body/query). When applied via @UsePipes at
    // the method level, the pipe also runs against custom params like @CurrentUser()
    // and @Param() — validating those against a body schema wrongly fails ("field
    // required"). Skip anything that isn't the actual payload.
    if (metadata.type !== 'body' && metadata.type !== 'query') return value;
    const result = this.schema.safeParse(value);
    if (!result.success) refuse(result.error.issues);
    return result.data;
  }
}

/** Helper for validating arbitrary payloads inside gateways/services. */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) refuse(result.error.issues);
  return result.data;
}

/** Exported for the guard that keeps this readable — see zod-messages.spec.ts. */
export const messageForIssues = sentenceFor;
