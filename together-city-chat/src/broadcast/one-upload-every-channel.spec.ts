import { mkdtemp, rm, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CHANNELS, missingFor } from './channels';
import { instagramCaption, LIMITS, threadsText, youtubeMeta, AI_LINE, type Words } from './compose';
import { expectedFor, wrongAccount } from './accounts.service';
import { fallbackDraft } from './broadcast.service';
import type { Http } from './http';
import { authorizeUrl, exchangeCode } from './oauth';
import { publishReel, publishThread, uploadToYouTube } from './platforms';
import { readState, seal, sealKey, signState, STATE_TTL_MS, unseal } from './seal';
import { hubUrl, topic, topicForHub, TOPICS } from './topics';
import { bullJobId } from '../shared/queue/queue.service';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * ── ONE UPLOAD, EVERY CHANNEL ───────────────────────────────────────────────
 *
 * Owner, 17 Sep: "Create a together social media page where I upload the video
 * there and all details are automatically uploaded on youtube and instagram
 * channels from there, connect dating with dating site, health with health."
 *
 * The failures this file exists to prevent are the ones that would look like
 * success: a Dating film on the Pets channel because the chooser was one
 * click off; a token readable in a database dump; a Reel recorded as failed
 * after it went out, so Try again posts it twice; a caption the platform
 * refuses because the desk let it grow past the limit.
 */

const KEY = Buffer.alloc(32, 7);
const words = (over: Partial<Words> = {}): Words => ({
  title: 'Why she waited for the right match', description: 'Two people, one question.',
  tags: ['compatibility', 'love story'], caption: 'Would you wait?', threadsText: 'Would you wait for the right one?',
  privacy: 'public', aiDisclosure: false, ...over,
});

/** A scripted server: each call takes the next answer. */
function script(answers: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const http: Http = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status ?? 200, headers: a.headers });
  };
  return { http, calls };
}

describe('a sign-in is kept sealed and handed back only to who asked', () => {
  it('opens what it sealed, and nothing that was touched or sealed under another key', () => {
    const box = seal('{"access":"tok"}', KEY);
    expect(box).not.toContain('tok');
    expect(unseal(box, KEY)).toBe('{"access":"tok"}');
    expect(unseal(box, Buffer.alloc(32, 8))).toBeNull();
    const parts = box.split('.');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'BB' : 'AA');
    expect(unseal(parts.join('.'), KEY)).toBeNull();
  });

  it('refuses a key that is not 32 bytes, rather than sealing with a weak one', () => {
    expect(sealKey({})).toBeNull();
    expect(sealKey({ SOCIAL_TOKEN_KEY: Buffer.alloc(16).toString('base64') })).toBeNull();
    expect(sealKey({ SOCIAL_TOKEN_KEY: Buffer.alloc(32, 1).toString('base64') })?.length).toBe(32);
    expect(sealKey({ SOCIAL_TOKEN_KEY: 'ab'.repeat(32) })?.length).toBe(32);
  });

  it('refuses a state that is forged, altered or old', () => {
    const now = 1_000_000;
    const s = signState({ platform: 'youtube', topic: 'dating', actor: 'u1' }, KEY, now);
    expect(readState(s, KEY, now)?.actor).toBe('u1');
    expect(readState(s, KEY, now + STATE_TTL_MS + 1)).toBeNull();
    expect(readState(s, Buffer.alloc(32, 9), now)).toBeNull();
    const [body, mac] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), actor: 'u2' })).toString('base64url');
    expect(readState(`${forged}.${mac}`, KEY, now)).toBeNull();
  });
});

describe('each slot takes only the account it names', () => {
  const dating = topic('dating')!;

  it('refuses the right Google login on the wrong channel', () => {
    const pets = topic('pets')!;
    expect(wrongAccount('youtube', dating, { externalId: pets.youtube.channelId, handle: '@TogetherCityPets' }))
      .toMatch(/@TogetherCityPets.*Dating slot is for @TogethercityDating/);
    expect(wrongAccount('youtube', dating, { externalId: dating.youtube.channelId, handle: '@TogethercityDating' })).toBeNull();
  });

  it('matches Instagram and Threads by username, whatever the case', () => {
    expect(wrongAccount('instagram', dating, { externalId: '1', handle: 'TogetherCityMatchmaking' })).toBeNull();
    expect(wrongAccount('threads', dating, { externalId: '1', handle: 'togethercity_pets' })).toMatch(/Nothing was saved/);
    expect(expectedFor('instagram', topic('health')!)).toBe('@togethercity_nutrition');
  });

  it('names eighteen different accounts', () => {
    const ids = TOPICS.map((t) => t.youtube.channelId);
    expect(new Set(ids).size).toBe(TOPICS.length);
    expect(new Set(TOPICS.map((t) => t.instagram)).size).toBe(TOPICS.length);
    expect(new Set(TOPICS.map((t) => t.threads)).size).toBe(TOPICS.length);
    for (const id of ids) expect(id).toMatch(/^UC[\w-]{22}$/);
  });
});

describe('the sign-in pages are asked for what keeps the desk working', () => {
  const env = { GOOGLE_OAUTH_CLIENT_ID: 'g', INSTAGRAM_APP_ID: 'i', THREADS_APP_ID: 't', SOCIAL_OAUTH_REDIRECT_URL: 'https://togethercity.app/dev/social/connected' };

  it('asks Google for a refresh token and for the channel chooser every time', () => {
    const u = new URL(authorizeUrl('youtube', 'st', env));
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toContain('select_account');
    expect(u.searchParams.get('prompt')).toContain('consent');
    expect(u.searchParams.get('scope')).toContain('youtube.upload');
    expect(u.searchParams.get('redirect_uri')).toBe(env.SOCIAL_OAUTH_REDIRECT_URL);
  });

  it('asks Instagram to let the owner choose the account, and Threads for publishing', () => {
    const ig = new URL(authorizeUrl('instagram', 'st', env));
    expect(ig.searchParams.get('force_reauth')).toBe('true');
    expect(ig.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    expect(new URL(authorizeUrl('threads', 'st', env)).searchParams.get('scope')).toBe('threads_basic,threads_content_publish');
  });

  it('refuses a Google sign-in that came back without a refresh token', async () => {
    const { http } = script([{ body: { access_token: 'a', expires_in: 3600 } }]);
    await expect(exchangeCode('youtube', 'c', http, env)).rejects.toThrow(/refresh token/);
  });

  it('reads who signed in to Instagram, after the long-lived exchange, with the #_ taken off the code', async () => {
    const { http, calls } = script([
      { body: { data: [{ access_token: 'short', user_id: 5 }] } },
      { body: { access_token: 'long', expires_in: 5_184_000 } },
      { body: { user_id: '1789', username: 'togethercity_pets' } },
    ]);
    const g = await exchangeCode('instagram', 'abc#_', http, env, 0);
    expect(g).toMatchObject({ access: 'long', externalId: '1789', handle: 'togethercity_pets', refresh: null });
    expect(g.expiresAt?.getTime()).toBe(5_184_000_000);
    expect(new URLSearchParams(String(calls[0].init?.body)).get('code')).toBe('abc');
    expect(calls[1].url).toContain('grant_type=ig_exchange_token');
  });

  it('carries the platform\'s own words when it refuses', async () => {
    const { http } = script([{ status: 400, body: { error: { message: 'Invalid platform app', type: 'OAuthException' } } }]);
    await expect(exchangeCode('threads', 'c', http, env)).rejects.toThrow('Threads 400: Invalid platform app');
  });
});

describe('the words fit every wall and always send people to the hub', () => {
  it('links each topic to its own hub — dating to the dating site, health to health', () => {
    expect(hubUrl(topic('dating')!)).toBe('https://togethercity.app/matchmaking');
    expect(hubUrl(topic('health')!)).toBe('https://togethercity.app/medical');
    expect(topicForHub('dating')?.key).toBe('dating');
    expect(topicForHub('medical')?.key).toBe('health');
    expect(topicForHub('nutrition')?.key).toBe('health');
    expect(topicForHub('beauty')).toBeUndefined();
  });

  it('names only hubs and paths the web app really has', () => {
    const router = read('../together-city-react/src/app/router.tsx');
    for (const t of TOPICS) {
      if (t.hubPath !== '/') expect(router).toContain(`{ path: '${t.hubPath}', element: <HubLanding hub=`);
      for (const h of t.hubs) expect(router).toContain(`<HubLanding hub="${h}" />`);
    }
  });

  it('keeps the disclaimer and the hub link when the description is too long', () => {
    const m = youtubeMeta(words({ description: 'word '.repeat(3000), aiDisclosure: true }), topic('health')!);
    expect(Buffer.byteLength(m.snippet.description)).toBeLessThanOrEqual(LIMITS.ytDescriptionBytes);
    expect(m.snippet.description).toContain('https://togethercity.app/medical');
    expect(m.snippet.description).toContain('not medical advice');
    expect(m.snippet.description).toContain(AI_LINE);
    expect(m.status.containsSyntheticMedia).toBe(true);
    expect(m.status.selfDeclaredMadeForKids).toBe(false);
    expect(m.snippet.categoryId).toBe('27');
  });

  it('takes out what YouTube refuses and keeps within its limits', () => {
    const m = youtubeMeta(words({ title: `<b>${'x'.repeat(150)}`, tags: Array.from({ length: 80 }, (_, i) => `tag number ${i}`) }), topic('dating')!);
    expect(m.snippet.title).not.toMatch(/[<>]/);
    expect(Array.from(m.snippet.title).length).toBeLessThanOrEqual(LIMITS.ytTitle);
    const cost = m.snippet.tags.reduce((n, t, i) => n + t.length + (t.includes(' ') ? 2 : 0) + (i ? 1 : 0), 0);
    expect(cost).toBeLessThanOrEqual(LIMITS.ytTagChars);
  });

  it('keeps an Instagram caption under 2,200 characters and 30 hashtags, the topic\'s tags once', () => {
    const many = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(' ');
    const c = instagramCaption(words({ caption: `${'long line '.repeat(300)} ${many} #Dating` }), topic('dating')!);
    expect(Array.from(c).length).toBeLessThanOrEqual(LIMITS.igCaption);
    expect((c.match(/#[\p{L}\p{N}_]+/gu) ?? []).length).toBeLessThanOrEqual(LIMITS.igHashtags);
    expect(c.match(/#TogetherCity/g)).toHaveLength(1);
    expect(c).toContain('togethercity.app/matchmaking');
  });

  it('keeps a Threads post under 500 characters with the link and disclaimer intact', () => {
    const s = threadsText(words({ threadsText: 'y'.repeat(900) }), topic('pets')!);
    expect(Array.from(s).length).toBeLessThanOrEqual(LIMITS.threadsText);
    expect(s).toContain('https://togethercity.app/pets');
    expect(s).toContain('Not veterinary advice');
  });

  it('drafts plain words when the model is away', () => {
    const d = fallbackDraft(topic('fitness')!, '', 'squat-form_fix.mp4');
    expect(d.title).toBe('squat form fix');
    expect(d.tags).toContain('Together City');
  });
});

describe('an upload is recorded only as the platform reported it', () => {
  const now = { wait: async () => undefined, everyMs: 1, tries: 5 };

  it('publishes a Reel only after Instagram says the container is FINISHED', async () => {
    const { http, calls } = script([
      { body: { id: 'c1' } },
      { body: { status_code: 'IN_PROGRESS' } },
      { body: { status_code: 'FINISHED' } },
      { body: { id: 'm1' } },
      { body: { permalink: 'https://www.instagram.com/reel/abc/' } },
    ]);
    const r = await publishReel(http, 'tok', '1789', { videoUrl: 'https://b/v.mp4', caption: 'hi', coverUrl: 'https://b/p.jpg', handle: 'togethercity_pets' }, now);
    expect(r).toEqual({ id: 'm1', url: 'https://www.instagram.com/reel/abc/' });
    const box = new URLSearchParams(String(calls[0].init?.body));
    expect(box.get('media_type')).toBe('REELS');
    expect(box.get('share_to_feed')).toBe('true');
    expect(box.get('cover_url')).toBe('https://b/p.jpg');
    expect(calls[3].url).toContain('/1789/media_publish');
  });

  it('says Instagram\'s own reason when the video cannot be processed', async () => {
    const { http } = script([{ body: { id: 'c1' } }, { body: { status_code: 'ERROR', status: 'Error: aspect ratio' } }]);
    await expect(publishReel(http, 't', '1', { videoUrl: 'u', caption: '', handle: 'h' }, now)).rejects.toThrow(/aspect ratio/);
  });

  it('never turns a published thread into a failure because its link did not come back', async () => {
    const { http } = script([
      { body: { id: 'c1' } }, { body: { status: 'FINISHED' } }, { body: { id: 't1' } },
      { status: 500, body: { error: { message: 'temporary' } } },
    ]);
    const r = await publishThread(http, 't', '9', { videoUrl: 'u', text: 'x', handle: 'togethercity' }, now);
    expect(r).toEqual({ id: 't1', url: 'https://www.threads.com/@togethercity' });
  });

  it('uploads to YouTube as a resumable session and reports the privacy YouTube chose', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yt-spec-'));
    try {
      const file = join(dir, 'v.mp4');
      await writeFile(file, Buffer.alloc(1000, 1));
      const { http, calls } = script([
        { status: 200, headers: { location: 'https://upload.example/session' } },
        { status: 200, body: { id: 'vid1', status: { privacyStatus: 'private' } } },
      ]);
      const meta = youtubeMeta(words(), topic('dating')!);
      const r = await uploadToYouTube(http, 'tok', file, 1000, meta);
      expect(r).toEqual({ id: 'vid1', url: 'https://www.youtube.com/watch?v=vid1', privacy: 'private' });
      expect(calls[0].url).toContain('uploadType=resumable');
      expect((calls[0].init?.headers as Record<string, string>)['X-Upload-Content-Length']).toBe('1000');
      expect((calls[1].init?.headers as Record<string, string>)['Content-Range']).toBe('bytes 0-999/1000');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the publish job is one the queue will take', () => {
  it('gives BullMQ ids without the colon it refuses, the same way every time', () => {
    /* BullMQ 6 throws "Custom Id cannot contain :" unless the id splits into
       exactly three parts — which silently kept transcode:<id> off the queue. */
    expect(bullJobId('transcode:abc')).toBe('transcode-abc');
    expect(bullJobId('reindex:u1')).toBe(bullJobId('reindex:u1'));
    expect(bullJobId(undefined)).toBeUndefined();
    expect(read('src/broadcast/broadcast.service.ts')).not.toMatch(/jobId: `social:/);
  });
});

describe('the desk is behind the developer locks and says what it needs', () => {
  it('guards every desk route with the developer password, and exposes no public route', () => {
    const desk = read('src/broadcast/broadcast.controller.ts');
    expect(desk).toMatch(/@Controller\('dev\/media'\)\s*\n@UseGuards\(DevPasswordGuard\)/);
    for (const f of ['broadcast.controller.ts', 'hub-videos.controller.ts']) {
      expect(read(`src/broadcast/${f}`)).not.toMatch(/@Public\(\)/);
    }
  });

  it('lists every app variable it reads in the manifest and the example', () => {
    const manifest = read('src/dev/env-manifest.ts');
    const example = read('.env.example');
    for (const c of CHANNELS) {
      for (const n of c.needs) {
        expect(manifest).toContain(`name: '${n}'`);
        expect(example).toMatch(new RegExp(`^${n}=`, 'm'));
      }
    }
  });

  it('names what is missing and never a value', () => {
    const yt = CHANNELS.find((c) => c.key === 'youtube')!;
    expect(missingFor(yt, { GOOGLE_OAUTH_CLIENT_ID: 'x'.repeat(40) })).not.toContain('GOOGLE_OAUTH_CLIENT_ID');
    expect(missingFor(CHANNELS.find((c) => c.key === 'tv')!, {})).toEqual([]);
  });
});
