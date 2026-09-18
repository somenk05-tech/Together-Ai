import { open } from 'fs/promises';
import { callJson, PlatformError, platformWords, query, readJson, sleep, type Http } from './http';

/**
 * ── THE THREE UPLOADS ───────────────────────────────────────────────────────
 *
 * Each in the shape its platform documents (read 17 Sep), and each returns
 * only what the platform itself said: its id and, when it gives one, its link.
 * An upload that cannot name the post it made throws — the desk will not
 * record a success it cannot show somebody. Once a platform HAS named the
 * post, nothing after that may throw: a published post recorded as a failure
 * is a post the retry button publishes twice.
 *
 *   YouTube    videos.insert as a RESUMABLE upload, sent in 16 MiB pieces
 *              from a file on disk. One PUT of a two-gigabyte body is one
 *              network blip from starting again; a piece is not.
 *   Instagram  a REELS container fetched by Instagram from `videoUrl`,
 *              polled until status_code is FINISHED, then media_publish.
 *   Threads    a VIDEO container, polled until FINISHED, then threads_publish.
 *
 * `wait` is injectable so a spec can poll a scripted server without sleeping.
 */

export interface Posted { id: string; url: string }

export interface YouTubeMeta {
  snippet: { title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string; defaultAudioLanguage: string };
  status: { privacyStatus: 'public' | 'unlisted' | 'private'; selfDeclaredMadeForKids: false; containsSyntheticMedia: boolean; embeddable: true; license: 'youtube' };
}

/** 16 MiB. YouTube wants every piece but the last to be a multiple of 256 KiB. */
export const YT_PIECE = 16 * 1024 * 1024;

export async function uploadToYouTube(
  http: Http, access: string, file: string, size: number, meta: YouTubeMeta,
): Promise<Posted & { privacy: string }> {
  const start = await http(query('https://www.googleapis.com/upload/youtube/v3/videos', { uploadType: 'resumable', part: 'snippet,status' }), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(meta),
  });
  if (!start.ok) {
    throw new PlatformError('YouTube', start.status, `YouTube ${start.status}: ${platformWords(await readJson(start)) ?? 'the upload was refused'}`);
  }
  const session = start.headers.get('location');
  if (!session) throw new Error('YouTube accepted the upload but gave no address to send it to.');

  const fh = await open(file, 'r');
  try {
    let offset = 0;
    for (;;) {
      const length = Math.min(YT_PIECE, size - offset);
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      if (bytesRead !== length) throw new Error(`the stored video ended early at ${offset + bytesRead} of ${size} bytes`);
      const res = await http(session, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'video/mp4',
          'Content-Length': String(length),
          'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}`,
        },
        body: buf,
      });
      if (res.status === 308) {
        // "Resume Incomplete": the Range header says how much YouTube holds.
        const range = res.headers.get('range');
        const held = range ? Number(range.split('-')[1]) + 1 : offset + length;
        await res.arrayBuffer().catch(() => undefined);
        offset = Number.isFinite(held) ? held : offset + length;
        if (offset >= size) throw new Error('YouTube holds every byte but has not finished the upload.');
        continue;
      }
      const body = await readJson(res) as { id?: string; status?: { privacyStatus?: string } };
      if (!res.ok) throw new PlatformError('YouTube', res.status, `YouTube ${res.status}: ${platformWords(body) ?? 'the upload was refused'}`);
      if (!body.id) throw new Error('YouTube finished the upload without naming the video.');
      return { id: body.id, url: `https://www.youtube.com/watch?v=${body.id}`, privacy: body.status?.privacyStatus ?? 'unknown' };
    }
  } finally {
    await fh.close();
  }
}

type ContainerStatus = { status_code?: string; status?: string; error_message?: string };

/** Poll a Meta container until it is ready to publish. Twenty minutes, then it gives up. */
async function whenFinished(
  http: Http, label: string, url: string, wait: (ms: number) => Promise<void>, everyMs: number, tries: number,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const s = await callJson<ContainerStatus>(http, label, url);
    const code = (s.status_code ?? s.status ?? '').toUpperCase();
    if (code === 'FINISHED' || code === 'PUBLISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`${label} could not process the video: ${s.error_message ?? s.status ?? code}`);
    }
    await wait(everyMs);
  }
  throw new Error(`${label} was still processing the video after ${Math.round((tries * everyMs) / 60000)} minutes. Try again.`);
}

export interface PollPlan { wait?: (ms: number) => Promise<void>; everyMs?: number; tries?: number }

export async function publishReel(
  http: Http, access: string, igUserId: string,
  reel: { videoUrl: string; caption: string; coverUrl?: string | null; handle: string },
  plan: PollPlan = {},
): Promise<Posted> {
  const base = 'https://graph.instagram.com';
  const fields: Record<string, string> = {
    media_type: 'REELS', video_url: reel.videoUrl, caption: reel.caption, share_to_feed: 'true', access_token: access,
  };
  if (reel.coverUrl) fields.cover_url = reel.coverUrl;
  const box = await callJson<{ id: string }>(http, 'Instagram', `${base}/${igUserId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(),
  });
  await whenFinished(http, 'Instagram', query(`${base}/${box.id}`, { fields: 'status_code,status', access_token: access }),
    plan.wait ?? sleep, plan.everyMs ?? 10_000, plan.tries ?? 120);
  const pub = await callJson<{ id: string }>(http, 'Instagram', `${base}/${igUserId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: box.id, access_token: access }).toString(),
  });
  const link = await callJson<{ permalink?: string }>(http, 'Instagram', query(`${base}/${pub.id}`, { fields: 'permalink', access_token: access }))
    .catch(() => ({ permalink: undefined }));
  // PUBLISHED IS PUBLISHED. A permalink that did not come back must not turn
  // a live Reel into a failure row — a retry would post it twice.
  return { id: pub.id, url: link.permalink ?? `https://www.instagram.com/${reel.handle}/` };
}

/**
 * A TEXT post, and the only call here that publishes in one step: a text
 * container is ready the moment it is made, so there is nothing to poll. With
 * `replyTo` it becomes the next post in that thread, which is how a chain is
 * written — Threads has no "post three at once".
 */
export async function publishThreadText(
  http: Http, access: string, userId: string,
  post: { text: string; handle: string; replyTo?: string },
): Promise<Posted> {
  const base = 'https://graph.threads.net/v1.0';
  const fields: Record<string, string> = { media_type: 'TEXT', text: post.text, access_token: access };
  if (post.replyTo) fields.reply_to_id = post.replyTo;
  const box = await callJson<{ id: string }>(http, 'Threads', `${base}/${userId}/threads`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const pub = await callJson<{ id: string }>(http, 'Threads', `${base}/${userId}/threads_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: box.id, access_token: access }).toString(),
  });
  const link = await callJson<{ permalink?: string }>(http, 'Threads', query(`${base}/${pub.id}`, { fields: 'permalink', access_token: access }))
    .catch(() => ({ permalink: undefined }));
  // Published is published: a permalink that did not come back is not a failure.
  return { id: pub.id, url: link.permalink ?? `https://www.threads.com/@${post.handle}` };
}

export async function publishThread(
  http: Http, access: string, userId: string,
  post: { videoUrl: string; text: string; handle: string },
  plan: PollPlan = {},
): Promise<Posted> {
  const base = 'https://graph.threads.net/v1.0';
  const box = await callJson<{ id: string }>(http, 'Threads', `${base}/${userId}/threads`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ media_type: 'VIDEO', video_url: post.videoUrl, text: post.text, access_token: access }).toString(),
  });
  await whenFinished(http, 'Threads', query(`${base}/${box.id}`, { fields: 'status,error_message', access_token: access }),
    plan.wait ?? sleep, plan.everyMs ?? 10_000, plan.tries ?? 120);
  const pub = await callJson<{ id: string }>(http, 'Threads', `${base}/${userId}/threads_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: box.id, access_token: access }).toString(),
  });
  const link = await callJson<{ permalink?: string }>(http, 'Threads', query(`${base}/${pub.id}`, { fields: 'permalink', access_token: access }))
    .catch(() => ({ permalink: undefined }));
  return { id: pub.id, url: link.permalink ?? `https://www.threads.com/@${post.handle}` };
}
