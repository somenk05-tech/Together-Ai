/**
 * ── A LADDER, BECAUSE ONE PROGRESSIVE FILE IS NOT A STREAM ──────────────────
 *
 * City TV played one MP4 per video, at whatever bitrate the encode produced,
 * with no way to adapt. The owner allows a two-gigabyte, sixty-minute upload —
 * 4.4 Mbit/s average — against the 1–3 Mbit/s a mid-range Android sustains on
 * Indian 4G at peak. With no ladder the stream cannot step down, so it stalls;
 * and `TUNE_MS = 12_000` then advances to the next video, which also cannot
 * play. On a weak connection the TV skipped through the whole catalogue showing
 * nothing but "Tuning in…". That is worse than slow, and it is what this file
 * exists to end. (1M-DAU pass, 6 Sep.)
 *
 * ── ONE OBJECT PER RUNG, AND WHY THAT DECIDES EVERYTHING ELSE ───────────────
 *
 * `-hls_flags single_file` writes each rendition as ONE file with a playlist of
 * `EXT-X-BYTERANGE` entries, rather than several hundred little segments. A
 * one-hour video is then nine objects (four rungs, four playlists, one master)
 * instead of about three thousand six hundred — and that is not tidiness, it is
 * what makes the rest of the design work:
 *
 *   · the media edge signs ONE token per object, and a playlist can be rewritten
 *     into signed links in a few lines rather than by minting nine hundred;
 *   · the edge Worker already serves Range requests, which is exactly what a
 *     byte-range playlist asks of it;
 *   · a delete is nine keys, and the storage bill is nine objects of metadata.
 *
 * Verified against ffmpeg 4.4.2 before it was written down: `single_file` with
 * `mpegts` and `var_stream_map` produces `master.m3u8`, `v0.m3u8…` and
 * `v0.ts…`, with relative URIs and `EXT-X-BYTERANGE` offsets. mpegts rather
 * than fMP4 deliberately — `single_file` has behaved this way with mpegts for
 * many releases, the container overhead is a few per cent, and hls.js plays it
 * everywhere Safari plays it natively.
 *
 * ── THE RUNGS ───────────────────────────────────────────────────────────────
 *
 * 240/360/480/720, and never above the source: upscaling spends CPU to make a
 * bigger file of the same picture. A 4K upload is capped at 720 because this is
 * a phone-first city and the top rung is what everything above it would have
 * cost. Bitrates are the conservative end of the usual tables — the point is a
 * rung that PLAYS on a train, not one that looks best on a desk.
 *
 * Pure: no ffmpeg, no filesystem, no service. The spec beside it can read every
 * decision here without a video.
 */

export interface Rung {
  /** Output height in pixels. Width follows the source's aspect ratio. */
  height: number;
  /** Target video bitrate, kbit/s. */
  kbps: number;
}

/** The rungs, tallest last. Nothing above the source height is ever built. */
const LADDER: readonly Rung[] = [
  { height: 240, kbps: 300 },
  { height: 360, kbps: 700 },
  { height: 480, kbps: 1400 },
  { height: 720, kbps: 2800 },
] as const;

/** One audio bitrate for every rung: a second copy of the audio buys nothing. */
export const AUDIO_KBPS = 96;

/** Segment length. Six seconds is the usual VOD compromise — a short enough
 *  unit to switch rung on, long enough that a one-hour playlist is 600 lines. */
export const SEGMENT_SECONDS = 6;

/**
 * The size ffmpeg says the source is, read off its stderr banner.
 *
 * Same approach as `readProbe` next door and for the same reason: the banner is
 * already in hand from the probe run, and a second `ffprobe` process to learn
 * two integers is a process per video for nothing.
 */
export function readSize(stderr: string): { width: number; height: number } | null {
  const m = /Video:[^\n]*?,\s(\d{2,5})x(\d{2,5})[\s,[]/.exec(stderr);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

/**
 * Which rungs to build for a source of this height.
 *
 * Never taller than the source. A source shorter than the lowest rung gets ONE
 * rung at its own height rather than none — a 180p clip should still get an
 * adaptive playlist, because the point of the ladder for that file is not
 * choice but the segmented delivery underneath it.
 */
export function rungsFor(sourceHeight: number): Rung[] {
  const fit = LADDER.filter((r) => r.height <= sourceHeight);
  if (fit.length) return fit;
  return [{ height: Math.max(2, Math.floor(sourceHeight / 2) * 2), kbps: LADDER[0].kbps }];
}

/**
 * The ffmpeg arguments for the whole ladder, in one pass.
 *
 * One pass, not one per rung: the source is decoded once and `split` feeds
 * every scaler from that single decode, which on a long video is most of the
 * saving. `-sc_threshold 0` with a fixed GOP is what makes every rung's
 * segments start at the same instant — without it the rungs cut at different
 * frames and a player switching between them stutters or refuses.
 *
 * `%v` in the output name is ffmpeg's variant index, filled from
 * `-var_stream_map`. It is why the outputs are `v0.m3u8`, `v1.m3u8`… and why
 * the caller can name them without asking ffmpeg what it wrote.
 */
export function ladderArgs(input: string, outDir: string, rungs: readonly Rung[], fps = 30): string[] {
  const splits = rungs.map((_, i) => `[v${i}]`).join('');
  const chain = [
    `[0:v]split=${rungs.length}${splits}`,
    ...rungs.map((r, i) => `[v${i}]scale=w=-2:h=${r.height}[v${i}o]`),
  ].join(';');

  const perRung: string[] = [];
  rungs.forEach((r, i) => {
    perRung.push(
      '-map', `[v${i}o]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, `${r.kbps}k`,
      `-maxrate:v:${i}`, `${Math.round(r.kbps * 1.1)}k`,
      `-bufsize:v:${i}`, `${r.kbps * 2}k`,
    );
  });
  // The same audio stream mapped once per rung — HLS wants an audio track in
  // every variant, and re-encoding it four times from one input is cheap next
  // to the video.
  rungs.forEach(() => perRung.push('-map', 'a:0?'));

  // A GOP of exactly one segment, so every rung cuts on the same frame.
  const gop = String(Math.max(1, Math.round(fps * SEGMENT_SECONDS)));

  return [
    '-hide_banner', '-y', '-i', input,
    '-filter_complex', chain,
    ...perRung,
    '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '2',
    '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'single_file',
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', rungs.map((_, i) => `v:${i},a:${i}`).join(' '),
    `${outDir}/v%v.m3u8`,
  ];
}

/** Every file the ladder writes, relative to its directory, master first. */
export function ladderFiles(rungs: readonly Rung[]): string[] {
  return ['master.m3u8', ...rungs.flatMap((_, i) => [`v${i}.m3u8`, `v${i}.ts`])];
}

/** Frames per second off the same banner, for the GOP. 30 when it cannot be read. */
export function readFps(stderr: string): number {
  const m = /,\s*(\d+(?:\.\d+)?)\s*fps\b/.exec(stderr);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : 30;
}

/** The most rungs a ladder will ever have — see LADDER. Used by ladderKeysOf. */
const MAX_RUNGS = 4;

/**
 * Every key a ladder could have written, given the master playlist's key.
 *
 * Deletion is the reason this exists and the reason it guesses rather than
 * reads. A post's media row keeps ONE pointer — the master playlist — and the
 * rung count is not stored: storing it would be a second column that can
 * disagree with the bucket, and listing the prefix at delete time would be a
 * LIST call on a path that is already best-effort. So the delete asks for every
 * name a ladder can have (at most nine) and tolerates the misses, which cost a
 * 404 each and are the cheapest thing in this whole file.
 *
 * Returns [] for anything that is not a master playlist key, so a caller can
 * pass a row's `hlsUrl` straight in without checking it first.
 */
export function ladderKeysOf(masterKey: string | null | undefined): string[] {
  if (!masterKey || !masterKey.endsWith('/master.m3u8')) return [];
  const prefix = masterKey.slice(0, -'master.m3u8'.length);
  const out = [masterKey];
  for (let i = 0; i < MAX_RUNGS; i++) out.push(`${prefix}v${i}.m3u8`, `${prefix}v${i}.ts`);
  return out;
}

/** What to store each ladder file as, so the edge serves it with the right type. */
export function hlsContentType(name: string): string {
  return name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
}
