import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── THE THREADS PAGE (owner, 18 Sep) ────────────────────────────────────────
 * "Create a separate content posting page for threads … for content text
 * posting." Its own tab, text only, one topic at a time.
 */
describe('Threads posts, on /dev', () => {
  const page = strip(read('src/features/dev/ThreadsDesk.tsx'));
  const api = strip(read('src/features/dev/threads.api.ts'));

  it('is a tab of its own, and /dev?tab=threads opens on it', () => {
    const dev = strip(read('src/features/dev/pages/Dev.tsx'));
    expect(dev).toContain("{tab === 'threads' && <DevThreads password={password} />}");
    expect(dev).toMatch(/get\('tab'\) === 'threads'/);
    expect(dev).toContain("['threads', 'Threads posts']");
  });

  it('posts text only — it never asks for a file', () => {
    expect(page).not.toMatch(/type="file"|storageKey|uploadPost/);
    expect(api).toContain("'/dev/media/threads'");
    expect(api).toContain("'/dev/media/threads/suggest'");
  });

  it('is one topic at a time, and says when that profile is not connected', () => {
    expect(page).toContain('useState<TopicKey>');
    expect(page).toMatch(/Threads is not connected for this topic/);
    expect(page).toMatch(/ready = Boolean\(slot\?\.connected\)/);
  });

  it('counts characters against the platform’s own limit, with room for the link', () => {
    expect(page).toContain('{THREADS_LIMIT - LINK_ROOM}');
    expect(page).toContain('maxLength={THREADS_LIMIT}');
  });

  it('offers at most two follow-ups, and calls them replies', () => {
    expect(page).toContain('ups.length < 2');
    expect(page).toMatch(/posted as a reply/);
  });

  it('leaves the hub link off until it is ticked', () => {
    expect(page).toContain('useState(false)');
    expect(page).toMatch(/a link costs reach on Threads/);
  });

  it('keeps its looks in the shared sheet, with no inline styles', () => {
    expect(page).not.toMatch(/style=\{\{/);
    expect(page).toContain('md-wrap');
  });
});
