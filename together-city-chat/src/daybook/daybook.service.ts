import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * THE DAYBOOK.
 *
 * The Master Calendar was a grid with nothing behind it — `activities` was a
 * hardcoded empty array, and every hub's bookings were supposed to arrive in
 * it one day. This is the half of the idea that could not have been borrowed
 * from any hub: the day as the CITIZEN keeps it. How it felt, what they meant
 * to do, what they wrote about it afterwards.
 *
 * ── WHAT THIS SERVICE WILL NOT DO ─────────────────────────────────────────
 *
 * It does not invent a day. A date with nothing on it comes back empty rather
 * than pre-filled with suggestions, prompts or "0 of 3 goals" — an empty page
 * is a true fact about a day, and a diary that writes its own first line is
 * not the citizen's.
 *
 * Every read and every write is scoped to the asker's own userId in the WHERE
 * clause, not by a check afterwards. There is no shape of this data that
 * belongs to two people.
 */

export interface DayItemRow {
  id: string;
  kind: string;
  title: string;
  at: string | null;
  done: boolean;
}

/** Ten megabytes is a photograph off a phone with room to spare, and nowhere
 *  near a video. The vault's own ceiling is 50MB and applies to documents. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** The extension to store under. Narrow on purpose — `presignPhoto` has
 *  already refused anything that is not an image, so this list is the whole
 *  world it has to describe. */
function extFor(mimeType: string): string {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  };
  return known[mimeType] ?? 'jpg';
}

/** A photograph on a day, as the page needs it: an id to remove it by, and a
 *  link that stops working. Never the object key — the key is the thing that
 *  proves ownership, and it has no business in a browser. */
export interface DayPhotoRow {
  id: string;
  url: string | null;
  createdAt: string;
}

/** What the month grid is allowed to know about a day: that it holds things,
 *  how it felt, and the first picture kept on it. Never a word of the writing. */
export interface MonthMark {
  items: number;
  written: boolean;
  mood: string | null;
  photo: string | null;
  photos: number;
}

/**
 * THE LOOKING-BACK PAGE, as one object rather than eleven columns.
 *
 * The owner's reference (15 Aug) is a printed self-reflection sheet: what went
 * well, what you are proud of, three things you are grateful for, what was
 * difficult, what it taught you, the win, the challenge, tomorrow's focus. It
 * is a TEMPLATE, and the one certain thing about a template is that its
 * prompts change — so it is a single JSON column and a zod shape in the
 * controller. Adding a prompt is a line; removing one is a line; neither is a
 * migration, and a product that has to migrate to reword a question stops
 * rewording its questions.
 *
 * The keys are still NAMED and validated — this is not a free key-value store
 * a client can fill with anything it likes.
 */
export interface Reflection {
  /** 1–10, their own reading of the day. The one number the daybook keeps, and
   *  it is a feeling rather than a grade: nothing computes it, nothing sums it
   *  across days, nothing draws a line through it. */
  feeling?: number | null;
  wentWell?: string | null;
  proudOf?: string | null;
  grateful1?: string | null;
  grateful2?: string | null;
  grateful3?: string | null;
  difficult?: string | null;
  learned?: string | null;
  win?: string | null;
  challenge?: string | null;
  tomorrow?: string | null;
}

export interface DayRecord {
  date: string;
  mood: string | null;
  feelNote: string | null;
  journal: string | null;
  reflection: Reflection;
  items: DayItemRow[];
  photos: DayPhotoRow[];
}

@Injectable()
export class DaybookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  /** One day, as they left it. Empty is a real answer, not a miss. */
  async day(userId: string, date: string): Promise<DayRecord> {
    const [page, items, photos] = await Promise.all([
      this.prisma.dayPage.findUnique({ where: { userId_date: { userId, date } } }),
      this.prisma.dayItem.findMany({
        where: { userId, date },
        orderBy: [{ at: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.dayPhoto.findMany({ where: { userId, date }, orderBy: { createdAt: 'asc' } }),
    ]);
    /* THE LINK IS MADE HERE, PER READ, AND IT EXPIRES. A diary photograph lives
       in the private vault; what the page gets is a signed GET that dies in
       minutes. Fetching the day again mints new ones, which is why the browser
       never needs — and never receives — the key. */
    const seen = await Promise.all(
      (photos as Array<{ id: string; fileKey: string; createdAt: Date }>).map(async (p) => ({
        id: p.id,
        url: await this.storage.presignPrivateDownload(p.fileKey),
        createdAt: p.createdAt.toISOString(),
      })),
    );
    return {
      date,
      mood: page?.mood ?? null,
      feelNote: page?.feelNote ?? null,
      journal: page?.journal ?? null,
      reflection: (page?.reflection ?? {}) as Reflection,
      items: items.map((i: { id: string; kind: string; title: string; at: string | null; done: boolean }) => ({
        id: i.id, kind: i.kind, title: i.title, at: i.at, done: i.done,
      })),
      photos: seen,
    };
  }

  /**
   * A place to put the bytes. The browser PUTs straight to the vault, so this
   * is the only moment the server can decide WHERE — hence the namespace, and
   * hence images only: a diary that accepts any file is a file store, and a
   * file store with no quota attached to a diary is somebody's backup drive.
   */
  presignPhoto(userId: string, mimeType: string, sizeBytes: number) {
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('A memory kept on a day is a picture.');
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_PHOTO_BYTES) {
      throw new BadRequestException(`A picture may be up to ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB.`);
    }
    return this.storage.presignDaybookUpload(userId, mimeType, extFor(mimeType));
  }

  /**
   * File an uploaded picture on a day.
   *
   * TWO CHECKS, AND NEITHER IS OPTIONAL. The key comes from the client, so the
   * first asks whether it is even this citizen's key — the namespace is the
   * proof, which is why the namespace exists. The second asks whether the
   * object is actually THERE: a browser PUT that failed silently would
   * otherwise leave a row pointing at nothing, and a diary showing a broken
   * frame where a memory was is a worse lie than showing none.
   */
  async addPhoto(
    userId: string,
    date: string,
    photo: { fileKey: string; mimeType?: string; sizeBytes?: number },
  ): Promise<DayRecord> {
    if (!StorageProvider.isOwnDaybookKey(userId, photo.fileKey)) {
      throw new ForbiddenException('That file is not yours.');
    }
    if (!(await this.storage.privateObjectExists(photo.fileKey))) {
      throw new BadRequestException('That picture did not finish uploading — try it again.');
    }
    await this.prisma.dayPhoto.create({
      data: {
        userId, date,
        fileKey: photo.fileKey,
        mimeType: photo.mimeType ?? null,
        sizeBytes: photo.sizeBytes ?? 0,
      },
    });
    return this.day(userId, date);
  }

  /** Take it off the day — and out of the vault. A picture somebody removed
   *  from their diary is not a picture they meant to keep somewhere else. */
  async removePhoto(userId: string, id: string): Promise<DayRecord | null> {
    const row = await this.prisma.dayPhoto.findFirst({ where: { id, userId } });
    if (!row) return null;
    await this.prisma.dayPhoto.delete({ where: { id } });
    await this.storage.deletePrivateObject(row.fileKey);
    return this.day(userId, row.date);
  }

  /**
   * Write the page. PARTIAL BY DESIGN: the day page is now a dozen fields
   * edited at a dozen different moments — a mood picked in the morning, a line
   * about it at lunch, three gratefuls and the writing at night — and a save
   * that carried all of them would let the last screen to load erase the rest.
   *
   * THE REFLECTION MERGES RATHER THAN REPLACES, for the same reason one level
   * down: it is one JSON column holding eleven answers, and each answer is
   * saved on its own as somebody tabs out of the box. A write that replaced
   * the object would mean answering "what went well" erases the three things
   * you were grateful for — the exact bug the field-level partial save exists
   * to prevent, reintroduced inside a column. (Two tabs open on the same day
   * can still race each other; a diary is one pair of hands, and the cost of
   * being wrong is one re-typed line rather than a lost page.)
   */
  async save(
    userId: string,
    date: string,
    patch: { mood?: string | null; feelNote?: string | null; journal?: string | null; reflection?: Reflection },
  ): Promise<DayRecord> {
    const data: Record<string, unknown> = {};
    if (patch.mood !== undefined) data.mood = patch.mood || null;
    if (patch.feelNote !== undefined) data.feelNote = patch.feelNote || null;
    if (patch.journal !== undefined) data.journal = patch.journal || null;
    if (patch.reflection !== undefined) {
      const now = await this.prisma.dayPage.findUnique({ where: { userId_date: { userId, date } } });
      const merged: Record<string, unknown> = { ...((now?.reflection ?? {}) as Reflection) };
      for (const [k, v] of Object.entries(patch.reflection)) {
        // An emptied box is cleared, not left standing — the rule the mood
        // chips earned. `delete` rather than `null` so the object stays the
        // size of what is actually written on the page.
        if (v === null || v === '' || v === undefined) delete merged[k];
        else merged[k] = v;
      }
      data.reflection = merged;
    }
    await this.prisma.dayPage.upsert({
      where: { userId_date: { userId, date } },
      update: data,
      create: { userId, date, ...data },
    });
    return this.day(userId, date);
  }

  /** Add a line to a day. */
  async add(
    userId: string,
    date: string,
    item: { kind: string; title: string; at?: string | null },
  ): Promise<DayRecord> {
    await this.prisma.dayItem.create({
      data: { userId, date, kind: item.kind, title: item.title.trim(), at: item.at || null },
    });
    return this.day(userId, date);
  }

  /**
   * Tick it, rename it, move its hour. The WHERE carries the userId, so this
   * cannot reach somebody else's Tuesday even if an id leaks.
   */
  async update(
    userId: string,
    id: string,
    patch: { done?: boolean; title?: string; at?: string | null; kind?: string },
  ): Promise<DayRecord | null> {
    const row = await this.prisma.dayItem.findFirst({ where: { id, userId } });
    if (!row) return null;
    const data: Record<string, unknown> = {};
    if (patch.done !== undefined) data.done = patch.done;
    if (patch.title !== undefined) data.title = patch.title.trim();
    if (patch.at !== undefined) data.at = patch.at || null;
    if (patch.kind !== undefined) data.kind = patch.kind;
    await this.prisma.dayItem.update({ where: { id }, data });
    return this.day(userId, row.date);
  }

  /** Remove it. Same scoping: a delete that cannot find it does nothing. */
  async remove(userId: string, id: string): Promise<DayRecord | null> {
    const row = await this.prisma.dayItem.findFirst({ where: { id, userId } });
    if (!row) return null;
    await this.prisma.dayItem.delete({ where: { id } });
    return this.day(userId, row.date);
  }

  /**
   * WHICH DAYS OF A MONTH HAVE ANYTHING ON THEM.
   *
   * The month grid needs to show a mark on the days that hold something, and
   * the honest way to do that is to ask — not to fetch every page and every
   * item of every day and count them on the client. Two grouped reads, one
   * month, and the answer is counts rather than contents: the grid is not
   * allowed to leak what a day says, only that it says something.
   */
  async month(userId: string, ym: string): Promise<Record<string, MonthMark>> {
    const from = `${ym}-00`;
    const to = `${ym}-99`;
    const [pages, items, photos] = await Promise.all([
      this.prisma.dayPage.findMany({ where: { userId, date: { gte: from, lte: to } } }),
      this.prisma.dayItem.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true } }),
      this.prisma.dayPhoto.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { date: true, fileKey: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const blank = (): MonthMark => ({ items: 0, written: false, mood: null, photo: null, photos: 0 });
    const out: Record<string, MonthMark> = {};
    for (const i of items as Array<{ date: string }>) {
      out[i.date] = out[i.date] ?? blank();
      out[i.date].items += 1;
    }
    for (const p of pages as Array<{ date: string; mood: string | null; journal: string | null; feelNote: string | null }>) {
      out[p.date] = out[p.date] ?? blank();
      out[p.date].written = Boolean((p.journal ?? '').trim() || (p.feelNote ?? '').trim());
      out[p.date].mood = p.mood ?? null;
    }
    /* ONE PICTURE PER DAY REACHES THE GRID — the first one kept, as a link that
       expires like every other. This is the ONE thing the month is allowed to
       show of a day's contents, and it is the owner's call (15 Aug): a month of
       photographs is what makes this a scrapbook rather than a filing system.
       The words are a different matter and stay behind the door: a picture
       glanced at across a room is a memory, a sentence read across a room is
       something somebody wrote down in confidence. */
    const firstOf = new Map<string, string>();
    for (const p of photos as Array<{ date: string; fileKey: string }>) {
      out[p.date] = out[p.date] ?? blank();
      out[p.date].photos += 1;
      if (!firstOf.has(p.date)) firstOf.set(p.date, p.fileKey);
    }
    await Promise.all([...firstOf.entries()].map(async ([date, key]) => {
      out[date].photo = await this.storage.presignPrivateDownload(key);
    }));
    return out;
  }
}
