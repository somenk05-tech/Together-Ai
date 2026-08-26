import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { report } from '../errors/sentry';

/** Uniform error envelope + logging for all REST errors. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };
    if (status >= 500) {
      this.logger.error(exception);
      const req = ctx.getRequest<Request>();
      // The route pattern and method, never the body or the citizen.
      report(exception, { method: req?.method, route: (req?.route as { path?: string } | undefined)?.path ?? req?.path, status });
    }
    // Error bodies can carry citizen data (validation echoes, not-found detail)
    // and a 401 must never be cached against a URL a signed-in user will retry.
    // The NoStoreInterceptor doesn't run on the exception path, so set it here.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization, Cookie, Origin');
    res.status(status).json(typeof payload === 'string' ? { message: payload } : payload);
  }
}
