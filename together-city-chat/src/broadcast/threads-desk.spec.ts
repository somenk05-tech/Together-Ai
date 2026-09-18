import { readFileSync } from 'fs';
import { join } from 'path';
import type { Http } from './http';
import { publishThreadText } from './platforms';
import { fallbackThread, LINK_ROOM, THREADS_LIMIT } from './threads-desk.service';
import { topic } from './topics';

/**
 * ── THREADS, IN WORDS (owner, 18 Sep) ───────────────────────────────────────
 *
 * "Create a separate content posting page for threads … for content text
 * posting." A text post is the one thing on this desk that cannot be retried
 * safely halfway: the head is live the moment it returns, so a chain must go
 * out in order and stop where it breaks, and the page must say which part
 * went. These are the assertions that keep that true.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

function script(answers: Array<{ status?: number; body?: unknown }>) {
  const calls: Array<{ url: string; body: string }> = [];
  const http: Http = async (url, init) => {
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return { http, calls };
}

describe('a Threads text post', () => {
  it('is a TEXT container published in one step — no video, no polling', async () => {
    const s = script([{ body: { id: 'box1' } }, { body: { id: 'pub1' } }, { body: { permalink: 'https://www.threads.com/@t/post/1' } }]);
    const done = await publishThreadText(s.http, 'tok', '99', { text: 'Who asked first?', handle: 'togethercitymatchmaking' });
    expect(done).toEqual({ id: 'pub1', url: 'https://www.threads.com/@t/post/1' });
    expect(s.calls).toHaveLength(3);
    expect(s.calls[0].body).toContain('media_type=TEXT');
    expect(s.calls[0].body).not.toContain('video_url');
    // A text container is ready at once: nothing between the container and publish.
    expect(s.calls[1].url).toContain('threads_publish');
  });

  it('carries reply_to_id when it is the next post in a chain, and never otherwise', async () => {
    const head = script([{ body: { id: 'b' } }, { body: { id: 'p1' } }, { body: { permalink: 'u' } }]);
    await publishThreadText(head.http, 'tok', '99', { text: 'one', handle: 'h' });
    expect(head.calls[0].body).not.toContain('reply_to_id');

    const reply = script([{ body: { id: 'b2' } }, { body: { id: 'p2' } }, { body: { permalink: 'u2' } }]);
    await publishThreadText(reply.http, 'tok', '99', { text: 'two', handle: 'h', replyTo: 'p1' });
    expect(reply.calls[0].body).toContain('reply_to_id=p1');
  });

  it('is live even when the permalink is not returned — a retry would post it twice', async () => {
    const s = script([{ body: { id: 'b' } }, { body: { id: 'p' } }, { status: 500, body: {} }]);
    const done = await publishThreadText(s.http, 'tok', '99', { text: 'x', handle: 'togethercity_pets' });
    expect(done.id).toBe('p');
    expect(done.url).toBe('https://www.threads.com/@togethercity_pets');
  });

  it('answers a refusal in the platform’s own words', async () => {
    const s = script([{ status: 400, body: { error: { message: 'Text is too long' } } }]);
    await expect(publishThreadText(s.http, 'tok', '99', { text: 'x', handle: 'h' })).rejects.toThrow('Threads 400: Text is too long');
  });
});

describe('the desk around it', () => {
  const service = read('src/broadcast/threads-desk.service.ts');
  const controller = read('src/broadcast/broadcast.controller.ts');

  it('keeps the first post short enough for the tracked link to fit', () => {
    expect(THREADS_LIMIT).toBe(500);
    expect(controller).toContain('max(THREADS_LIMIT - 60)');
    expect(LINK_ROOM).toBe(60);
  });

  it('records the post as content, so the analytics count it beside the films', () => {
    expect(service).toContain("kind: 'text'");
    expect(service).toContain("channel: 'threads', state: 'pending'");
  });

  it('adds a link only when the tick box asked for it, and then the tracked one', () => {
    expect(service).toMatch(/dto\.hubLink \? `\$\{text\}\\n\\n\$\{trackedLink\(t, 'threads', post\.id\)\}` : text/);
  });

  it('stops the chain at the first refusal and says which part went out', () => {
    expect(service).toContain('replyError');
    expect(service).toMatch(/did not post/);
    // The head is already recorded as posted: the page must not offer a retry
    // of the whole chain.
    expect(service).toContain("state: 'posted'");
  });

  it('refuses a topic whose Threads profile is not connected, before anything is written', () => {
    expect(service).toMatch(/Threads is not connected for/);
    const wrote = service.indexOf('mediaPost.create');
    expect(service.indexOf('is not connected for')).toBeLessThan(wrote);
  });

  it('writes for the world, like the video desk', () => {
    expect(service).toMatch(/the whole world, the United States included/);
    expect(service).toContain('American spelling');
  });

  it('is a route a signed-in founder reaches, with the page password', () => {
    expect(controller).toContain("@Post('threads')");
    expect(controller).toContain("@Post('threads/suggest')");
    expect(controller).toMatch(/threadPost\(@CurrentUser\(\) user: JwtUser/);
    expect(controller).toMatch(/threadSuggest\(@CurrentUser\(\) user: JwtUser/);
  });

  it('has words to show when the model is not configured', () => {
    const t = topic('pets') as NonNullable<ReturnType<typeof topic>>;
    const d = fallbackThread(t, 'the cat knocked the glass off again');
    expect(d.text).toContain('the cat knocked the glass off again');
    expect(d.followUps).toEqual([]);
    expect(fallbackThread(t, '').text).toContain('Pets');
  });
});
