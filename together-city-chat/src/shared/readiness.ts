/**
 * Is this instance ready to be given traffic?
 *
 * WHY THIS EXISTS. render.yaml shipped with `healthCheckPath: ""` and the
 * comment "no /health route yet" — which stopped being true a long time ago.
 * With it empty, Render does a TCP port check: the moment Nest binds the port
 * the instance is declared healthy and users are routed to it. That is several
 * minutes before it can actually answer, because boot then loads an
 * 11,000-recipe corpus twice over and runs a nutrition QA pass across every
 * row of it. The first citizen through the door waits for all of that, or is
 * killed by the proxy while waiting.
 *
 * A PROCESS-LEVEL SINGLETON, NOT A NEST PROVIDER, on purpose. Readiness is a
 * property of the process, there is exactly one of it, and wiring it through DI
 * would mean the health module importing the nutrition module — a dependency
 * from the thing that must always answer to the thing that might be busy.
 *
 * IT CANNOT WEDGE A DEPLOY. If warm-up throws, or takes longer than the cap,
 * the instance reports ready anyway. An instance serving slowly is a bad
 * afternoon; a deploy that never goes healthy is an outage.
 */
const CAP_MS = 90_000;

let ready = false;
let startedAt = Date.now();
const stages = new Set<string>();
const done = new Set<string>();

export const readiness = {
  /** Name a stage boot must finish before traffic arrives. */
  expect(stage: string): void {
    if (ready) return;
    stages.add(stage);
  },
  /** Mark one finished — whether it succeeded or gave up. Both mean "no longer
   *  a reason to hold traffic back". */
  settle(stage: string): void {
    done.add(stage);
    if (stages.size > 0 && done.size >= stages.size) ready = true;
  },
  reset(): void {
    ready = false; startedAt = Date.now(); stages.clear(); done.clear();
  },
  get isReady(): boolean {
    return ready || Date.now() - startedAt > CAP_MS;
  },
  get state(): { ready: boolean; pending: string[]; forced: boolean } {
    const pending = [...stages].filter((s) => !done.has(s));
    return { ready: this.isReady, pending, forced: !ready && Date.now() - startedAt > CAP_MS };
  },
};
