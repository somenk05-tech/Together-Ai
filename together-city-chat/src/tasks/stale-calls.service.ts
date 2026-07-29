import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CallsService } from '../calls/calls.service';

/**
 * The job that stops a call ringing forever.
 *
 * A call ends when somebody hangs up, and the one case that produces no hang-up
 * is the one that happens most: the caller closes the tab, or the browser is
 * killed, or the network drops mid-ring. Nothing arrives to end the call, so it
 * stays "ringing" — which matters beyond a stuck badge, because a conversation
 * holds at most one live call and a stuck one blocks the next attempt.
 *
 * Idempotent: closing writes are guarded on the call still being live, so a
 * second pass over the same row does nothing rather than double-ending it.
 */
@Injectable()
export class StaleCallsService {
  private readonly logger = new Logger('StaleCalls');

  constructor(private readonly calls: CallsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const closed = await this.calls.sweepStale();
      if (closed) this.logger.log(`closed ${closed} unanswered/abandoned call(s)`);
    } catch (e) {
      this.logger.warn(`stale call sweep failed: ${(e as Error).message}`);
    }
  }
}
