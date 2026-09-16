/**
 * ── HOW THE SERVER IS DOING, SINCE IT STARTED (owner, 16 Sep) ──────────────
 *
 * Counts kept in memory by the insights interceptor: requests, server errors
 * (5xx), and response times, in five-minute buckets for the last day. They
 * describe THIS server process since it last started, and the dashboard says
 * so; a deploy starts them again. No path, user or body is kept.
 */
const BUCKET_MS = 5 * 60_000;
const KEEP = (24 * 60) / 5;

interface Bucket { at: number; requests: number; errors: number; ms: number[] }

export class RequestStats {
  readonly startedAt = Date.now();
  private buckets: Bucket[] = [];
  private total = 0;
  private totalErrors = 0;

  record(status: number, ms: number, now = Date.now()): void {
    const at = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    let b = this.buckets[this.buckets.length - 1];
    if (!b || b.at !== at) {
      b = { at, requests: 0, errors: 0, ms: [] };
      this.buckets.push(b);
      if (this.buckets.length > KEEP) this.buckets.shift();
    }
    b.requests++;
    this.total++;
    if (status >= 500) { b.errors++; this.totalErrors++; }
    if (b.ms.length < 2000) b.ms.push(ms);
  }

  snapshot(now = Date.now()) {
    const since = now - 24 * 3600_000;
    const recent = this.buckets.filter((b) => b.at >= since);
    const all = recent.flatMap((b) => b.ms).sort((x, y) => x - y);
    const pct = (p: number) => (all.length ? all[Math.min(all.length - 1, Math.floor((p / 100) * all.length))] : null);
    const requests = recent.reduce((n, b) => n + b.requests, 0);
    const errors = recent.reduce((n, b) => n + b.errors, 0);
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      requests, errors,
      successRate: requests ? Math.round(((requests - errors) / requests) * 10000) / 100 : null,
      p50ms: pct(50), p95ms: pct(95),
      sinceStart: { requests: this.total, errors: this.totalErrors },
      timeline: recent.map((b) => ({ at: new Date(b.at).toISOString(), requests: b.requests, errors: b.errors })),
    };
  }
}

export type RequestSnapshot = ReturnType<RequestStats['snapshot']>;
