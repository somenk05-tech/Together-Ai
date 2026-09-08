import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Background work, durable. (Owner decision, 26 Aug: BullMQ on the Redis
 * the app already has.)
 *
 * Until now every deferred piece of work — the reindex after a profile
 * save, the photo review after an upload — ran in this process off a `void`
 * promise, and a restart between the save and the scan lost it. Here a job
 * is a row in Redis: it survives the process, it retries, and one name can
 * be de-duplicated by id so a burst of saves is one scan.
 *
 * NAMED HANDLERS. Services register a handler for a job name at boot
 * (`handle`) and enqueue by the same name (`add`).
 *
 * ── TWO LANES, AND A ROLE (1M-DAU pass, 6 Sep) ──
 *
 * It used to be one queue with one worker at concurrency 4, in the API
 * process. Two things were wrong with that at scale, and they are different
 * problems with different fixes.
 *
 * FIRST, HEAD-OF-LINE BLOCKING. `transcode-video` may run for an hour — the
 * owner allows a 2 GB, 60-minute upload. Four queued videos took all four
 * slots, and the dating reindex, the photo review, the retry sweep and the
 * digest waited behind them. So a job now belongs to a LANE, each lane is
 * its own BullMQ queue with its own worker and its own concurrency, and a
 * long lane cannot starve a short one. `laneFor` is the whole routing table
 * and it is deliberately tiny: media, or everything else.
 *
 * SECOND, AND WORSE: THE ENCODE RAN ON THE BOX SERVING THE SOCKETS. libx264
 * at `veryfast` holds a full vCPU for as long as the video is long, on the
 * same process answering every HTTP route and carrying every WebSocket.
 * `JOBS=off` could stop that, but it also stopped ENQUEUEING — the queue
 * object was null, `add` returned false, and every caller fell back to doing
 * the work in-process, which is the exact thing we were trying to prevent.
 *
 * So producing and consuming are now separate:
 *
 *   JOBS_ROLE=api      produce only. Queues exist, no workers. This is what
 *                      the containers serving citizens should run.
 *   JOBS_ROLE=worker   produce and consume. The dedicated service.
 *   JOBS_ROLE=both     the old behaviour, and still the default, so a
 *                      single-container deployment and every local dev
 *                      machine keep working with no new variable to set.
 *
 * `JOBS=off` is unchanged and still means "no queue at all" — used by the
 * test environment, where the in-process fallback is what the specs assert.
 *
 * WHEN THE FALLBACK IS STILL RIGHT: a caller that gets `false` from `add`
 * knows the work was not queued and may run it itself. That is correct on a
 * `both` container and wrong on an `api` one, so the role is readable
 * (`role`) and the one caller that must not fall back — the transcoder —
 * checks it.
 *
 * REDIS DOWN AT BOOT: `enabled` is false and every caller falls back to what
 * it did before. Nothing depends on the queue to be correct; it depends on
 * it to be durable.
 */
export type JobHandler = (data: Record<string, unknown>, job: Job) => Promise<void>;

/** A lane is a queue with its own worker and its own concurrency. */
export type JobLane = 'city' | 'media';

/** Produce only, produce and consume, or both. See the docblock. */
export type JobRole = 'api' | 'worker' | 'both';

export const JOB_LANES: readonly JobLane[] = ['city', 'media'] as const;

/**
 * The routing table. Anything not named here is short work and rides the
 * default lane; a job that can run for minutes belongs in `media` beside the
 * encodes, so that whichever of them is slow is only slow for the other.
 */
const LANE_OF: Readonly<Record<string, JobLane>> = {
  'transcode-video': 'media',
  'media.sweep': 'media',
};

export function laneFor(name: string): JobLane {
  return LANE_OF[name] ?? 'city';
}

/** Read once, here, so nothing else has to know the variable's name. */
export function jobRole(): JobRole {
  const v = (process.env.JOBS_ROLE ?? '').trim().toLowerCase();
  return v === 'api' || v === 'worker' ? v : 'both';
}

/** How many jobs a lane runs at once on one container. */
function laneConcurrency(lane: JobLane): number {
  // One encode at a time per container, by default. TranscodeService keeps a
  // local gate too, but the gate makes three jobs WAIT while holding three
  // slots; the right number is the number of slots.
  const raw = lane === 'media' ? process.env.JOBS_MEDIA_CONCURRENCY : process.env.JOBS_CONCURRENCY;
  const n = Number(raw ?? (lane === 'media' ? 1 : 8));
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 64) : 1;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<JobLane, Queue>();
  private readonly workers = new Map<JobLane, Worker>();
  private connection: IORedis | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean { return this.queues.size > 0; }

  /** What this container does with jobs. See the docblock. */
  get role(): JobRole { return jobRole(); }

  /** True when this container runs workers — i.e. an unqueued job may be run here. */
  get consuming(): boolean { return this.role !== 'api'; }

  async onModuleInit(): Promise<void> {
    if (process.env.JOBS === 'off' || process.env.NODE_ENV === 'test') return;
    const url = this.config.get<string>('redisUrl') ?? '';
    if (!url) return;
    const role = this.role;
    try {
      // BullMQ needs its own connections and maxRetriesPerRequest null.
      this.connection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });
      await this.connection.connect();
      for (const lane of JOB_LANES) {
        this.queues.set(lane, new Queue(lane, { connection: this.connection }));
      }
      if (role !== 'api') {
        for (const lane of JOB_LANES) {
          const worker = new Worker(lane, async (job) => {
            const h = this.handlers.get(job.name);
            if (!h) { this.logger.warn(`no handler for job ${job.name}`); return; }
            await h(job.data as Record<string, unknown>, job);
          }, { connection: this.connection.duplicate(), concurrency: laneConcurrency(lane) });
          worker.on('failed', (job, err) => this.logger.warn(`job ${job?.name} ${job?.id} failed: ${err.message}`));
          this.workers.set(lane, worker);
        }
      }
      this.logger.log(role === 'api'
        ? 'Job queue is on, producing only (JOBS_ROLE=api) — no work runs on this container.'
        : `Job queue is on (JOBS_ROLE=${role}); lanes ${JOB_LANES.map((l) => `${l}×${laneConcurrency(l)}`).join(', ')}.`);
    } catch (e) {
      this.logger.warn(`Job queue unavailable (${(e as Error).message}) — deferred work runs in-process.`);
      this.queues.clear();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection?.disconnect();
  }

  /** Register what a job name does. Last registration wins; one per name. */
  handle(name: string, fn: JobHandler): void {
    this.handlers.set(name, fn);
  }

  /**
   * Enqueue. `jobId` de-duplicates: while a job with that id is waiting or
   * delayed, another add with the same id is dropped — which is how a burst
   * of profile saves becomes one reindex. Returns false when the queue is
   * off so the caller can run the work itself.
   */
  async add(name: string, data: Record<string, unknown>, opts: { jobId?: string; delayMs?: number; attempts?: number } = {}): Promise<boolean> {
    const queue = this.queues.get(laneFor(name));
    if (!queue) return false;
    try {
      await queue.add(name, data, {
        jobId: opts.jobId, delay: opts.delayMs, attempts: opts.attempts ?? 3,
        backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 500, removeOnFail: 1000,
      });
      return true;
    } catch (e) {
      this.logger.warn(`enqueue ${name} failed: ${(e as Error).message}`);
      return false;
    }
  }

  /** A job that runs on a schedule, upserted so a redeploy neither duplicates nor loses it. */
  async schedule(name: string, cron: string, data: Record<string, unknown> = {}): Promise<boolean> {
    const queue = this.queues.get(laneFor(name));
    if (!queue) return false;
    try {
      await queue.upsertJobScheduler(`sched:${name}`, { pattern: cron }, { name, data, opts: { removeOnComplete: 50, removeOnFail: 50 } });
      return true;
    } catch (e) {
      this.logger.warn(`schedule ${name} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
