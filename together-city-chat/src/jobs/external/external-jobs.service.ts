import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { skillsInText } from '../jobs-engine';
import {
  ATS_SOURCES, type AtsSource, type AtsPosting,
  boardUrl, directoryUrl, isSafeSlug, normalize,
  isIndiaPosting, isRemoteLocation, seniorityFromTitle, companyFromSlug,
  AGGREGATOR_QUERIES, adzunaSearchUrl, JOOBLE_HOST, joobleRequestBody,
  normalizeAdzuna, normalizeJooble,
} from './ats';

/**
 * THE SCANNER — the only writer of ExternalJob rows.
 *
 * Every six hours it advances a rotating window through each ATS vendor's
 * public company directory (thousands of boards per vendor), reads each
 * board's public JSON, keeps the India postings, and reconciles them into
 * ExternalJob. Reconciliation is BOARD-SCOPED truth: when a board has just
 * been read, the rows for that board become exactly what it said — postings
 * it no longer lists are deleted, not left to advertise a closed role. Rows
 * from boards outside this run's window are simply not touched; `lastSeenAt`
 * says how fresh each row is and the matcher serves only the recent.
 *
 * Failure posture: a board that errors is skipped and counted, never
 * retried in-run; a stretch of consecutive network failures aborts the run
 * (a dead resolver fails every board in milliseconds — pressing on just
 * feeds it; the guard is career-ops' RESOLVER_FAILURE_LIMIT lesson). The
 * cron catches everything: a bad run costs one window, never the process.
 */
@Injectable()
export class ExternalJobsService implements OnModuleInit {
  private readonly log = new Logger('ExternalJobs');
  private running = false;

  // Window sizing: 3 vendors × 250 boards × ≤4 runs/day ≈ 3,000 board reads a
  // day at concurrency 6 — a full directory pass roughly every 5–6 days per
  // vendor, gentle enough that no vendor sees a burst.
  private static readonly BOARDS_PER_RUN = 250;
  private static readonly CONCURRENCY = 6;
  private static readonly FETCH_TIMEOUT_MS = 12_000;
  private static readonly CONSECUTIVE_FAILURE_LIMIT = 40;
  /** Rows not re-confirmed in this long stop being served (jobs.service). */
  static readonly SERVE_WINDOW_DAYS = 30;

  constructor(private prisma: PrismaService) {}

  /** First boot of a fresh deployment: an empty table means the citizen sees
   *  an empty shelf, so kick one window immediately — in the background,
   *  never blocking boot. `EXTERNAL_JOBS_SCAN=off` disables all scanning. */
  onModuleInit() {
    if (process.env.EXTERNAL_JOBS_SCAN === 'off') return;
    void this.prisma.externalJob.count().then((n) => {
      if (n === 0) void this.scan();
    }).catch(() => { /* table may not exist mid-migration; the cron will come */ });
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduled() {
    if (process.env.EXTERNAL_JOBS_SCAN === 'off') return;
    await this.scan();
  }

  /** One window across all sources. Never throws. */
  async scan(): Promise<void> {
    if (this.running) return; // a slow run and the next cron tick must not overlap
    this.running = true;
    try {
      for (const source of ATS_SOURCES) {
        await this.scanSource(source);
      }
      await this.scanAggregators();
      // Aggregator rows go stale differently from board rows: a board re-read
      // PROVES which of its postings closed, but an aggregator answers
      // queries, so a posting simply stops appearing. Two weeks unseen on an
      // aggregator = no longer offered. (Board rows keep the 30-day serve
      // window; their re-reads delete closed roles outright.)
      await this.prisma.externalJob.deleteMany({
        where: { source: { in: ['adzuna', 'jooble'] }, lastSeenAt: { lt: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
      });
    } catch (e) {
      this.log.warn(`scan aborted: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * THE AGGREGATORS — keyed, optional, and query-driven.
   *
   * Adzuna and Jooble are licensed APIs the owner holds keys for (see
   * .env.example); with no key a source is skipped and the log says so once
   * per sweep, because a silently absent source looks identical to a broken
   * one. Each sweep asks a rotating handful of the industry queries, so the
   * free tiers are never leaned on: 6 queries × ≤4 sweeps/day ≈ 24 calls a
   * day per aggregator. The requests are India-scoped by construction —
   * Adzuna's /jobs/in/ path, Jooble's location field — so results are taken
   * at the endpoint's word rather than re-filtered through the city list.
   */
  private static readonly QUERIES_PER_RUN = 6;

  private async scanAggregators(): Promise<void> {
    const adzunaId = process.env.ADZUNA_APP_ID, adzunaKey = process.env.ADZUNA_APP_KEY;
    const joobleKey = process.env.JOOBLE_API_KEY;

    if (adzunaId && adzunaKey) {
      await this.scanQueries('adzuna', (q) => this.fetchJson(adzunaSearchUrl(adzunaId, adzunaKey, q)).then(normalizeAdzuna));
    } else this.log.log('adzuna: no ADZUNA_APP_ID/ADZUNA_APP_KEY — skipped');

    if (joobleKey) {
      await this.scanQueries('jooble', (q) =>
        this.fetchJson(`${JOOBLE_HOST}${encodeURIComponent(joobleKey)}`, { method: 'POST', body: joobleRequestBody(q) }).then(normalizeJooble));
    } else this.log.log('jooble: no JOOBLE_API_KEY — skipped');
  }

  private async scanQueries(source: 'adzuna' | 'jooble', run: (q: string) => Promise<AtsPosting[]>): Promise<void> {
    const cursor = await this.prisma.externalScanCursor.findUnique({ where: { ats: source } });
    const start = (cursor?.offset ?? 0) % AGGREGATOR_QUERIES.length;
    let kept = 0, failed = 0;
    for (let i = 0; i < ExternalJobsService.QUERIES_PER_RUN; i++) {
      const query = AGGREGATOR_QUERIES[(start + i) % AGGREGATOR_QUERIES.length];
      try {
        const postings = await run(query);
        const now = new Date();
        for (const p of postings) {
          const row = this.toRow(source, `q:${query.replace(/\s+/g, '-')}`, p, now);
          await this.prisma.externalJob.upsert({
            where: { url: row.url },
            update: { title: row.title, company: row.company, location: row.location, remote: row.remote, blurb: row.blurb, skills: row.skills, seniority: row.seniority, salaryLpa: row.salaryLpa, postedAt: row.postedAt, lastSeenAt: now },
            create: row,
          });
          kept++;
        }
      } catch {
        failed++; // one query failing must not cost the rest of the handful
      }
    }
    const nextOffset = (start + ExternalJobsService.QUERIES_PER_RUN) % AGGREGATOR_QUERIES.length;
    await this.prisma.externalScanCursor.upsert({
      where: { ats: source },
      update: { offset: nextOffset },
      create: { ats: source, offset: nextOffset },
    });
    this.log.log(`${source}: ${ExternalJobsService.QUERIES_PER_RUN} queries from #${start} — ${kept} postings, ${failed} queries failed`);
  }

  private async scanSource(source: AtsSource): Promise<void> {
    const slugs = await this.fetchDirectory(source);
    if (!slugs.length) return;

    const cursor = await this.prisma.externalScanCursor.findUnique({ where: { ats: source } });
    const start = (cursor?.offset ?? 0) % slugs.length;
    const window: string[] = [];
    for (let i = 0; i < Math.min(ExternalJobsService.BOARDS_PER_RUN, slugs.length); i++) {
      window.push(slugs[(start + i) % slugs.length]);
    }

    let kept = 0, failed = 0, consecutiveFailures = 0;
    // simple promise-pool: CONCURRENCY boards in flight, order irrelevant
    const queue = [...window];
    const worker = async () => {
      for (;;) {
        const slug = queue.shift();
        if (slug === undefined) return;
        if (consecutiveFailures >= ExternalJobsService.CONSECUTIVE_FAILURE_LIMIT) return;
        try {
          const n = await this.scanBoard(source, slug);
          kept += n;
          consecutiveFailures = 0;
        } catch {
          failed++;
          consecutiveFailures++;
        }
      }
    };
    await Promise.all(Array.from({ length: ExternalJobsService.CONCURRENCY }, worker));

    if (consecutiveFailures >= ExternalJobsService.CONSECUTIVE_FAILURE_LIMIT) {
      // network is down, not 40 boards in a row coincidentally broken — stop
      // and do NOT advance the cursor: this window has not really been read.
      this.log.warn(`${source}: aborted after ${consecutiveFailures} consecutive failures`);
      return;
    }

    const nextOffset = (start + window.length) % slugs.length;
    await this.prisma.externalScanCursor.upsert({
      where: { ats: source },
      update: { offset: nextOffset },
      create: { ats: source, offset: nextOffset },
    });
    this.log.log(`${source}: window ${start}..${start + window.length} of ${slugs.length} boards — ${kept} India postings, ${failed} boards failed`);
  }

  /** Read one board, keep its India postings, make the table say exactly what
   *  the board said. Returns how many India postings the board carries now. */
  private async scanBoard(source: AtsSource, slug: string): Promise<number> {
    if (!isSafeSlug(slug)) return 0; // third-party directory entry — skip, never interpolate
    const json = await this.fetchJson(boardUrl(source, slug));
    const postings = normalize(source, json, companyFromSlug(slug)).filter((p) => isIndiaPosting(p.location));

    const now = new Date();
    for (const p of postings) {
      const row = this.toRow(source, slug, p, now);
      await this.prisma.externalJob.upsert({
        where: { url: row.url },
        update: { title: row.title, company: row.company, location: row.location, remote: row.remote, blurb: row.blurb, skills: row.skills, seniority: row.seniority, postedAt: row.postedAt, lastSeenAt: now },
        create: row,
      });
    }
    // Board-scoped reconciliation: this board was READ, so rows it no longer
    // lists are gone — a closed role must not keep matching citizens.
    await this.prisma.externalJob.deleteMany({
      where: { source, boardSlug: slug, url: { notIn: postings.map((p) => p.url) } },
    });
    return postings.length;
  }

  private toRow(source: AtsSource | 'adzuna' | 'jooble', slug: string, p: AtsPosting, now: Date) {
    const text = `${p.title}. ${p.description}`;
    return {
      source,
      boardSlug: slug,
      company: p.company || companyFromSlug(slug),
      title: p.title,
      location: p.location,
      remote: isRemoteLocation(p.location),
      url: p.url,
      // the posting's own words, trimmed — never a sentence the city wrote
      blurb: p.description.slice(0, 220),
      skills: skillsInText(text).join(','),
      seniority: seniorityFromTitle(p.title),
      salaryLpa: p.salaryLpa ?? 0,
      postedAt: p.postedAt ? new Date(p.postedAt) : null,
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  private async fetchDirectory(source: AtsSource): Promise<string[]> {
    try {
      const json = await this.fetchJson(directoryUrl(source));
      return Array.isArray(json) ? json.filter((s): s is string => typeof s === 'string' && isSafeSlug(s)) : [];
    } catch (e) {
      this.log.warn(`${source}: directory fetch failed: ${(e as Error).message}`);
      return [];
    }
  }

  private async fetchJson(url: string, opts?: { method?: string; body?: string }): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ExternalJobsService.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        redirect: 'error',
        method: opts?.method ?? 'GET',
        body: opts?.body,
        headers: {
          accept: 'application/json',
          'user-agent': 'TogetherCity-JobsHub/1.0 (+https://togethercity.app)',
          ...(opts?.body ? { 'content-type': 'application/json' } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
