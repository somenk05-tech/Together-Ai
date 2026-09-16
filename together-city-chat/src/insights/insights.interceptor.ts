import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MemberDayService } from './member-day.service';
import { RequestStats } from './request-stats';

/** The one process-wide counter, shared with the dashboard. */
export const REQUEST_STATS = new RequestStats();

/**
 * Every HTTP request: its status and time go into REQUEST_STATS, and a
 * signed-in one marks its member active for the day (member-day.service.ts).
 * Never delays or changes a response.
 */
@Injectable()
export class InsightsInterceptor implements NestInterceptor {
  constructor(private readonly days: MemberDayService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const started = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<{ url?: string; originalUrl?: string; user?: { sub?: string } }>();
    const done = (status: number) => {
      REQUEST_STATS.record(status, Date.now() - started);
      const uid = req.user?.sub;
      if (uid && status < 400) this.days.touch(uid, req.originalUrl ?? req.url ?? '');
    };
    return next.handle().pipe(tap({
      next: () => done(http.getResponse<{ statusCode?: number }>().statusCode ?? 200),
      error: (e: { status?: number; getStatus?: () => number }) => done(e?.getStatus?.() ?? e?.status ?? 500),
    }));
  }
}
