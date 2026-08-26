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
 * ONE QUEUE, NAMED HANDLERS. Services register a handler for a job name at
 * boot (`handle`) and enqueue by the same name (`add`). The worker lives in
 * this process; a second API instance is a second worker on the same queue.
 *
 * REDIS DOWN AT BOOT: `enabled` is false and every caller falls back to what
 * it did before — the in-process path. Nothing depends on the queue to be
 * correct; it depends on it to be durable.
 */
export type JobHandler = (data: Record<string, unknown>, job: Job) => Promise<void>;

const QUEUE = 'city';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean { return this.queue !== null; }

  async onModuleInit(): Promise<void> {
    if (process.env.JOBS === 'off' || process.env.NODE_ENV === 'test') return;
    const url = this.config.get<string>('redisUrl') ?? '';
    if (!url) return;
    try {
      // BullMQ needs its own connections and maxRetriesPerRequest null.
      this.connection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });
      await this.connection.connect();
      this.queue = new Queue(QUEUE, { connection: this.connection });
      this.worker = new Worker(QUEUE, async (job) => {
        const h = this.handlers.get(job.name);
        if (!h) { this.logger.warn(`no handler for job ${job.name}`); return; }
        await h(job.data as Record<string, unknown>, job);
      }, { connection: this.connection.duplicate(), concurrency: Number(process.env.JOBS_CONCURRENCY ?? 4) });
      this.worker.on('failed', (job, err) => this.logger.warn(`job ${job?.name} ${job?.id} failed: ${err.message}`));
      this.logger.log('Job queue is on.');
    } catch (e) {
      this.logger.warn(`Job queue unavailable (${(e as Error).message}) — deferred work runs in-process.`);
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
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
    if (!this.queue) return false;
    try {
      await this.queue.add(name, data, {
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
    if (!this.queue) return false;
    try {
      await this.queue.upsertJobScheduler(`sched:${name}`, { pattern: cron }, { name, data, opts: { removeOnComplete: 50, removeOnFail: 50 } });
      return true;
    } catch (e) {
      this.logger.warn(`schedule ${name} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
