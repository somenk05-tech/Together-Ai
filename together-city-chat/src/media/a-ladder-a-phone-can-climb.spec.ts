import { hlsContentType, ladderArgs, ladderFiles, ladderKeysOf, readFps, readSize, rungsFor } from './hls-ladder';

/**
 * ── A LADDER A PHONE CAN CLIMB ──────────────────────────────────────────────
 *
 * City TV played one progressive MP4 per video. The owner allows a 2 GB,
 * 60-minute upload — 4.4 Mbit/s average — against the 1–3 Mbit/s a mid-range
 * Android sustains on Indian 4G at peak, and with no ladder a stream cannot
 * step down: it stalls, `TUNE_MS` advances to the next video, and that one
 * stalls too. The failure was not slow playback, it was skipping through the
 * whole catalogue showing "Tuning in…".
 *
 * Every decision in hls-ladder.ts is arithmetic and string-building, which is
 * why it is a pure module and why this file needs no video. The banners below
 * are REAL ffmpeg 4.4.2 output, pasted rather than invented — a regex tested
 * against a banner somebody wrote from memory is a regex that passes here and
 * fails on the first upload.
 */

/** Real, from `ffmpeg -i` on a 1280x720 H.264 file. */
const BANNER_720 =
  '  Stream #0:0(und): Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p, '
  + '1280x720 [SAR 1:1 DAR 16:9], 7435 kb/s, 30 fps, 30 tbr, 15360 tbn, 60 tbc (default)\n'
  + '  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)\n';

/** A portrait phone video, which is what most of the city actually uploads. */
const BANNER_PHONE =
  '  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), '
  + '1080x1920 [SAR 1:1 DAR 9:16], 9812 kb/s, 29.97 fps, 29.97 tbr, 90k tbn, 180k tbc (default)\n';

describe('what the source is', () => {
  it('reads the size off the banner ffmpeg already printed', () => {
    expect(readSize(BANNER_720)).toEqual({ width: 1280, height: 720 });
    expect(readSize(BANNER_PHONE)).toEqual({ width: 1080, height: 1920 });
  });

  it('answers null rather than guessing when there is no video line', () => {
    expect(readSize('  Stream #0:0: Audio: aac (LC), 44100 Hz, stereo\n')).toBeNull();
    expect(readSize('')).toBeNull();
  });

  it('reads the frame rate, and falls back to 30 rather than to NaN', () => {
    expect(readFps(BANNER_720)).toBe(30);
    expect(readFps(BANNER_PHONE)).toBe(29.97);
    // A GOP computed from NaN is an ffmpeg invocation that fails at run time,
    // on the worker, for a video somebody is waiting on.
    expect(readFps('no fps here')).toBe(30);
    expect(readFps(', 900 fps,')).toBe(30);
  });
});

describe('which rungs get built', () => {
  it('never builds above the source — upscaling spends CPU on the same picture', () => {
    expect(rungsFor(1080).map((r) => r.height)).toEqual([240, 360, 480, 720]);
    expect(rungsFor(720).map((r) => r.height)).toEqual([240, 360, 480, 720]);
    expect(rungsFor(600).map((r) => r.height)).toEqual([240, 360, 480]);
    expect(rungsFor(360).map((r) => r.height)).toEqual([240, 360]);
  });

  it('gives a source below the bottom rung one rung of its own, not none', () => {
    // The point of a ladder for a tiny clip is not choice, it is the segmented
    // delivery underneath it — so "no rungs fit" must not mean "no ladder".
    expect(rungsFor(180).map((r) => r.height)).toEqual([180]);
    // Even height, because H.264 cannot encode an odd one with yuv420p.
    expect(rungsFor(181)[0].height % 2).toBe(0);
  });

  it('climbs in bitrate as it climbs in height', () => {
    const kbps = rungsFor(1080).map((r) => r.kbps);
    expect([...kbps].sort((a, b) => a - b)).toEqual(kbps);
  });
});

describe('the ffmpeg invocation', () => {
  const args = ladderArgs('/tmp/in.mp4', '/tmp/out', rungsFor(720), 30);
  const at = (flag: string) => args[args.indexOf(flag) + 1];

  it('decodes once and splits, rather than reading the file per rung', () => {
    // Four separate ffmpeg runs would decode an hour of video four times. This
    // is most of the saving and it is the whole reason for filter_complex.
    expect(at('-filter_complex')).toContain('[0:v]split=4');
    expect(args.filter((a) => a === '-i')).toHaveLength(1);
  });

  it('writes ONE object per rung, which is what the whole design rests on', () => {
    /* `single_file` turns 600 segments into one file plus a byte-range
       playlist. Nine objects per video instead of ~3,600 is what lets the edge
       sign a playlist by minting a handful of tokens, and what makes a delete
       nine keys. Verified against ffmpeg 4.4.2 before it was relied on. */
    expect(at('-hls_flags')).toBe('single_file');
    expect(at('-hls_segment_type')).toBe('mpegts');
    expect(at('-hls_playlist_type')).toBe('vod');
  });

  it('aligns every rung on the same frame', () => {
    // Without a fixed GOP and scene detection off, the rungs cut at different
    // frames and a player switching between them stutters or refuses.
    expect(at('-g')).toBe('180');
    expect(at('-keyint_min')).toBe('180');
    expect(at('-sc_threshold')).toBe('0');
  });

  it('maps an audio track into every variant, and tolerates a silent source', () => {
    // `a:0?` — the trailing question mark. A video with no audio is common on
    // a phone and must not fail the whole ladder.
    expect(args.filter((a) => a === 'a:0?')).toHaveLength(4);
    expect(at('-var_stream_map')).toBe('v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3');
  });

  it('names its outputs by ffmpeg’s variant index, so the caller can predict them', () => {
    expect(args[args.length - 1]).toBe('/tmp/out/v%v.m3u8');
    expect(at('-master_pl_name')).toBe('master.m3u8');
    expect(ladderFiles(rungsFor(720))).toEqual([
      'master.m3u8', 'v0.m3u8', 'v0.ts', 'v1.m3u8', 'v1.ts', 'v2.m3u8', 'v2.ts', 'v3.m3u8', 'v3.ts',
    ]);
  });

  it('scales a shorter source’s ladder without leaving a gap in the indices', () => {
    const two = ladderArgs('/tmp/in.mp4', '/tmp/out', rungsFor(360));
    expect(two[two.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0 v:1,a:1');
    expect(two[two.indexOf('-filter_complex') + 1]).toContain('split=2');
  });
});

describe('what a delete has to reach', () => {
  /**
   * The row keeps ONE pointer and the ladder is nine objects. Naming only the
   * master would leave every rung of every video in the bucket — the exact
   * shape of the five leaks storage-reach.ts was written after.
   */
  it('names every file a ladder can have, from the master key alone', () => {
    const keys = ladderKeysOf('social/u1/abc/master.m3u8');
    expect(keys).toHaveLength(9);
    expect(keys[0]).toBe('social/u1/abc/master.m3u8');
    expect(keys).toContain('social/u1/abc/v3.ts');
    // Everything under one prefix — a stray key elsewhere would survive.
    expect(keys.every((k) => k.startsWith('social/u1/abc/'))).toBe(true);
  });

  it('is safe to call on a row that has no ladder', () => {
    expect(ladderKeysOf(null)).toEqual([]);
    expect(ladderKeysOf(undefined)).toEqual([]);
    // Not a master playlist — a caller must not be able to turn the MP4 into
    // eight imaginary siblings.
    expect(ladderKeysOf('social/u1/abc.mp4')).toEqual([]);
  });
});

describe('what the bucket is told each file is', () => {
  it('serves a playlist as a playlist and a segment as video', () => {
    // A playlist stored as octet-stream is a playlist Safari will not read.
    expect(hlsContentType('master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(hlsContentType('v0.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(hlsContentType('v0.ts')).toBe('video/mp2t');
  });
});
