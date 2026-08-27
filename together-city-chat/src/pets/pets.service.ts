import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * THE PET DISTRICT'S RECORD.
 *
 * One animal, belonging to one citizen. Every read and every write is scoped to
 * the asker's own userId inside the WHERE clause rather than checked after the
 * row comes back — the daybook's rule, for the daybook's reason: a check
 * afterwards is a check somebody can forget to write, and there is no shape of
 * this data that belongs to two people.
 *
 * ── WHAT THIS SERVICE WILL NOT DO ──────────────────────────────────────────
 *
 * It does not read `medical`. The column holds what a vet asks for at the door
 * — conditions, medication, the clinic's number — and nothing here parses a key
 * of it, filters on it, or lets it reach a recommendation. It is stored so that
 * the owner has it at the counter, and that is the whole of its job. The hub
 * says as much on the card; this is the half of that promise that has to be
 * true in the database.
 *
 * It does not compute a feeding plan. The thirty days of meals, the grocery
 * list and the cart are DERIVED from the fields below and are rebuilt by the
 * browser from the saved pet, which is why they are not tables. A plan stored
 * beside the weight it was calculated from is a plan that can disagree with it.
 */

/** Five photographs per pet — the same number the hub's gallery enforces, and
 *  enforced here too, because a cap that only exists in a component is a cap. */
const MAX_PET_PHOTOS = 5;

/** Ten megabytes is a photograph off a phone with room to spare. The gallery
 *  has already squared and downscaled to 640px by the time it gets here, so
 *  this ceiling is for the file that arrives another way. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function extFor(mimeType: string): string {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  };
  return known[mimeType] ?? 'jpg';
}

/** A photograph as the browser needs it: an id to remove it by, its place in
 *  the order, and a link that stops working. Never the object key — the key is
 *  what proves ownership and it has no business in a browser. */
export interface PetPhotoRow {
  id: string;
  url: string | null;
  position: number;
  createdAt: string;
}

export interface PetRecord {
  id: string;
  name: string;
  species: string;
  breed: string;
  dob: string | null;
  ageMonths: number | null;
  sex: string | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  bodyCondition: string;
  activity: string;
  housing: string;
  sterilised: boolean | null;
  allergies: string[];
  sensitivities: string[];
  restrictions: string[];
  currentFood: string;
  dietStyle: string;
  goal: string;
  healthNotes: string;
  medical: Record<string, string>;
  portrait: string;
  photos: PetPhotoRow[];
  createdAt: string;
}

/** What the API accepts on a pet. Every field optional — a create sends the
 *  lot, an edit sends the one box that changed, and both take this path. */
export interface PetInput {
  name?: string;
  species?: string;
  breed?: string;
  dob?: string | null;
  ageMonths?: number | null;
  sex?: string | null;
  weightKg?: number | null;
  targetWeightKg?: number | null;
  bodyCondition?: string;
  activity?: string;
  housing?: string;
  sterilised?: boolean | null;
  allergies?: string[];
  sensitivities?: string[];
  restrictions?: string[];
  currentFood?: string;
  dietStyle?: string;
  goal?: string;
  healthNotes?: string;
  medical?: Record<string, string>;
  portrait?: string;
}

/**
 * A JSON column read back as a list of the owner's own words.
 *
 * Defensive on purpose: `Json?` is `unknown` as far as the compiler is
 * concerned, and a row written before this code — or by a console — is not
 * obliged to hold an array of strings. An unreadable value becomes an empty
 * list rather than an exception, because a pet whose allergies column is
 * malformed should still open.
 */
function words(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The medical record, read back as the flat string map the form writes. Same
 *  defence as `words`, and the same reason. NOTHING INTERPRETS THE RESULT. */
function fields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** The row shape Prisma hands back for a pet with its photographs attached. */
interface PetRow {
  id: string;
  name: string;
  species: string;
  breed: string;
  dob: string | null;
  ageMonths: number | null;
  sex: string | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  bodyCondition: string;
  activity: string;
  housing: string;
  sterilised: boolean | null;
  allergies: unknown;
  sensitivities: unknown;
  restrictions: unknown;
  currentFood: string;
  dietStyle: string;
  goal: string;
  healthNotes: string;
  medical: unknown;
  portrait: string;
  createdAt: Date;
  photos: { id: string; fileKey: string; position: number; createdAt: Date }[];
}

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  /** Every pet this citizen keeps, oldest first, each with its photographs. */
  async list(userId: string): Promise<PetRecord[]> {
    // unbounded: their own animals — citizen-scale, and the hub shows the
    // household whole rather than a page of it.
    const rows = await this.prisma.pet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    return Promise.all((rows as PetRow[]).map((row) => this.shape(row)));
  }

  async one(userId: string, id: string): Promise<PetRecord> {
    const row = await this.prisma.pet.findFirst({
      where: { id, userId },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    if (!row) throw new NotFoundException('No such pet.');
    return this.shape(row as PetRow);
  }

  /**
   * A new animal. `name` and `species` are the two the API insists on, because
   * they are the two the hub cannot draw a card without; everything else has a
   * default in the schema and an owner who has not measured the cat yet.
   */
  async create(userId: string, input: PetInput): Promise<PetRecord> {
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException('A pet needs a name.');
    const row = await this.prisma.pet.create({
      data: { userId, ...this.writable(input), name, species: input.species ?? 'dog' },
      include: { photos: true },
    });
    return this.shape(row as PetRow);
  }

  /**
   * An edit. PARTIAL, and partial is the point: the profile page and the
   * medical card are two forms over one row, and a page that sent the whole
   * object it happened to be holding would overwrite whatever the other one
   * changed while it was open.
   */
  async update(userId: string, id: string, input: PetInput): Promise<PetRecord> {
    const { count } = await this.prisma.pet.updateMany({
      where: { id, userId },
      data: this.writable(input),
    });
    if (!count) throw new NotFoundException('No such pet.');
    return this.one(userId, id);
  }

  /**
   * Remove the animal, and its photographs with it.
   *
   * The rows go by cascade. The BYTES do not — a foreign key knows nothing
   * about an object store — so the vault is emptied here, deliberately and
   * before the row that names the keys is gone.
   */
  async remove(userId: string, id: string): Promise<{ removed: string }> {
    const pet = await this.prisma.pet.findFirst({
      where: { id, userId },
      include: { photos: true },
    });
    if (!pet) throw new NotFoundException('No such pet.');
    for (const photo of pet.photos) {
      await this.storage.deletePrivateObject(photo.fileKey);
    }
    await this.prisma.pet.delete({ where: { id } });
    return { removed: id };
  }

  /** A place to put the bytes — images only, and inside this citizen's own
   *  namespace, which is the only moment the server gets to decide where. */
  presignPhoto(userId: string, mimeType: string, sizeBytes: number) {
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('A pet photo is a picture.');
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_PHOTO_BYTES) {
      throw new BadRequestException(`A photo may be up to ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB.`);
    }
    return this.storage.presignPetUpload(userId, mimeType, extFor(mimeType));
  }

  /**
   * File an uploaded photograph against a pet.
   *
   * THREE CHECKS, AND NONE OF THEM IS OPTIONAL. The pet must be this citizen's.
   * The key must be inside this citizen's namespace — the prefix is the proof,
   * which is the reason the namespace exists. And the object must actually BE
   * there: a browser PUT that failed quietly would otherwise leave a row
   * pointing at nothing, and a gallery with a broken frame in it is a worse
   * answer than a gallery with one fewer photograph.
   */
  async addPhoto(
    userId: string,
    petId: string,
    photo: { fileKey: string; mimeType?: string; sizeBytes?: number },
  ): Promise<PetRecord> {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      include: { photos: true },
    });
    if (!pet) throw new NotFoundException('No such pet.');
    if (pet.photos.length >= MAX_PET_PHOTOS) {
      throw new BadRequestException(`Only ${MAX_PET_PHOTOS} photos per pet — remove one to add this.`);
    }
    if (!StorageProvider.isOwnPetKey(userId, photo.fileKey)) {
      throw new ForbiddenException('That file is not yours.');
    }
    if (!(await this.storage.privateObjectExists(photo.fileKey))) {
      throw new BadRequestException('That photo did not finish uploading — try it again.');
    }
    const next = pet.photos.reduce((n, p) => Math.max(n, p.position + 1), 0);
    await this.prisma.petPhoto.create({
      data: {
        petId, userId,
        fileKey: photo.fileKey,
        mimeType: photo.mimeType ?? null,
        sizeBytes: photo.sizeBytes ?? 0,
        position: next,
      },
    });
    return this.one(userId, petId);
  }

  /** Take it off the pet — and out of the vault. A photograph somebody removed
   *  is not a photograph they meant to keep somewhere else. */
  async removePhoto(userId: string, photoId: string): Promise<PetRecord> {
    const row = await this.prisma.petPhoto.findFirst({ where: { id: photoId, userId } });
    if (!row) throw new NotFoundException('No such photo.');
    await this.prisma.petPhoto.delete({ where: { id: photoId } });
    await this.storage.deletePrivateObject(row.fileKey);
    return this.one(userId, row.petId);
  }

  /**
   * Make one photograph the face.
   *
   * The whole gallery is renumbered from the new order rather than the chosen
   * one being given position -1 or 0 beside another 0. Two photographs sharing
   * a position is a gallery whose order depends on which row Postgres feels
   * like returning first, and "make main" is exactly the moment somebody is
   * watching for it.
   */
  async makeMainPhoto(userId: string, photoId: string): Promise<PetRecord> {
    const chosen = await this.prisma.petPhoto.findFirst({ where: { id: photoId, userId } });
    if (!chosen) throw new NotFoundException('No such photo.');
    // A short read here leaves duplicate positions behind — this method's bug.
    // unbounded: one pet's WHOLE gallery, which MAX_PET_PHOTOS caps at five and
    // which is renumbered row by row below.
    const all = await this.prisma.petPhoto.findMany({
      where: { petId: chosen.petId, userId },
      orderBy: { position: 'asc' },
    });
    const order = [chosen.id, ...all.map((p) => p.id).filter((id) => id !== chosen.id)];
    await this.prisma.$transaction(
      order.map((id, position) => this.prisma.petPhoto.update({ where: { id }, data: { position } })),
    );
    return this.one(userId, chosen.petId);
  }

  /**
   * The fields an owner may write, and only those.
   *
   * Spreading a request body into `data` is how a client learns it can set
   * `userId`. This names every column instead, and `undefined` is left out by
   * Prisma — which is what makes one method serve both a create and a
   * one-field edit.
   */
  private writable(input: PetInput) {
    return {
      name: input.name?.trim(),
      species: input.species,
      breed: input.breed?.trim(),
      dob: input.dob,
      ageMonths: input.ageMonths,
      sex: input.sex,
      weightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg,
      bodyCondition: input.bodyCondition,
      activity: input.activity,
      housing: input.housing,
      sterilised: input.sterilised,
      allergies: input.allergies,
      sensitivities: input.sensitivities,
      restrictions: input.restrictions,
      currentFood: input.currentFood?.trim(),
      dietStyle: input.dietStyle,
      goal: input.goal,
      healthNotes: input.healthNotes,
      medical: input.medical,
      portrait: input.portrait,
    };
  }

  /** The row, as the browser is allowed to see it: signed links instead of
   *  keys, lists instead of JSON, and never a userId. */
  private async shape(row: PetRow): Promise<PetRecord> {
    const photos: PetPhotoRow[] = [];
    for (const p of row.photos) {
      photos.push({
        id: p.id,
        url: await this.storage.presignPrivateDownload(p.fileKey),
        position: p.position,
        createdAt: p.createdAt.toISOString(),
      });
    }
    return {
      id: row.id,
      name: row.name,
      species: row.species,
      breed: row.breed,
      dob: row.dob,
      ageMonths: row.ageMonths,
      sex: row.sex,
      weightKg: row.weightKg,
      targetWeightKg: row.targetWeightKg,
      bodyCondition: row.bodyCondition,
      activity: row.activity,
      housing: row.housing,
      sterilised: row.sterilised,
      allergies: words(row.allergies),
      sensitivities: words(row.sensitivities),
      restrictions: words(row.restrictions),
      currentFood: row.currentFood,
      dietStyle: row.dietStyle,
      goal: row.goal,
      healthNotes: row.healthNotes,
      medical: fields(row.medical),
      portrait: row.portrait,
      photos,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
