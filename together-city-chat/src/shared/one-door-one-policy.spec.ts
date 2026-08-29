import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { originPolicy } from './cors-policy';

/**
 * ── ONE ORIGIN POLICY, NOT TWO (fifth audit, 29 Aug) ────────────────────────
 *
 * `main.ts` reflected any `*.vercel.app` origin with credentials until the
 * 26 Aug audit found the drive-by account takeover it enabled, and was
 * rewritten to accept the allowlist, our own domain, and the aliases of ONE
 * named project. `shared/ws-cors.ts` was a copy of the policy from before that
 * rewrite, under a docblock that said "same policy as the HTTP CORS in
 * main.ts" — the specific failure CLAUDE.md's Fold note describes: a second
 * copy that still LOOKS correct while one of the two has moved.
 *
 * These read the source because that is where the duplication would come back:
 * the behaviour below can be right in both files and still be written twice.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
/** Source with the prose taken out: a docblock may name the old policy — that
 *  is how it stays reviewable — but no matcher may still be written twice. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('both doors read the same origin policy', () => {
  it('the socket gateway does not carry a matcher of its own', () => {
    const ws = code('shared/ws-cors.ts');
    expect(ws).toMatch(/from '\.\/cors-policy'/);
    expect(ws).not.toMatch(/vercel\.app/);
    expect(ws).not.toMatch(/togethercity/);
  });

  it('and neither does main.ts', () => {
    const main = code('main.ts');
    expect(main).toMatch(/originPolicy\(corsOrigin, prod\)/);
    // The regexes moved out; only the shared module may hold them.
    expect(main).not.toMatch(/isOwnDomain = /);
    expect(main).not.toMatch(/CORS_PREVIEW_PROJECT/);
  });

  it('and `*` is still refused in production, loudly, at boot', () => {
    expect(read('main.ts')).toMatch(/CORS_ORIGIN=\* is not allowed in production/);
  });
});

describe('what the shared policy actually allows', () => {
  /* The preview matcher reads env when the policy is BUILT, not when the
     module loads, so each case can set its own and put it back. */
  const policyFor = (corsOrigin: string, prod: boolean, env: Record<string, string> = {}) => {
    const before = { ...process.env };
    Object.assign(process.env, env);
    try {
      return originPolicy(corsOrigin, prod);
    } finally {
      process.env = before;
    }
  };

  it('refuses an arbitrary vercel subdomain in production — the takeover origin', () => {
    const p = policyFor('https://togethercity.app', true, { CORS_PREVIEW_PROJECT: '', CORS_PREVIEW_TEAM: '' });
    expect(p.allows('https://anything-anyone-deployed.vercel.app')).toBe(false);
  });

  it('allows our own domain and its subdomains', () => {
    const p = policyFor('', true);
    expect(p.allows('https://togethercity.app')).toBe(true);
    expect(p.allows('https://www.togethercity.app')).toBe(true);
    expect(p.allows('https://togethercity.app.evil.example')).toBe(false);
  });

  it('allows ONE named project’s previews and nothing else on that host', () => {
    const p = policyFor('', true, { CORS_PREVIEW_PROJECT: 'city', CORS_PREVIEW_TEAM: 'somen' });
    expect(p.allows('https://city-git-main-somen.vercel.app')).toBe(true);
    expect(p.allows('https://city-a1b2c3d4-somen.vercel.app')).toBe(true);
    expect(p.allows('https://other-git-main-somen.vercel.app')).toBe(false);
  });

  it('lets an origin-less request through — curl, same-origin, server to server', () => {
    expect(policyFor('', true).allows(undefined)).toBe(true);
  });

  it('and the development wildcard is development only', () => {
    expect(policyFor('*', false).allows('https://anywhere.example')).toBe(true);
    expect(policyFor('*', true).allows('https://anywhere.example')).toBe(false);
  });
});
