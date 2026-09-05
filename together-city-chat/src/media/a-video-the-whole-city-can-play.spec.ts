import { TranscodeService, playableAsIs, readProbe } from './transcode.service';

/**
 * A VIDEO THE WHOLE CITY CAN PLAY — the worker behind the TV audit (5 Sep).
 * The decision — is this file playable as it is, or does it need the
 * encoder — is pure and tested on its own; the service test proves the
 * guards around the work: only a processing video is touched, a row that
 * cannot be read is marked failed on the last attempt and left alone
 * before it, and a legacy public URL is simply marked ready.
 */

const MOV_HEVC = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.quicktime':
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo`;
const MP4_H264 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':
  Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720
  Stream #0:1: Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo`;

describe('what a file is', () => {
  it('reads the codecs off the banner', () => {
    expect(readProbe(MOV_HEVC)).toEqual({ video: 'hevc', audio: 'aac' });
    expect(readProbe(MP4_H264)).toEqual({ video: 'h264', audio: 'aac' });
    expect(readProbe('nothing here')).toEqual({ video: null, audio: null });
  });

  it('an H.264 + AAC MP4 is playable as it is; an iPhone HEVC .mov is not', () => {
    expect(playableAsIs('social/u1/a.mp4', readProbe(MP4_H264))).toBe(true);
    expect(playableAsIs('social/u1/a.quicktime', readProbe(MOV_HEVC))).toBe(false);
    // The container matters as much as the codec: h264 in a .mov still goes through.
    expect(playableAsIs('social/u1/a.mov', { video: 'h264', audio: 'aac' })).toBe(false);
    // A silent MP4 is fine; an MP4 with, say, Opus audio is not.
    expect(playableAsIs('social/u1/a.mp4', { video: 'h264', audio: null })).toBe(true);
    expect(playableAsIs('social/u1/a.mp4', { video: 'h264', audio: 'opus' })).toBe(false);
  });
});

function service(row: Record<string, unknown> | null, download = false) {
  const updates: Record<string, unknown>[] = [];
  const prisma = {
    postMedia: {
      findUnique: async () => row,
      update: async (a: { data: Record<string, unknown> }) => { updates.push(a.data); return {}; },
    },
  };
  const storage = {
    isPostKey: (v: string) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(v),
    downloadPostObjectToFile: async () => download,
    putPostObjectFromFile: async () => true,
    deletePrivateObject: async () => true,
  };
  return { svc: new TranscodeService(prisma as never, storage as never), updates };
}

describe('the worker, around the work', () => {
  it('touches nothing that is not a processing video', async () => {
    const photo = service({ id: 'm1', url: 'social/u1/a.jpg', kind: 'image', thumbUrl: null, state: 'ready' });
    await photo.svc.process('m1');
    expect(photo.updates).toEqual([]);
    const done = service({ id: 'm2', url: 'social/u1/a.mp4', kind: 'video', thumbUrl: null, state: 'ready' });
    await done.svc.process('m2');
    expect(done.updates).toEqual([]);
  });

  it('a legacy public URL is not ours to re-encode: marked ready and left', async () => {
    const s = service({ id: 'm3', url: 'https://cdn.example/old.mov', kind: 'video', thumbUrl: null, state: 'processing' });
    await s.svc.process('m3');
    expect(s.updates).toEqual([{ state: 'ready' }]);
  });

  it('an object that cannot be read is failed on the last attempt, and left alone before it', async () => {
    const first = service({ id: 'm4', url: 'social/u1/a.quicktime', kind: 'video', thumbUrl: null, state: 'processing' });
    await expect(first.svc.process('m4', false)).rejects.toThrow(/could not be read/);
    expect(first.updates).toEqual([]);
    const last = service({ id: 'm4', url: 'social/u1/a.quicktime', kind: 'video', thumbUrl: null, state: 'processing' });
    await expect(last.svc.process('m4', true)).rejects.toThrow(/could not be read/);
    expect(last.updates).toEqual([{ state: 'failed' }]);
  });

  it('one at a time: the second job waits for the first', async () => {
    const s = service({ id: 'm5', url: 'https://cdn.example/old.mov', kind: 'video', thumbUrl: null, state: 'processing' });
    const order: string[] = [];
    const a = s.svc.process('m5').then(() => order.push('a'));
    const b = s.svc.process('m5').then(() => order.push('b'));
    await Promise.all([a, b]);
    expect(order).toEqual(['a', 'b']);
  });
});
