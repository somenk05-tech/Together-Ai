/**
 * Golden master — the upload gate's decisions: which extension a file is
 * stored under (clinics hand out every format there is; nothing real is
 * rejected), and which requests are refused outright.
 */
import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

function build(maxBytes: number | undefined = undefined) {
  const svc = Object.create(MediaService.prototype) as MediaService;
  const seen: Array<{ kind: string; userId: string; mime: string; ext: string }> = [];
  (svc as any).storage = {
    presignUpload: async (userId: string, mime: string, ext: string) => { seen.push({ kind: 'public', userId, mime, ext }); return { uploadUrl: 'u', publicUrl: 'p', key: 'k' }; },
    presignHealthUpload: async (userId: string, mime: string, ext: string) => { seen.push({ kind: 'health', userId, mime, ext }); return { uploadUrl: 'u', key: 'k', expiresInSec: 900 }; },
  };
  (svc as any).config = { get: () => maxBytes };
  return { svc, seen };
}

describe('media golden master', () => {
  it('extension per mime — knowns mapped, unknowns derived, never rejected', async () => {
    const { svc, seen } = build();
    for (const mime of [
      'image/jpeg', 'image/heic', 'image/tiff', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv', 'application/x-foo+zip', 'application/octet-stream', 'weird/',
    ]) {
      await svc.requestUpload('u1', mime, 1000);
    }
    expect(seen.map((s) => `${s.mime} -> .${s.ext}`)).toMatchSnapshot();
  });

  it('refusals: oversize (default 50MB cap) and missing type', async () => {
    const { svc } = build();
    await expect(svc.requestUpload('u1', 'image/jpeg', 52428801)).rejects.toThrow(BadRequestException);
    await expect(svc.requestUpload('u1', '', 1000)).rejects.toThrow(BadRequestException);
  });

  it('the health vault path presigns privately with the same rules', async () => {
    const { svc, seen } = build(100);
    await expect(svc.requestPrivateUpload('u1', 'image/heic', 101)).rejects.toThrow(BadRequestException);
    await svc.requestPrivateUpload('u1', 'image/heic', 99);
    expect(seen).toMatchSnapshot();
  });
});
