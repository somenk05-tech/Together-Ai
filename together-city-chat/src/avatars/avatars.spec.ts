import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvatarsService } from './avatars.service';
import { DeterministicAvatarProvider } from './avatar-provider';
import { catalogue, describeInputs, inputsKey, normaliseInputs, DEFAULT_INPUTS } from './avatar-inputs';
import { renderAvatarSvg } from './avatar-render';

const NOW = new Date('2026-07-29T12:00:00Z');

describe('the catalogue is the moderation policy', () => {
  it('accepts nothing outside the menu, whatever is sent', () => {
    const out = normaliseInputs({ skinTone: '"><script>', hairStyle: 42, background: null });
    expect(out.skinTone).toBe(DEFAULT_INPUTS.skinTone);
    expect(out.hairStyle).toBe(DEFAULT_INPUTS.hairStyle);
    expect(catalogue().skinTone).toContain(out.skinTone);
  });

  it('has no free-text field anywhere — that is what makes it unmoderatable-by-construction', () => {
    const values = Object.values(normaliseInputs({}));
    const menus = Object.values(catalogue()).filter(Array.isArray) as string[][];
    for (const v of values) {
      expect(menus.some((m) => m.includes(v as string))).toBe(true);
    }
  });

  it('keys the same choices identically, so a duplicate is recognisable', () => {
    expect(inputsKey(normaliseInputs({ hairStyle: 'wavy' }))).toBe(inputsKey(normaliseInputs({ hairStyle: 'wavy' })));
    expect(inputsKey(normaliseInputs({ hairStyle: 'wavy' }))).not.toBe(inputsKey(normaliseInputs({ hairStyle: 'bun' })));
  });

  it('describes the choices in words, for the provider that will want a prompt', () => {
    const text = describeInputs(normaliseInputs({ hairStyle: 'bald', accessory: 'glasses' }));
    expect(text).toContain('bald');
    expect(text).toContain('glasses');
  });
});

describe('the renderer', () => {
  it('is deterministic — the same choices give byte-identical SVG', () => {
    const a = renderAvatarSvg(normaliseInputs({ skinTone: 'deep', hairStyle: 'afro' }));
    const b = renderAvatarSvg(normaliseInputs({ skinTone: 'deep', hairStyle: 'afro' }));
    expect(a).toBe(b);
  });

  it('actually changes with the choices, rather than drawing one face', () => {
    const seen = new Set(catalogue().hairStyle.map((h) => renderAvatarSvg(normaliseInputs({ hairStyle: h }))));
    expect(seen.size).toBe(catalogue().hairStyle.length);
  });

  it('namespaces its SVG ids, so a grid of avatars is not all one background', () => {
    // SVG ids are document-global. Two avatars inlined on one page both defining
    // id="bg" means every one paints with the first definition — which is what a
    // preview of eight avatars did, in eight identical pink circles.
    const a = renderAvatarSvg(normaliseInputs({ background: 'rose' }));
    const b = renderAvatarSvg(normaliseInputs({ background: 'forest' }));
    const idsOf = (svg: string) => (svg.match(/id="([^"]+)"/g) ?? []).sort();
    expect(idsOf(a)).not.toEqual(idsOf(b));
    expect(idsOf(a).some((id) => id === 'id="bg"')).toBe(false);
  });

  it('draws every combination of catalogue values without throwing', () => {
    const c = catalogue();
    for (const skinTone of c.skinTone) {
      for (const accessory of c.accessory) {
        for (const facialHair of c.facialHair) {
          const svg = renderAvatarSvg(normaliseInputs({ skinTone, accessory, facialHair }));
          expect(svg.startsWith('<svg')).toBe(true);
          expect(svg.endsWith('</svg>')).toBe(true);
        }
      }
    }
  });
});

function harness(opts: { rows?: any[]; storageConfigured?: boolean } = {}) {
  const rows: any[] = opts.rows ?? [];
  let seq = 0;
  const match = (where: any, r: any) =>
    (where.id === undefined || r.id === where.id) &&
    (where.userId === undefined || r.userId === where.userId) &&
    (where.status === undefined || r.status === where.status) &&
    (where.isSelected === undefined || r.isSelected === where.isSelected) &&
    (where.createdAt?.gt === undefined || r.createdAt > where.createdAt.gt);

  const avatar = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `av${++seq}`, assetKey: null, providerJobId: null, isSelected: false, error: null, createdAt: NOW, updatedAt: NOW, ...data };
      rows.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => match(where, r)) ?? null),
    findMany: jest.fn(async ({ where, take }: any) => rows.filter((r) => match(where, r)).slice(0, take ?? 50)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(where, r));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const hit = rows.filter((r) => match(where, r));
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: hit.length };
    }),
    count: jest.fn(async ({ where }: any) => rows.filter((r) => match(where, r)).length),
  };

  const put = jest.fn(async () => (opts.storageConfigured === false ? null : 'avatars/me/x.svg'));
  const storage = {
    putPrivateObject: put,
    presignHealthDownload: jest.fn(async (k: string) => (k ? `https://signed.example/${k}` : null)),
    deleteHealthObject: jest.fn(async () => undefined),
  };
  const prisma = { avatar, $transaction: async (fn: any) => fn() };
  const svc = new AvatarsService(prisma as never, storage as never, new DeterministicAvatarProvider());
  return { svc, rows, storage, avatar };
}

describe('making an avatar', () => {
  it('is ready immediately and never claims a model drew it', async () => {
    const { svc } = harness();
    const made = await svc.create('me', { hairStyle: 'curly' });
    expect(made.status).toBe('ready');
    expect(made.generatedBy).toBe('deterministic');
  });

  it('hands back the existing one when the choices are identical', async () => {
    const { svc, rows } = harness();
    const first = await svc.create('me', { hairStyle: 'bun' });
    const second = await svc.create('me', { hairStyle: 'bun' });
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it('refuses once the wardrobe is full, and says what to do about it', async () => {
    const rows = Array.from({ length: AvatarsService.MAX_STORED }, (_, i) => ({
      id: `old${i}`, userId: 'me', inputs: JSON.stringify({ hairStyle: 'short' }), status: 'ready',
      assetKey: null, providerJobId: 'deterministic:x', isSelected: false, error: null, createdAt: new Date(0), updatedAt: NOW,
    }));
    const { svc } = harness({ rows });
    await expect(svc.create('me', { hairStyle: 'afro' })).rejects.toThrow(/Delete one/);
  });

  it('still works with no object storage, because the picture can be redrawn', async () => {
    const { svc } = harness({ storageConfigured: false });
    const made = await svc.create('me', { hairStyle: 'braids' });
    const asset = await svc.asset('me', made.id);
    expect(asset.url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(asset.expiresInSec).toBeNull();
  });

  it('prefers a signed link when the asset was stored', async () => {
    const { svc } = harness();
    const made = await svc.create('me', { hairStyle: 'long' });
    const asset = await svc.asset('me', made.id);
    expect(asset.url).toContain('https://signed.example/');
    expect(asset.expiresInSec).toBe(300);
  });
});

describe('an avatar belongs to one citizen', () => {
  it('answers 404 for somebody else’s rather than confirming it exists', async () => {
    const { svc } = harness();
    const made = await svc.create('me', {});
    await expect(svc.get('someone-else', made.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.asset('someone-else', made.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove('someone-else', made.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the stored file along with the row', async () => {
    const { svc, storage, rows } = harness();
    const made = await svc.create('me', {});
    await svc.remove('me', made.id);
    expect(storage.deleteHealthObject).toHaveBeenCalledWith('avatars/me/x.svg');
    expect(rows).toHaveLength(0);
  });
});

describe('selection', () => {
  it('keeps exactly one selected', async () => {
    const { svc, rows } = harness();
    const a = await svc.create('me', { hairStyle: 'short' });
    const b = await svc.create('me', { hairStyle: 'wavy' });
    await svc.select('me', a.id);
    await svc.select('me', b.id);
    expect(rows.filter((r) => r.isSelected).map((r) => r.id)).toEqual([b.id]);
  });

  it('lets a citizen go back to their photo', async () => {
    const { svc, rows } = harness();
    const a = await svc.create('me', {});
    await svc.select('me', a.id);
    await svc.deselect('me');
    expect(rows.some((r) => r.isSelected)).toBe(false);
  });

  it('will not select one that is not ready', async () => {
    const rows = [{
      id: 'pending', userId: 'me', inputs: '{}', status: 'queued', assetKey: null,
      providerJobId: null, isSelected: false, error: null, createdAt: NOW, updatedAt: NOW,
    }];
    const { svc } = harness({ rows });
    await expect(svc.select('me', 'pending')).rejects.toBeInstanceOf(BadRequestException);
  });
});
