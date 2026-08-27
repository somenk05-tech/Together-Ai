import { PetsService } from './pets.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * A PET IS A CITIZEN'S RECORD, AND STAYS THAT WAY.
 *
 * Five promises this hub makes out loud, each of which is a comment somewhere
 * until it is a test:
 *
 *  1. NOTHING REACHES ANOTHER PERSON'S ANIMAL. Every read and write carries the
 *     asker's userId in the WHERE, so a leaked pet id is still not a key.
 *  2. AN EDIT IS PARTIAL. The profile page and the medical card are two forms
 *     over one row; a save that carried the whole object would let whichever
 *     was open last erase the other.
 *  3. A CLIENT CANNOT NAME SOMEBODY ELSE'S FILE. The vault namespace is the
 *     permission, and a key from outside it is refused before a row exists.
 *  4. A PHOTOGRAPH'S KEY NEVER LEAVES THE SERVER, and deleting a pet deletes
 *     the bytes — a foreign key knows nothing about an object store.
 *  5. `medical` IS STORED AND NEVER INTERPRETED. Nothing computes on it, and
 *     a field the form does not know about does not become one.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A service with its two collaborators replaced, and no compiler in the way.
 *
 * Returns `any` deliberately — the same shape the daybook's spec uses. Naming
 * the return `PetsService & { storage: … }` looks tidier and does not compile:
 * `storage` is private on the class, so the intersection reduces to `never` and
 * every call below becomes an error about a property that plainly exists.
 */
function bare(over: Record<string, any> = {}): any {
  const svc: any = Object.create(PetsService.prototype);
  const pets: any[] = [];
  const photos: any[] = [];
  const hit = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const attach = (p: any) => ({
    ...p,
    photos: photos.filter((f) => f.petId === p.id).sort((a, b) => a.position - b.position),
  });
  const strip = (data: any) => {
    const out: any = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
    return out;
  };

  svc.__pets = pets;
  svc.__photos = photos;
  svc.prisma = {
    pet: {
      findMany: ({ where }: any) => Promise.resolve(pets.filter((p) => hit(p, where)).map(attach)),
      findFirst: ({ where }: any) => Promise.resolve(
        pets.filter((p) => hit(p, where)).map(attach)[0] ?? null,
      ),
      create: ({ data }: any) => {
        const row = {
          id: `pet-${pets.length + 1}`, breed: '', dob: null, ageMonths: null, sex: null,
          weightKg: null, targetWeightKg: null, bodyCondition: 'ideal', activity: 'moderate',
          housing: 'indoor', sterilised: null, allergies: null, sensitivities: null,
          restrictions: null, currentFood: '', dietStyle: 'commercial', goal: 'maintain',
          healthNotes: '', medical: null, portrait: '', createdAt: new Date(),
          ...strip(data),
        };
        pets.push(row);
        return Promise.resolve(attach(row));
      },
      updateMany: ({ where, data }: any) => {
        const rows = pets.filter((p) => hit(p, where));
        rows.forEach((r) => Object.assign(r, strip(data)));
        return Promise.resolve({ count: rows.length });
      },
      deleteMany: ({ where }: any) => {
        const gone = pets.filter((p) => hit(p, where));
        for (const row of gone) pets.splice(pets.indexOf(row), 1);
        return Promise.resolve({ count: gone.length });
      },
    },
    petPhoto: {
      create: ({ data }: any) => {
        const row = { id: `photo-${photos.length + 1}`, mimeType: null, sizeBytes: 0, createdAt: new Date(), ...data };
        photos.push(row);
        return Promise.resolve(row);
      },
      findFirst: ({ where }: any) => Promise.resolve(photos.find((f) => hit(f, where)) ?? null),
      findMany: ({ where }: any) => Promise.resolve(photos.filter((f) => hit(f, where)).sort((a, b) => a.position - b.position)),
      deleteMany: ({ where }: any) => {
        const gone = photos.filter((f) => hit(f, where));
        for (const row of gone) photos.splice(photos.indexOf(row), 1);
        return Promise.resolve({ count: gone.length });
      },
      updateMany: ({ where, data }: any) => {
        const rows = photos.filter((f) => hit(f, where));
        rows.forEach((r) => Object.assign(r, data));
        return Promise.resolve({ count: rows.length });
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  svc.storage = {
    deleted: [] as string[],
    presignPetUpload: (userId: string) => Promise.resolve({ uploadUrl: 'https://vault/put', key: `pets/${userId}/x.jpg`, expiresInSec: 60 }),
    privateObjectExists: () => Promise.resolve(true),
    presignPrivateDownload: (key: string) => Promise.resolve(`https://vault/signed?k=${key}`),
    deletePrivateObject(key: string) { (this as any).deleted.push(key); return Promise.resolve(); },
    ...over,
  };
  return svc;
}

const ALICE = 'alice';
const BOB = 'bob';

describe('a pet is a citizen’s record', () => {
  it('does not let one citizen read, edit or delete another’s animal', async () => {
    const svc = bare();
    const hers = await svc.create(ALICE, { name: 'Max', species: 'dog' });

    expect(await svc.list(BOB)).toEqual([]);
    await expect(svc.one(BOB, hers.id)).rejects.toThrow();
    await expect(svc.update(BOB, hers.id, { name: 'Taken' })).rejects.toThrow();
    await expect(svc.remove(BOB, hers.id)).rejects.toThrow();

    // And she still has him, unrenamed.
    expect((await svc.one(ALICE, hers.id)).name).toBe('Max');
  });

  it('applies an edit as the fields that were sent, and only those', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max', species: 'dog', weightKg: 24 });

    // The medical card saves. It has never heard of a weight.
    await svc.update(ALICE, pet.id, { medical: { vetName: 'Dr Rao' } });
    // The profile page saves. It has never heard of a vet.
    const after = await svc.update(ALICE, pet.id, { weightKg: 25.5 });

    expect(after.weightKg).toBe(25.5);
    expect(after.medical).toEqual({ vetName: 'Dr Rao' });
    expect(after.name).toBe('Max');
  });

  it('insists on a name, and defaults the rest rather than inventing it', async () => {
    const svc = bare();
    await expect(svc.create(ALICE, { name: '   ' })).rejects.toThrow();

    const pet = await svc.create(ALICE, { name: 'Mishti', species: 'cat' });
    expect(pet.weightKg).toBeNull();
    expect(pet.allergies).toEqual([]);
    expect(pet.medical).toEqual({});
    expect(pet.photos).toEqual([]);
  });

  it('refuses a file key from outside the caller’s own namespace', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });

    await expect(
      svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${BOB}/stolen.jpg` }),
    ).rejects.toThrow(/not yours/i);
    await expect(
      svc.addPhoto(ALICE, pet.id, { fileKey: 'daybook/alice/private.jpg' }),
    ).rejects.toThrow(/not yours/i);

    expect(StorageProvider.isOwnPetKey(ALICE, `pets/${ALICE}/ok.jpg`)).toBe(true);
    expect(StorageProvider.isOwnPetKey(ALICE, `pets/${ALICE}x/ok.jpg`)).toBe(false);
  });

  it('refuses a key whose object never finished uploading', async () => {
    const svc = bare({ privateObjectExists: () => Promise.resolve(false) });
    const pet = await svc.create(ALICE, { name: 'Max' });
    await expect(
      svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/ghost.jpg` }),
    ).rejects.toThrow(/did not finish/i);
  });

  it('caps a gallery at five and never hands a key to the browser', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });
    for (let i = 0; i < 5; i += 1) {
      await svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/${i}.jpg` });
    }
    await expect(
      svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/six.jpg` }),
    ).rejects.toThrow(/5 photos/);

    /* The shape IS the promise. A presigned S3 URL legitimately carries the
       key in its path, so "the string does not contain the key" would be a
       test of the URL format; what matters is that the ROW the browser is
       handed has no key field on it to read, copy or replay. */
    const read = await svc.one(ALICE, pet.id);
    expect(read.photos).toHaveLength(5);
    for (const photo of read.photos) {
      expect(Object.keys(photo).sort()).toEqual(['createdAt', 'id', 'position', 'url']);
    }
  });

  it('renumbers the whole gallery when one is made the face, so two cannot tie', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });
    for (let i = 0; i < 3; i += 1) {
      await svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/${i}.jpg` });
    }
    /* Annotated because `svc` is `any` and these callbacks would otherwise be
       implicit-any parameters, which this repo compiles as an error. */
    const before: any[] = (await svc.one(ALICE, pet.id)).photos;
    const after: any[] = (await svc.makeMainPhoto(ALICE, before[2].id)).photos;

    expect(after.map((p) => p.id)).toEqual([before[2].id, before[0].id, before[1].id]);
    expect(after.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('will not reorder somebody else’s gallery, or remove from it', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });
    await svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/0.jpg` });
    const photo = (await svc.one(ALICE, pet.id)).photos[0];

    await expect(svc.makeMainPhoto(BOB, photo.id)).rejects.toThrow();
    await expect(svc.removePhoto(BOB, photo.id)).rejects.toThrow();
    expect((await svc.one(ALICE, pet.id)).photos).toHaveLength(1);
  });

  it('empties the vault when a photograph or a whole pet is removed', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });
    await svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/a.jpg` });
    await svc.addPhoto(ALICE, pet.id, { fileKey: `pets/${ALICE}/b.jpg` });

    const first = (await svc.one(ALICE, pet.id)).photos[0];
    await svc.removePhoto(ALICE, first.id);
    expect(svc.storage.deleted).toContain(`pets/${ALICE}/a.jpg`);

    await svc.remove(ALICE, pet.id);
    expect(svc.storage.deleted).toContain(`pets/${ALICE}/b.jpg`);
    expect(await svc.list(ALICE)).toEqual([]);
  });

  it('reads a malformed json column as empty rather than falling over', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, { name: 'Max' });
    // A row written by a console, or by a build that predates the column.
    svc.__pets[0].allergies = 'chicken';
    svc.__pets[0].medical = ['not', 'an', 'object'];

    const read = await svc.one(ALICE, pet.id);
    expect(read.allergies).toEqual([]);
    expect(read.medical).toEqual({});
  });

  it('stores the medical record without reading a word of it', async () => {
    const svc = bare();
    const pet = await svc.create(ALICE, {
      name: 'Max', species: 'dog', weightKg: 30, goal: 'maintain',
      medical: { conditions: 'Chronic kidney disease', medications: 'Benazepril' },
    });

    // It comes back exactly as it was written…
    expect(pet.medical).toEqual({ conditions: 'Chronic kidney disease', medications: 'Benazepril' });
    // …and it has changed nothing about the animal the planner will read.
    expect(pet.goal).toBe('maintain');
    expect(pet.dietStyle).toBe('commercial');
    expect(pet.weightKg).toBe(30);
    // Nothing derived from it appears on the record at all.
    expect(Object.keys(pet)).not.toContain('conditions');
    expect(JSON.stringify({ ...pet, medical: null })).not.toMatch(/kidney|Benazepril/i);
  });
});
