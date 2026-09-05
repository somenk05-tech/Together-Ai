import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { QueueService } from '../shared/queue/queue.service';
import { StorageProvider } from './storage.provider';

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
 * ONE AT A TIME. The queue's worker runs four jobs at once, and four
 * encodes on one container is one encode four times slower plus a disk
 * full of inputs. A local gate lets one encode through at a time in this
 * process; the others wait in line, not in Redis.
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
  }

  /** Queue a video for the worker; without a queue, run it here, off the request. */
  async enqueue(mediaId: string): Promise<void> {
    const queued = await this.jobs?.add(JOB, { mediaId }, { jobId: `transcode:${mediaId}`, attempts: 2 });
    if (!queued) void this.process(mediaId).catch((e: Error) => this.logger.warn(`transcode ${mediaId} failed in-process: ${e.message}`));
  }

  /** The job. Serialised through `line`; safe to call twice for one row. */
  process(mediaId: string, final = true): Promise<void> {
    const turn = this.line.then(() => this.processNow(mediaId, final));
    this.line = turn.catch(() => undefined);
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

      const probe = readProbe((await run(bin, ['-hide_banner', '-i', input], 60_000)).stderr);
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

      // The row points at the rendition BEFORE the original goes, so a
      // delete that fails leaves a leftover and never a hole.
      await this.prisma.postMedia.update({ where: { id: mediaId }, data: { url: key, thumbUrl, state: 'ready' } });
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
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async mark(mediaId: string, state: MediaState): Promise<void> {
    await this.prisma.postMedia.update({ where: { id: mediaId }, data: { state } })
      .catch((e: Error) => this.logger.warn(`video ${mediaId} state not written: ${e.message}`));
  }
}
