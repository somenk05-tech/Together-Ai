import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── AN OLD DATING LINK KEEPS WHAT CAME AFTER THE PATH (31 Aug) ──
 *
 * The hub was renamed Dating → Matchmaking and `/dating/*` became redirects.
 * `<Navigate to="/matchmaking/chats">` keeps the path and throws the query
 * string away — and `?c=<conversationId>` is the whole address of the thread
 * a push notification was about. Every notification row written before the
 * rename holds `/dating/chats?c=…`, and those rows cannot be edited by a
 * deploy. A redirect that loses the `?c=` puts a citizen who tapped "Priya
 * sent you a message" on a list of chats, to find the thread themselves.
 *
 * The router's own routes drag in twenty lazy pages, so the redirect's BODY
 * is exercised here through the same hook it uses, and the second test pins
 * that router.tsx still routes every /dating path through that component
 * rather than a bare <Navigate> that would drop the query again.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/** The body of DatingMoved in router.tsx, minus the <Navigate> it renders. */
function Where({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <span>{`${to}${search}${hash}`}</span>;
}

function land(from: string, to: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[from]}>
      <Routes><Route path="/dating/chats" element={<Where to={to} />} /></Routes>
    </MemoryRouter>,
  );
}

describe('an old dating link keeps what came after it', () => {
  it('carries the conversation id across the rename', () => {
    expect(land('/dating/chats?c=c9', '/matchmaking/chats')).toContain('/matchmaking/chats?c=c9');
  });

  it('carries a hash too, and lands clean with neither', () => {
    expect(land('/dating/chats?c=c9#last', '/matchmaking/chats')).toContain('/matchmaking/chats?c=c9#last');
    expect(land('/dating/chats', '/matchmaking/chats')).toContain('>/matchmaking/chats<');
  });

  it('and every /dating redirect in the router is that component, not a bare <Navigate>', () => {
    const lines = read('./router.tsx').split('\n').filter((l) => /\{\s*path:\s*'\/dating/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(8);
    for (const l of lines) expect(l).toMatch(/element:\s*<DatingMoved to="\/matchmaking/);
  });

  it('and DatingMoved actually reads the location, rather than being a renamed <Navigate>', () => {
    const src = read('./router.tsx');
    const fn = src.slice(src.indexOf('function DatingMoved('), src.indexOf('const DrivePage'));
    expect(fn).toMatch(/const \{ search, hash \} = useLocation\(\)/);
    expect(fn).toMatch(/\$\{to\}\$\{search\}\$\{hash\}/);
  });
});
