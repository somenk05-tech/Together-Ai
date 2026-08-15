import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

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

export interface DayRecord {
  date: string;
  mood: string | null;
  feelNote: string | null;
  journal: string | null;
  items: DayItemRow[];
}

@Injectable()
export class DaybookService {
  constructor(private readonly prisma: PrismaService) {}

  /** One day, as they left it. Empty is a real answer, not a miss. */
  async day(userId: string, date: string): Promise<DayRecord> {
    const [page, items] = await Promise.all([
      this.prisma.dayPage.findUnique({ where: { userId_date: { userId, date } } }),
      this.prisma.dayItem.findMany({
        where: { userId, date },
        orderBy: [{ at: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      date,
      mood: page?.mood ?? null,
      feelNote: page?.feelNote ?? null,
      journal: page?.journal ?? null,
      items: items.map((i: { id: string; kind: string; title: string; at: string | null; done: boolean }) => ({
        id: i.id, kind: i.kind, title: i.title, at: i.at, done: i.done,
      })),
    };
  }

  /**
   * Write the page. PARTIAL BY DESIGN: the day page is three fields edited at
   * three different moments — a mood picked in the morning, a line about it at
   * lunch, the writing at night — and a save that carried all three would let
   * the last screen to load erase the other two.
   */
  async save(
    userId: string,
    date: string,
    patch: { mood?: string | null; feelNote?: string | null; journal?: string | null },
  ): Promise<DayRecord> {
    const data: Record<string, string | null> = {};
    if (patch.mood !== undefined) data.mood = patch.mood || null;
    if (patch.feelNote !== undefined) data.feelNote = patch.feelNote || null;
    if (patch.journal !== undefined) data.journal = patch.journal || null;
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
  async month(userId: string, ym: string): Promise<Record<string, { items: number; written: boolean; mood: string | null }>> {
    const from = `${ym}-00`;
    const to = `${ym}-99`;
    const [pages, items] = await Promise.all([
      this.prisma.dayPage.findMany({ where: { userId, date: { gte: from, lte: to } } }),
      this.prisma.dayItem.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true } }),
    ]);
    const out: Record<string, { items: number; written: boolean; mood: string | null }> = {};
    for (const i of items as Array<{ date: string }>) {
      out[i.date] = out[i.date] ?? { items: 0, written: false, mood: null };
      out[i.date].items += 1;
    }
    for (const p of pages as Array<{ date: string; mood: string | null; journal: string | null; feelNote: string | null }>) {
      out[p.date] = out[p.date] ?? { items: 0, written: false, mood: null };
      out[p.date].written = Boolean((p.journal ?? '').trim() || (p.feelNote ?? '').trim());
      out[p.date].mood = p.mood ?? null;
    }
    return out;
  }
}
