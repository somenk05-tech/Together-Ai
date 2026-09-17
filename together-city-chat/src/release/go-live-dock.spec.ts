import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DevAccountGuard } from './dev-account.guard';

/**
 * The floating Go live button (owner, 16 Sep): every developer page may ask
 * what is waiting, but only the owner, only on the developer copy — and the
 * press itself still goes through the password-guarded route.
 */
const ctx = (user?: { sub?: string; handle?: string }) => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
}) as unknown as ExecutionContext;

describe('what is waiting to go live', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('answers the owner on the developer copy', () => {
    Object.assign(process.env, { RELEASE_CHANNEL: 'dev', DEV_PAGE_ACCOUNTS: 'somen' });
    expect(new DevAccountGuard().canActivate(ctx({ sub: 'u1', handle: 'somen' }))).toBe(true);
  });

  it('refuses anybody else, and everybody on the live site', () => {
    Object.assign(process.env, { RELEASE_CHANNEL: 'dev', DEV_PAGE_ACCOUNTS: 'somen' });
    expect(() => new DevAccountGuard().canActivate(ctx({ sub: 'u2', handle: 'priya' }))).toThrow(ForbiddenException);
    expect(() => new DevAccountGuard().canActivate(ctx())).toThrow(ForbiddenException);
    process.env.RELEASE_CHANNEL = 'live';
    expect(() => new DevAccountGuard().canActivate(ctx({ sub: 'u1', handle: 'somen' }))).toThrow(ForbiddenException);
  });

  it('refuses a second person who may only sign in to the copy (17 Sep)', () => {
    Object.assign(process.env, { RELEASE_CHANNEL: 'dev', DEV_PAGE_ACCOUNTS: 'somen', DEV_COPY_ACCOUNTS: 'somen,shruti' });
    expect(new DevAccountGuard().canActivate(ctx({ sub: 'u1', handle: 'somen' }))).toBe(true);
    expect(() => new DevAccountGuard().canActivate(ctx({ sub: 'u3', handle: 'shruti' }))).toThrow(ForbiddenException);
  });

  it('only reads: the press stays behind the dev password', () => {
    const pending = readFileSync(join(__dirname, 'pending.controller.ts'), 'utf8');
    expect(pending).not.toMatch(/@Post/);
    const release = readFileSync(join(__dirname, 'release.controller.ts'), 'utf8');
    expect(release).toMatch(/@UseGuards\(DevPasswordGuard\)/);
    expect(release).toMatch(/@Post\('go-live'\)/);
  });
});
