import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MasterProfileService } from '../../profile/master-profile.service';
import { swallowed } from '../../shared/swallow';
import {
  EXERCISE_CATALOG, EXERCISE_MEDIA_ATTRIBUTION, catalogById, exerciseGifUrl, exerciseThumbUrl,
} from '../exercise-catalog';
import {
  BODY_PARTS, GRADE_LABEL, GRADES, TRACK_LABEL, TRACK_ORDER, bodyPartLabel, gradeForLevel, gradeOf, trackFor,
  type Grade, type Track,
} from './exercise-grade';
import { filmFor } from './exercise-films';
import { PLANS_PER_CITIZEN, type SaveWorkoutPlanDto } from './library.dto';

/**
 * ── EVERY MOVEMENT IN THE CITY (owner, 18 Sep) ──────────────────────────────
 *
 * The whole catalogue, on one page, in the citizen's library: every movement
 * with its body part, its level, how it is done, and a space for the film.
 * And beside it, the citizen's own plans — a day or a week built from the
 * shelf and saved.
 *
 * The list is built ONCE per library and kept: the catalogue is a constant,
 * the grading is a pure function of it, and 1,324 rows do not change between
 * two requests. Only what is the citizen's — which library, which shelf they
 * stand on — is read per request, and the steps come one movement at a time
 * because a card that is closed does not need them.
 */
export interface LibraryMovement {
  id: string;
  name: string;
  part: string;
  partLabel: string;
  target: string;
  secondary: string[];
  equipment: string;
  level: Grade;
  /** 180×180 — see EXERCISE_MEDIA_ATTRIBUTION. '' when the dataset had none. */
  thumb: string;
  gif: string;
  /** The city's own film, or null while the slot waits. */
  film: string | null;
}

@Injectable()
export class LibraryService {
  private readonly built = new Map<Track, LibraryMovement[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
  ) {}

  /** GET /fitness/library — the citizen's library, and where they stand in it. */
  async library(userId: string) {
    const [master, profile] = await Promise.all([
      this.masterProfile.get(userId).catch(swallowed('fitness.library.master', null)),
      this.prisma.fitnessProfile.findUnique({ where: { userId }, select: { level: true, answeredAt: true } }),
    ]);
    const track = trackFor(master?.resolvedGender ?? null);
    const level = profile?.answeredAt ? gradeForLevel(profile.level) : null;
    const movements = this.movements(track);
    const counts = new Map<string, number>();
    for (const m of movements) counts.set(m.part, (counts.get(m.part) ?? 0) + 1);
    return {
      track,
      trackLabel: TRACK_LABEL[track],
      level,
      parts: TRACK_ORDER[track].map((key) => {
        const p = BODY_PARTS.find((b) => b.key === key)!;
        return { key, label: p.label, line: p.line, count: counts.get(key) ?? 0 };
      }),
      levels: GRADES.map((g) => ({ key: g, label: GRADE_LABEL[g], count: movements.filter((m) => m.level === g).length })),
      equipment: [...new Set(movements.map((m) => m.equipment))].sort(),
      movements,
      attribution: EXERCISE_MEDIA_ATTRIBUTION,
      plansCap: PLANS_PER_CITIZEN,
    };
  }

  /** GET /fitness/library/:id — how one movement is done. */
  async movement(userId: string, id: string) {
    const c = catalogById(id);
    if (!c) throw new NotFoundException('No movement with that id');
    const master = await this.masterProfile.get(userId).catch(swallowed('fitness.library.master', null));
    const track = trackFor(master?.resolvedGender ?? null);
    return { ...this.row(c, track), steps: c.steps };
  }

  private movements(track: Track): LibraryMovement[] {
    let list = this.built.get(track);
    if (!list) {
      const order = new Map(TRACK_ORDER[track].map((k, i) => [k, i]));
      list = EXERCISE_CATALOG.map((c) => this.row(c, track))
        .sort((a, b) => (order.get(a.part) ?? 99) - (order.get(b.part) ?? 99) || a.name.localeCompare(b.name));
      this.built.set(track, list);
    }
    return list;
  }

  private row(c: (typeof EXERCISE_CATALOG)[number], track: Track): LibraryMovement {
    return {
      id: c.id, name: c.name, part: c.bodyPart, partLabel: bodyPartLabel(c.bodyPart), target: c.target,
      secondary: c.secondary, equipment: c.equipment, level: gradeOf(c),
      thumb: exerciseThumbUrl(c), gif: exerciseGifUrl(c), film: filmFor(c.id, track),
    };
  }

  // ── the citizen's own plans ───────────────────────────────────────────────

  async plans(userId: string) {
    const rows = await this.prisma.workoutPlan.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' }, take: PLANS_PER_CITIZEN,
    });
    return { plans: rows.map(planOut), cap: PLANS_PER_CITIZEN };
  }

  async savePlan(userId: string, dto: SaveWorkoutPlanDto) {
    this.checkMovements(dto);
    const count = await this.prisma.workoutPlan.count({ where: { userId } });
    if (count >= PLANS_PER_CITIZEN) {
      throw new BadRequestException(`You have ${PLANS_PER_CITIZEN} plans saved — remove one to save another.`);
    }
    const row = await this.prisma.workoutPlan.create({
      data: { userId, name: dto.name, kind: dto.kind, days: dto.days as unknown as Prisma.InputJsonValue },
    });
    return planOut(row);
  }

  async updatePlan(userId: string, id: string, dto: SaveWorkoutPlanDto) {
    this.checkMovements(dto);
    const { count } = await this.prisma.workoutPlan.updateMany({
      where: { id, userId },
      data: { name: dto.name, kind: dto.kind, days: dto.days as unknown as Prisma.InputJsonValue },
    });
    if (count === 0) throw new NotFoundException('No plan of yours with that id');
    const row = await this.prisma.workoutPlan.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('No plan of yours with that id');
    return planOut(row);
  }

  async deletePlan(userId: string, id: string) {
    const { count } = await this.prisma.workoutPlan.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('No plan of yours with that id');
    return { ok: true };
  }

  /** A plan names movements the catalogue has, or it is not a plan. */
  private checkMovements(dto: SaveWorkoutPlanDto) {
    for (const d of dto.days) {
      for (const e of d.exercises) {
        if (!catalogById(e.id)) throw new BadRequestException(`No movement with id ${e.id}`);
      }
    }
  }
}

function planOut(row: { id: string; name: string; kind: string; days: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
  return {
    id: row.id, name: row.name, kind: row.kind, days: row.days,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
