import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { DEPRECATED_KEY, DeprecationNotice } from '../deprecated.decorator';

interface Req {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface Res {
  setHeader?: (key: string, value: string) => void;
}

/**
 * Turns @Deprecated(...) into response headers a client can act on, and into a
 * log line an engineer can count.
 *
 * The log deliberately carries the user agent and nothing else identifying: the
 * question this data answers is "is anyone still on the old build", and the
 * answer does not need to name them.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly log = new Logger('Deprecated');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const notice = this.reflector.getAllAndOverride<DeprecationNotice>(DEPRECATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!notice) return next.handle();

    const http = context.switchToHttp();
    const res = http.getResponse<Res>();
    const req = http.getRequest<Req>();

    // RFC 8594: an @-prefixed unix timestamp for Deprecation, an HTTP-date for
    // Sunset. Both are parsed by tooling; a prose string is not.
    res.setHeader?.('Deprecation', `@${Math.floor(Date.parse(notice.since) / 1000)}`);
    res.setHeader?.('Sunset', new Date(notice.sunset).toUTCString());
    res.setHeader?.('Link', `<${notice.replacement}>; rel="successor-version"`);

    const ua = req.headers?.['user-agent'];
    this.log.warn(
      `${req.method ?? '?'} ${req.originalUrl ?? req.url ?? '?'} — removed, sunset ${notice.sunset}, ` +
        `use ${notice.replacement} (ua: ${typeof ua === 'string' ? ua.slice(0, 80) : 'unknown'})`,
    );

    return next.handle();
  }
}
