import * as fs from 'fs';
import * as path from 'path';
import { BootLogger, BOOT_LOG_LEVELS } from './boot-logger';

/**
 * Railway drops log lines above 500/sec, and on 28 Aug it dropped 92 of them
 * seventeen seconds into boot — the moment the log carries every configuration
 * warning the process knows how to give: `SENTRY_DSN is not set`,
 * `MIRA_LOG_SALT is not set`, `Photo review is not configured`,
 * `Could not WRITE the CORS policy`. A dropped warning reaches nobody, and the
 * operator concludes everything is fine.
 *
 * `BootLogger` drops Nest's route table instead, so the platform does not have
 * to choose for us. These assertions pin the two halves of that: the noise goes
 * and NOTHING ELSE DOES — the second half being the one that matters, because
 * a logger that over-filters is the same defect wearing our name instead of
 * Railway's.
 */
describe('the boot log fits down the pipe', () => {
  function capture() {
    const seen: string[] = [];
    const log = new BootLogger('Nest', { logLevels: BOOT_LOG_LEVELS });
    // ConsoleLogger writes through printMessages; intercept at the sink so the
    // real filtering path runs rather than a reimplementation of it.
    (log as unknown as { printMessages(m: unknown[], c?: string): void }).printMessages =
      (messages: unknown[], context?: string) => { seen.push(`${context ?? ''}:${String(messages[0])}`); };
    return { log, seen };
  }

  it('drops the route table', () => {
    const { log, seen } = capture();
    log.log('Mapped {/api/dating/profile, GET} route', 'RouterExplorer');
    log.log('DatingController {/api/dating}:', 'RoutesResolver');
    expect(seen).toEqual([]);
  });

  it('keeps every line an operator acts on', () => {
    const { log, seen } = capture();
    log.log('Together City chat API on :4000 (WS + REST)', 'Bootstrap');
    log.log('Error reporting is on.', 'Sentry');
    log.log('questions → /app/var/mira/asks-<day>.jsonl', 'MiraLedger');
    expect(seen).toHaveLength(3);
  });

  it('never drops a warning or an error, whatever its context', () => {
    // A route that FAILS to map is exactly what an operator needs, and it
    // arrives under the same context as the six hundred lines we discard.
    const { log, seen } = capture();
    log.warn('could not map a route', 'RouterExplorer');
    log.error('RoutesResolver exploded', '', 'RoutesResolver');
    expect(seen).toHaveLength(2);
  });

  it('is wired into bootstrap, or it filters nothing at all', () => {
    // The class can be perfect and unused. This is the assertion that would
    // have caught that.
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toMatch(/logger:\s*new BootLogger\(/);
  });
});
