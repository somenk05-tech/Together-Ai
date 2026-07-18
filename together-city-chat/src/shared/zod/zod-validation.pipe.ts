import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema, ZodTypeAny, z } from 'zod';

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
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Helper for validating arbitrary payloads inside gateways/services. */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
