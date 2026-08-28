import * as fs from 'fs';
import * as path from 'path';
import { API_PREFIX, apiUrl } from './api-prefix';

/**
 * The prefix is mounted in main.ts and read again wherever a URL is MINTED
 * rather than received. One constant, and a joiner that does not care which of
 * two right answers an operator typed into PUBLIC_API_URL.
 */
describe('apiUrl', () => {
  it('adds the prefix when the base leaves it off', () => {
    expect(apiUrl('https://api.togethercity.app', 'dating/photo/abc'))
      .toBe('https://api.togethercity.app/api/dating/photo/abc');
  });

  it('does not add it twice when the base already carries it', () => {
    expect(apiUrl('https://api.togethercity.app/api', 'dating/photo/abc'))
      .toBe('https://api.togethercity.app/api/dating/photo/abc');
  });

  it('forgives a trailing slash, and a leading one on the path', () => {
    expect(apiUrl('https://api.togethercity.app/', '/dating/photo/abc'))
      .toBe('https://api.togethercity.app/api/dating/photo/abc');
    expect(apiUrl('https://api.togethercity.app/api/', '/dating/photo/abc'))
      .toBe('https://api.togethercity.app/api/dating/photo/abc');
  });

  it('does not mistake a host that merely ends in the letters for the prefix', () => {
    // `…/notapi` is a path segment of its own, not the prefix.
    expect(apiUrl('https://example.com/notapi', 'x')).toBe('https://example.com/notapi/api/x');
  });

  it('is the prefix main.ts actually mounts', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toContain('setGlobalPrefix(API_PREFIX)');
    expect(API_PREFIX).toBe('api');
  });
});
