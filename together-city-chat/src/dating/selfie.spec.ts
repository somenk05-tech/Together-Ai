import { carrySelfie, selfieOnFile, selfieTakenAt, SELFIE_KEY, SELFIE_AT } from './selfie';

/**
 * The mark is the server's to write, and a profile save is the citizen's. This
 * is the seam between them: a save may not claim a selfie, and may not lose one.
 */
describe('a selfie mark only the server may write', () => {
  const stored = { [SELFIE_KEY]: 'dating/u1/selfie.jpg', [SELFIE_AT]: '2026-08-27T10:00:00.000Z' };

  it('carries the stored mark through a profile save', () => {
    const out = carrySelfie({ city: 'Mumbai' }, stored);
    expect(out).toEqual({ city: 'Mumbai', ...stored });
  });

  it('refuses a mark the client tried to write', () => {
    const out = carrySelfie({
      city: 'Mumbai',
      selfieVerified: true,
      selfiePhoto: 'data:image/jpeg;base64,AAAA',
      selfieVerifiedAt: '2020-01-01T00:00:00.000Z',
      [SELFIE_KEY]: 'dating/someone-else/face.jpg',
      [SELFIE_AT]: '2020-01-01T00:00:00.000Z',
    }, null);
    expect(out).toEqual({ city: 'Mumbai' });
  });

  it('cannot be cleared by a save either — only by the endpoint that owns it', () => {
    const out = carrySelfie({ city: 'Pune' }, stored);
    expect(selfieOnFile(out)).toBe(true);
  });

  it('reads the fact off the key, and the date only when there is one', () => {
    expect(selfieOnFile(stored)).toBe(true);
    expect(selfieOnFile({})).toBe(false);
    expect(selfieOnFile({ [SELFIE_KEY]: '' })).toBe(false);
    expect(selfieOnFile(null)).toBe(false);
    expect(selfieTakenAt(stored)).toBe('2026-08-27T10:00:00.000Z');
    expect(selfieTakenAt({ [SELFIE_KEY]: 'dating/u1/s.jpg' })).toBeNull();
    expect(selfieTakenAt({ [SELFIE_AT]: '2026-08-27T10:00:00.000Z' })).toBeNull();
  });
});
