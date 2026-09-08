import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { optional } from '../shared/swallow';
import { QueueService } from '../shared/queue/queue.service';
import { StorageProvider } from './storage.provider';
import { hlsContentType, ladderArgs, ladderFiles, readFps, readSize, rungsFor } from './hls-ladder';

/**
 * A VIDEO THE WHOLE CITY CAN PLAY — Together City TV audit, 5 Sep.
 *
 * The city stored uploaded video exactly as uploaded. An iPhone records HEVC
 * in a .mov container, and Chrome, Android and Windows do not decode it —
 * so the live stream, on the night the TV came on, was posters and twelve
 * seconds of "tuning in" to most of the city. media.service.ts had named
 * this worker in a comment since the pipeline was drawn (transcodeVideo())
 * and nothing had been built behind the name. This is that worker.
 *
 * WHAT IT DOES. After a post is created, every video on it is queued. The
 * job pulls the object to disk (up to 2 GB — never a Buffer), reads what it
 * is, and if it is not already H.264 + AAC in an MP4, re-encodes it: H.264
 * high profile, no taller than 1080p, faststart so the first frame plays
 * before the file has finished arriving, AAC audio. The rendition is put
 * under a new key in the same citizen's prefix, the row is pointed at it,
 * the original is deleted, and — when the post carried no poster — one
 * frame is cut for the card. A video that is already playable is only
 * marked ready. A video that cannot be read is marked failed; the card
 * keeps its poster and the set skips it.
 *
 * STATE. PostMedia.state is 'processing' from the post until this runs,
 * 'ready' after, 'failed' if it cannot. Photographs are 'ready' from the
 * start. The TV plays only 'ready' videos; the wall shows a processing
 * video by its poster.
 *
 * ONE AT A TIME, AND NOT ON THE BOX SERVING THE CITY (1M-DAU pass, 6 Sep).
 * `libx264 -preset veryfast` holds a full vCPU for as long as the video is
 * long, and the owner allows an hour of it. This work belongs on the
 * `media` lane (see shared/queue/queue.service.ts), whose worker runs one
 * job at a time and runs only on a container with JOBS_ROLE=worker. The
 * local gate below stays as a second belt for a container configured to run
 * more than one.
 *
 * AND THE FALLBACK IS ROLE-AWARE. `enqueue` used to run the encode in this
 * process whenever the queue said no. On a citizen-serving container that is
 * the failure it was written to prevent, so it now leaves the row
 * 'processing' and lets `media.sweep` pick it up when the queue is back.
 *
 * FFMPEG. `FFMPEG_PATH` if set; otherwise the binary `ffmpeg-static` ships;
 * otherwise `ffmpeg` on PATH. Without any of them the worker marks the
 * video failed and says why once, rather than crashing the post.
 *
 * NOT DONE HERE: the poster cut from the video is not sent through the
 * image screen. The video it is cut from was screened at upload; a frame of
 * a screened video is what the cover route also accepts.
 */

export type MediaState = 'ready' | 'processing' | 'failed';

const JOB = 'transcode-video';
/** Re-queues videos left 'processing' — a lost job, a queue outage, a killed worker. */
const JOB_SWEEP = 'media.sweep';
/** How many stuck rows one sweep tick will re-queue. */
const SWEEP_BATCH = 200;
/** Longest an encode may run before it is killed and the video marked failed. */
const ENCODE_TIMEOUT_MS = 60 * 60 * 1000;

interface Probe { video: string | null; audio: string | null }

/** What ffmpeg says a file is, read off its stderr banner. Pure; exported for the spec. */
export function readProbe(stderr: string): Probe {
  const v = /Video:\s*([a-z0-9]+)/i.exec(stderr);
  const a = /Audio:\s*([a-z0-9]+)/i.exec(stderr);
  return { video: v ? v[1].toLowerCase() : null, audio: a ? a[1].toLowerCase() : null };
}

/** True when a browser anywhere can play the file as it is: H.264 (+AAC or silent) in MP4. Pure. */
export function playableAsIs(key: string, probe: Probe): boolean {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext !== 'mp4' && ext !== 'm4v') return false;
  if (probe.video !== 'h264') return false;
  return probe.audio === null || probe.audio === 'aac';
}

function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    if (p) return p;
  } catch { /* not installed — fall through to PATH */ }
  return 'ffmpeg';
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-8000); });
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stderr }); });
  });
}

@Injectable()
export class TranscodeService implements OnModuleInit {
  private readonly logger = new Logger(TranscodeService.name);
  /** The local gate: one encode at a time in this process. */
  private line: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    @Optional() private readonly jobs?: QueueService,
  ) {}

  onModuleInit(): void {
    this.jobs?.handle(JOB, async (data, job) => {
      // Only the last attempt may write 'failed': a download that fell over
      // once is retried, and a row marked failed is not picked up again.
      const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.process(String(data.mediaId), last);
    });
    this.jobs?.handle(JOB_SWEEP, async () => { await this.sweepStuck(); });
    void this.jobs?.schedule(JOB_SWEEP, '*/15 * * * *');
  }

  /**
   * WHAT THE QUEUE DROPPED. A video is 'processing' from the moment the post
   * is written until the worker has finished with it, so a row still in that
   * state half an hour later means the job never ran: Redis was down when the
   * post landed, the worker was killed mid-encode, or the deploy that queued
   * it and the deploy that would have run it were not the same deploy. Before
   * the encode moved off the API container that was invisible, because the
   * fallback ran it here. It is not invisible now, so it is swept.
   *
   * Re-adding by the same `jobId` is free when one is genuinely still queued.
   */
  private async sweepStuck(): Promise<void> {
    // NO AGE FILTER, AND NO NEED FOR ONE. PostMedia carries no createdAt, and
    // rather than add a column to the largest media table for a housekeeping
    // job, the de-duplication does the work: `jobId` is `transcode:<id>`, so a
    // video that is genuinely queued or genuinely being encoded right now has
    // that id in Redis and the re-add is dropped. Only a row nobody is on gets
    // a new job. Served by the partial index in
    // 20260906T170000_a_worker_of_its_own — the whole table is not scanned.
    // unbounded: capped at SWEEP_BATCH — a backlog drains over several ticks.
    const rows = await this.prisma.postMedia.findMany({
      where: { kind: 'video', state: 'processing' },
      select: { id: true }, orderBy: { id: 'asc' }, take: SWEEP_BATCH,
    });
    if (!rows.length) return;
    let requeued = 0;
    for (const r of rows) if (await this.jobs?.add(JOB, { mediaId: r.id }, { jobId: `transcode:${r.id}`, attempts: 2 })) requeued++;
    if (requeued) this.logger.log(`media sweep re-queued ${requeued} video(s) left processing`);
  }

  /**
   * Queue a video for the worker.
   *
   * Without a queue, run it here — but ONLY on a container that runs jobs at
   * all. On a citizen-serving container (JOBS_ROLE=api) an hour of ffmpeg is
   * the thing this whole arrangement exists to keep off the box, so the row
   * stays 'processing' and `media.sweep` re-queues it once Redis is back.
   */
  async enqueue(mediaId: string): Promise<void> {
    const queued = await this.jobs?.add(JOB, { mediaId }, { jobId: `transcode:${mediaId}`, attempts: 2 });
    if (queued) return;
    if (this.jobs && !this.jobs.consuming) {
      this.logger.warn(`video ${mediaId} could not be queued and will not be encoded here (JOBS_ROLE=api) — left for the sweep`);
      return;
    }
    void this.process(mediaId).catch((e: Error) => this.logger.warn(`transcode ${mediaId} failed in-process: ${e.message}`));
  }

  /** The job. Serialised through `line`; safe to call twice for one row. */
  process(mediaId: string, final = true): Promise<void> {
    const turn = this.line.then(() => this.processNow(mediaId, final));
    // The GATE's copy of the promise, not the caller's. Its only job is to keep
    // the queue moving after a failed encode; the failure itself is returned to
    // the caller on `turn` and handled there, so silence here is the whole
    // point rather than a swallowed error. (`optional` over a bare catch, 6 Sep
    // — see shared/swallow.ts for which of the three this is.)
    this.line = optional(turn).then(() => undefined);
    return turn;
  }

  private async processNow(mediaId: string, final: boolean): Promise<void> {
    const row = await this.prisma.postMedia.findUnique({ where: { id: mediaId }, select: { id: true, url: true, kind: true, thumbUrl: true, state: true } });
    if (!row || row.kind !== 'video' || row.state !== 'processing') return;
    if (!this.storage.isPostKey(row.url)) { await this.mark(mediaId, 'ready'); return; }
    const owner = row.url.split('/')[1];
    const dir = await mkdtemp(join(tmpdir(), 'tc-video-'));
    const input = join(dir, `in.${row.url.split('.').pop() ?? 'bin'}`);
    const output = join(dir, 'out.mp4');
    const poster = join(dir, 'poster.jpg');
    const bin = ffmpegPath();
    try {
      if (!(await this.storage.downloadPostObjectToFile(row.url, input))) throw new Error('object could not be read');

      const banner = (await run(bin, ['-hide_banner', '-i', input], 60_000)).stderr;
      const probe = readProbe(banner);
      if (!probe.video) throw new Error('no video stream');

      let key = row.url;
      if (!playableAsIs(row.url, probe)) {
        const enc = await run(bin, [
          '-hide_banner', '-y', '-i', input,
          '-map', '0:v:0', '-map', '0:a?',
          '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '23',
          '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          output,
        ], ENCODE_TIMEOUT_MS);
        if (enc.code !== 0) throw new Error(`ffmpeg exited ${enc.code}: ${enc.stderr.slice(-300)}`);
        if ((await stat(output)).size === 0) throw new Error('empty rendition');
        key = `social/${owner}/${randomUUID()}.mp4`;
        if (!(await this.storage.putPostObjectFromFile(key, output, 'video/mp4'))) throw new Error('rendition could not be stored');
      }

      let thumbUrl = row.thumbUrl;
      if (!thumbUrl) {
        const src = key === row.url ? input : output;
        const cut = await run(bin, ['-hide_banner', '-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '4', poster], 60_000);
        if (cut.code === 0) {
          const pk = `social/${owner}/${randomUUID()}.jpg`;
          if (await this.storage.putPostObjectFromFile(pk, poster, 'image/jpeg')) thumbUrl = pk;
        }
      }

      /* ── AND THE LADDER, WHICH IS ALLOWED TO FAIL ──────────────────────
         Built from whichever file is now canonical — the re-encode if there
         was one, the original if it was already playable — and never from the
         source when a rendition exists, or a rung would be a second-generation
         encode of a first-generation encode.

         Its failure is not the video's failure. `url` above is a progressive
         H.264 MP4 that plays everywhere; the ladder is what makes it play
         WELL on a phone that cannot hold 4 Mbit/s. So this is caught here,
         logged, and the row goes out with `hlsUrl` null — the player falls
         back to the file it already had. */
      const hlsUrl = await this.buildLadder(bin, key === row.url ? input : output, dir, owner, banner)
        .catch((e: Error) => { this.logger.warn(`video ${mediaId} has no adaptive ladder: ${e.message}`); return null; });

      // The row points at the rendition BEFORE the original goes, so a
      // delete that fails leaves a leftover and never a hole.
      await this.ladder.update({ where: { id: mediaId }, data: { url: key, thumbUrl, state: 'ready', hlsUrl } });
      if (key !== row.url) {
        await this.storage.deletePrivateObject(row.url)
          .catch((e: Error) => this.logger.warn(`original ${row.url} not deleted after transcode: ${e.message}`));
      }
      this.logger.log(`video ${mediaId} ${key === row.url ? 'was already playable' : `re-encoded (${probe.video}${probe.audio ? '+' + probe.audio : ''} → h264+aac)`}`);
    } catch (e) {
      this.logger.warn(`video ${mediaId} could not be made playable: ${(e as Error).message}`);
      if (final) await this.mark(mediaId, 'failed');
      throw e;
    } finally {
      // Best-effort, and genuinely optional: the directory is under tmpdir(),
      // the container is ephemeral, and a cleanup that failed must not turn a
      // finished encode into an error.
      await optional(rm(dir, { recursive: true, force: true }));
    }
  }

  /**
   * THE COLUMN THIS CHECKOUT'S GENERATED CLIENT HAS NOT SEEN.
   *
   * `PostMedia.hlsUrl` is in schema.prisma and in
   * 20260906T220000_a_ladder_a_phone_can_climb; the client in this working tree
   * predates both, because `prisma generate` has to reach binaries.prisma.sh
   * and this machine could not. Every deployment regenerates before it builds.
   * DELETE THIS after any `npx prisma generate` and put `this.prisma.postMedia`
   * back at its one call site.
   */
  private get ladder() {
    return this.prisma.postMedia as unknown as {
      update(a: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    };
  }

  /**
   * Encode the adaptive ladder and put it in the bucket. Returns the master
   * playlist's key, or null when there is nothing to build from.
   *
   * ONE FFMPEG PASS for every rung: the source is decoded once and `split`
   * feeds each scaler, which on a long video is most of the saving. The rungs
   * are chosen from the source height — never above it — so a phone video does
   * not pay for a 720p rung of a 480p picture. See hls-ladder.ts.
   *
   * The whole ladder lands under one uuid prefix, so `ladderKeysOf` can name
   * every file of it from the master key alone when the post is deleted.
   */
  private async buildLadder(bin: string, source: string, dir: string, owner: string, banner: string): Promise<string | null> {
    const size = readSize(banner);
    if (!size) return null;
    const rungs = rungsFor(size.height);
    const outDir = join(dir, 'hls');
    await mkdir(outDir, { recursive: true });
    const enc = await run(bin, ladderArgs(source, outDir, rungs, readFps(banner)), ENCODE_TIMEOUT_MS);
    if (enc.code !== 0) throw new Error(`ffmpeg exited ${enc.code}: ${enc.stderr.slice(-300)}`);

    const prefix = `social/${owner}/${randomUUID()}`;
    for (const name of ladderFiles(rungs)) {
      const ok = await this.storage.putPostObjectFromFile(`${prefix}/${name}`, join(outDir, name), hlsContentType(name));
      if (!ok) throw new Error(`${name} could not be stored`);
    }
    this.logger.log(`ladder for ${prefix}: ${rungs.map((r) => `${r.height}p`).join(', ')}`);
    return `${prefix}/master.m3u8`;
  }

  private async mark(mediaId: string, state: MediaState): Promise<void> {
    await this.prisma.postMedia.update({ where: { id: mediaId }, data: { state } })
      .catch((e: Error) => this.logger.warn(`video ${mediaId} state not written: ${e.message}`));
  }
}
