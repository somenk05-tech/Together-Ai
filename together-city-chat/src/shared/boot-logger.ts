import { ConsoleLogger, type LogLevel } from '@nestjs/common';

/**
 * THE BOOT LOG DID NOT FIT DOWN THE PIPE, AND THE PIPE SAID SO.
 *
 * Railway, 28 Aug, seventeen seconds after start:
 *
 *   Railway rate limit of 500 logs/sec reached for replica, update your
 *   application to reduce the logging rate. Messages dropped: 92
 *
 * Ninety-two lines gone, at the one moment the log is worth reading. Boot is
 * where every configuration warning prints — `SENTRY_DSN is not set`,
 * `MIRA_LOG_SALT is not set`, `Photo review is not configured`,
 * `Could not WRITE the CORS policy` — and each of those is a sentence written
 * specifically to reach an operator. A dropped one reaches nobody, and the
 * operator's conclusion is that everything is fine.
 *
 * This is not hypothetical for this project. A morning was spent this same day
 * diagnosing broken photographs from the application log, and the answer was
 * not in it — the browser had discarded a 200 the server was happy with. A log
 * that is also silently lossy at boot is a worse instrument than that story
 * already showed it to be.
 *
 * WHAT IS ACTUALLY FILLING IT. Nest's RouterExplorer prints one line per
 * mapped route and RoutesResolver one per controller. This city has 571 route
 * decorators, so roughly six hundred lines arrive in a burst measured in
 * milliseconds — comfortably past 500/sec on their own, before a single line
 * of ours is written.
 *
 * Those six hundred lines say nothing an operator acts on. The route table is
 * knowable from the source, and from `/dev`, at any time and without a
 * redeploy. So they are dropped HERE rather than by the platform, which drops
 * whichever lines happen to be in flight — including ours.
 *
 * DROPPED BY CONTEXT, NOT BY LEVEL. Silencing the `log` level would have taken
 * the route table and also `[Bootstrap] Together City chat API on :4000`,
 * `[Sentry] Error reporting is on.` and `[MiraLedger] questions → …` — the
 * three lines that say the process came up correctly, and the ones this
 * session used to verify two fixes. The level is not the thing that makes a
 * line worth keeping; the context is.
 */
const FRAMEWORK_NOISE = new Set(['RouterExplorer', 'RoutesResolver']);

export class BootLogger extends ConsoleLogger {
  /**
   * Only `log` is filtered. A warning or an error from these contexts is a
   * real event — a route that failed to map is exactly the kind of thing an
   * operator needs — and is never dropped.
   */
  log(message: unknown, ...rest: unknown[]): void {
    const context = typeof rest[rest.length - 1] === 'string' ? (rest[rest.length - 1] as string) : this.context;
    if (context && FRAMEWORK_NOISE.has(context)) return;
    super.log(message as string, ...(rest as [string]));
  }
}

/** The levels the process emits. Unchanged — this file narrows by context. */
export const BOOT_LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log'];
