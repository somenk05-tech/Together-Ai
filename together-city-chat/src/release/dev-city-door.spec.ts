import { readFileSync } from 'fs';
import { join } from 'path';
import { devCopyAdmits, isDevCopy } from './dev-city-door';

/** The developer copy lets in the owner and nobody else (owner, 16 Sep). */
describe('the developer copy has one door', () => {
  const dev = { RELEASE_CHANNEL: 'dev', DEV_PAGE_ACCOUNTS: '@Somen, usr_123' };

  it('admits the named accounts, by handle or by id, with or without the @', () => {
    expect(devCopyAdmits({ handle: 'somen' }, dev)).toBe(true);
    expect(devCopyAdmits({ handle: '@SOMEN' }, dev)).toBe(true);
    expect(devCopyAdmits({ id: 'USR_123', handle: 'renamed' }, dev)).toBe(true);
  });

  it('refuses everybody else, and everybody when the list is empty', () => {
    expect(devCopyAdmits({ id: 'usr_9', handle: 'priya' }, dev)).toBe(false);
    expect(devCopyAdmits({ handle: 'somen' }, { RELEASE_CHANNEL: 'dev' })).toBe(false);
  });

  it('never closes the live site, a laptop or the test suites', () => {
    expect(isDevCopy({ NODE_ENV: 'production' })).toBe(false);
    expect(isDevCopy({ NODE_ENV: 'test' })).toBe(false);
    expect(isDevCopy({ RELEASE_CHANNEL: 'live' })).toBe(false);
    expect(devCopyAdmits({ handle: 'anyone' }, { NODE_ENV: 'production' })).toBe(true);
    expect(devCopyAdmits({ handle: 'anyone' }, {})).toBe(true);
  });

  it('is asked at both doors: a new account and a sign-in', () => {
    const src = readFileSync(join(__dirname, '..', 'auth', 'auth.service.ts'), 'utf8');
    const register = src.slice(src.indexOf('async register('), src.indexOf('async handleAvailable('));
    const login = src.slice(src.indexOf('async login('), src.indexOf('clearFailures(dto.handle)', src.indexOf('async login(')));
    expect(register).toMatch(/devCopyAdmits\(\{ handle: dto\.handle \}\)/);
    expect(login).toMatch(/devCopyAdmits\(\{ id: user\.id, handle: user\.handle \}\)/);
  });
});
