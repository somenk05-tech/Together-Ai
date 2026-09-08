import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * ── THE BABY CARE DISTRICT'S RECORD ─────────────────────────────────────────
 *
 * One child, belonging to one citizen. Every read and every write is scoped to
 * the asker's own userId INSIDE the WHERE clause rather than checked after the
 * row comes back — the daybook's rule, and there is no shape of this data that
 * belongs to two accounts.
 *
 * ── WHAT THIS SERVICE WILL NOT DO ──────────────────────────────────────────
 *
 * It does not read `notes`. The column holds the parent's own words about their
 * own child, and nothing here parses it, searches it, or lets it reach a
 * shelf. The form promises that in as many words; this is the half of the
 * promise that has to be true in the database.
 *
 * It does not store an age or a band. Both are derived from `dob` in the
 * browser, every time they are asked for. A stored age is wrong the morning
 * after it is written, and the whole point of this district is a shelf that
 * moves with the child.
 *
 * It does not hold a photograph. The Pet District has a private vault for
 * animals and the pattern is right there to copy, and a photograph of a child
 * is a different object with a different risk. Until somebody has thought about
 * that properly, this record is four fields of text.
 *
 * ── THE CAP ────────────────────────────────────────────────────────────────
 *
 * Twenty children per account. Not a guess about family size — it is the number
 * that makes an unbounded list impossible while being far above any real one.
 * Enforced here rather than in the form, because a cap that only exists in a
 * component is not a cap.
 */
const MAX_CHILDREN = 20;

export interface ChildRecord {
  id: string;
  name: string;
  dob: string | null;
  notes: string;
  createdAt: string;
}

interface ChildRow {
  id: string;
  name: string;
  dob: string | null;
  notes: string;
  createdAt: Date;
}

export interface ChildInput {
  name?: string;
  /** `undefined` leaves it alone; `null` clears it. See the controller. */
  dob?: string | null;
  notes?: string;
}

function toRecord(row: ChildRow): ChildRecord {
  return {
    id: row.id,
    name: row.name,
    dob: row.dob,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class BabyCareService {
  constructor(private readonly prisma: PrismaService) {}

  /** Oldest first — the order they were added, which is the order a parent
   *  thinks of them in and stays stable when one is edited. */
  async list(userId: string): Promise<ChildRecord[]> {
    const rows = await this.prisma.child.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      /* BOUNDED BY THE SAME NUMBER THE WRITE IS. `create` refuses the
         twenty-first, so this can only ever return twenty — but an unbounded
         findMany is a read that gets its ceiling from a rule somewhere else,
         and the rule can move. `unbounded-reads.spec.ts` counts them for
         exactly that reason. */
      take: MAX_CHILDREN,
    });
    return rows.map(toRecord);
  }

  async create(userId: string, input: ChildInput): Promise<ChildRecord> {
    const count = await this.prisma.child.count({ where: { userId } });
    if (count >= MAX_CHILDREN) {
      throw new NotFoundException(`A city account holds up to ${MAX_CHILDREN} children.`);
    }
    const row = await this.prisma.child.create({
      data: {
        userId,
        name: (input.name ?? '').trim(),
        dob: input.dob ?? null,
        notes: input.notes ?? '',
      },
    });
    return toRecord(row);
  }

  /**
   * A MERGE, NOT A REPLACE. The form sends the one box that changed, so a
   * birthday saved on one screen cannot be wiped by a notes field saved on
   * another. `dob: null` is a clear and `dob` absent is "leave it".
   */
  async update(userId: string, id: string, input: ChildInput): Promise<ChildRecord> {
    const data: { name?: string; dob?: string | null; notes?: string } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.dob !== undefined) data.dob = input.dob;
    if (input.notes !== undefined) data.notes = input.notes;

    const done = await this.prisma.child.updateMany({ where: { id, userId }, data });
    if (done.count === 0) throw new NotFoundException('No such child on this account.');

    const row = await this.prisma.child.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('No such child on this account.');
    return toRecord(row);
  }

  async remove(userId: string, id: string): Promise<{ removed: string }> {
    const done = await this.prisma.child.deleteMany({ where: { id, userId } });
    if (done.count === 0) throw new NotFoundException('No such child on this account.');
    return { removed: id };
  }
}
