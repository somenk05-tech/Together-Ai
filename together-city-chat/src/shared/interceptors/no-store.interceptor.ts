import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../public.decorator';

/**
 * Every authenticated response is per-citizen and must never be stored by a
 * browser, a proxy, or a CDN. Without this, a shared cache in front of the API
 * can hand user A's payload to user B — one of the classic causes of the
 * "new account sees someone else's data" bug.
 *
 * `Vary` is set alongside it so that any cache which does key on the request
 * keys on the credential rather than the URL alone.
 *
 * Public routes are left alone: they carry no citizen data and benefit from
 * ordinary caching.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) {
      const res = context.switchToHttp().getResponse<{ setHeader?: (k: string, v: string) => void }>();
      res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader?.('Pragma', 'no-cache');
      res.setHeader?.('Vary', 'Authorization, Cookie, Origin');
    }
    return next.handle();
  }
}
