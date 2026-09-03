/**
 * A FOUNDER HANDLE IS RESERVED — launch blocker 4 (audits of 1 and 2 Sep).
 *
 * console-bootstrap.ts grants `founder` at every boot to whoever holds a
 * handle in CONSOLE_FOUNDERS. Only MODERATION_ADMINS was reserved at the two
 * doors that hand out handles (registration, PATCH /profile), and a deleted
 * account releases its handle by renaming it to a tombstone. So: a founder
 * deletes their account, the next citizen to register under that name
 * becomes founder on the next deploy, and the founder's own grant row sat
 * live on the tombstone meanwhile.
 *
 * Three things close it, and this file holds each:
 *   1. the reservation covers both lists, from one function;
 *   2. both doors call that function (registration and rename);
 *   3. deleting an account revokes its console grants, dated.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('1 · one reservation, both lists', () => {
  const load = (env: Record<string, string>) => {
    let mod!: typeof import('../auth/admin');
    jest.isolateModules(() => {
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try { mod = require('../auth/admin'); } finally { process.env = saved; }
    });
    return mod;
  };

  it('refuses a founder handle exactly as it refuses a moderator handle', () => {
    const { isReservedAdminHandle, FOUNDER_HANDLES, ADMIN_HANDLES } = load({ CONSOLE_FOUNDERS: '@Somen, priya', MODERATION_ADMINS: 'mod1' });
    expect([...FOUNDER_HANDLES]).toEqual(['somen', 'priya']);
    expect([...ADMIN_HANDLES]).toEqual(['mod1']);
    expect(isReservedAdminHandle('somen')).toBe(true);
    expect(isReservedAdminHandle('@Priya')).toBe(true);
    expect(isReservedAdminHandle('mod1')).toBe(true);
    expect(isReservedAdminHandle('ravi')).toBe(false);
  });

  it('still lets the holder keep their own name on a rename', () => {
    const { isReservedAdminHandle } = load({ CONSOLE_FOUNDERS: 'somen', MODERATION_ADMINS: '' });
    expect(isReservedAdminHandle('somen', 'somen')).toBe(false);
    expect(isReservedAdminHandle('somen', 'ravi')).toBe(true);
  });

  it('is empty when the variable is unset', () => {
    const { FOUNDER_HANDLES } = load({ CONSOLE_FOUNDERS: '', MODERATION_ADMINS: '' });
    expect(FOUNDER_HANDLES).toEqual([]);
  });
});

describe('2 · both doors ask', () => {
  it('registration and rename both go through isReservedAdminHandle', () => {
    const auth = stripComments(src('auth/auth.service.ts'));
    const profile = stripComments(src('profile/profile.service.ts'));
    const register = auth.slice(auth.indexOf('async register('), auth.indexOf('findUnique({ where: { handle: dto.handle.toLowerCase() } })'));
    expect(register).toMatch(/isReservedAdminHandle\(dto\.handle\)/);
    expect(profile).toMatch(/isReservedAdminHandle\(handle, me\?\.handle\)/);
  });

  it('the bootstrap reads the same list the doors reserve', () => {
    const boot = stripComments(src('admin/console-bootstrap.ts'));
    expect(boot).toMatch(/import \{ FOUNDER_HANDLES \} from '\.\.\/auth\/admin'/);
    expect(boot).not.toMatch(/process\.env\.CONSOLE_FOUNDERS/);
  });
});

describe('3 · a deleted account holds no role', () => {
  it('deleteAccount revokes every live grant, after the tombstone and the sign-out', () => {
    const auth = stripComments(src('auth/auth.service.ts'));
    const del = auth.slice(auth.indexOf('async deleteAccount('));
    const body = del.slice(0, del.search(/\n  (async |private )/));
    const revoke = body.indexOf('adminGrant.updateMany');
    expect(revoke).toBeGreaterThan(-1);
    expect(body.slice(revoke)).toMatch(/where: \{ userId, revokedAt: null \}/);
    expect(body.slice(revoke)).toMatch(/data: \{ revokedAt: new Date\(\) \}/);
    expect(revoke).toBeGreaterThan(body.indexOf('handle: tombstone'));
    expect(revoke).toBeGreaterThan(body.indexOf('revokeAll(userId)'));
  });

  it('so the bootstrap cannot re-grant it: the tombstone is not a listed handle', () => {
    const auth = stripComments(src('auth/auth.service.ts'));
    expect(auth).toMatch(/const tombstone = `deleted_\$\{userId/);
  });
});
