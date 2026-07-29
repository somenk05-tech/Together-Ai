import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { AvatarProvider } from './avatar-provider';
import { catalogue, inputsKey, normaliseInputs, type AvatarInputs } from './avatar-inputs';
import { renderAvatarSvg } from './avatar-render';
import type { CreateAvatarDto } from './dto/avatars.dto';

interface AvatarRow {
  id: string;
  userId: string;
  inputs: string;
  status: string;
  providerJobId: string | null;
  assetKey: string | null;
  isSelected: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Avatars — item 21 of the brief, and the last of them.
 *
 * A citizen picks from a fixed catalogue and gets a portrait they can use in a
 * call or beside their name. Three things about how this is built are choices
 * rather than defaults, and each answers a question that had been sitting open
 * in docs/decisions.md:
 *
 *   Moderation. There is no free text anywhere in the input. Not one string
 *   field. A closed catalogue cannot express something that needs catching, so
 *   nothing has to be caught — which beats a classifier that is wrong some of
 *   the time about images with a person's face in them.
 *
 *   The provider. Generation sits behind AvatarProvider, and what ships is a
 *   deterministic renderer that draws SVG from the choices. That is a real,
 *   usable avatar today, free to run, instant, and honest: `generatedBy` says
 *   'deterministic' in every response, so no screen can imply a model drew it.
 *   A hosted model becomes one class and one binding.
 *
 *   Privacy. Assets go in the private vault and are handed out as short-lived
 *   signed links to their owner. Not because an avatar is sensitive in itself,
 *   but because "everything a citizen makes is public by default" is how the
 *   one that IS sensitive eventually leaks. An avatar call doesn't need this
 *   loosened: the avatar replaces the caller's own camera feed on their own
 *   device, so the other side receives video, never a URL.
 */
@Injectable()
export class AvatarsService {
  private readonly logger = new Logger(AvatarsService.name);

  /** Generous for a renderer that costs nothing; the point is that the limit
   *  already exists on the day a per-image bill does. */
  static readonly DAILY_LIMIT = 20;
  /** A wardrobe, not an archive. Delete one to make another. */
  static readonly MAX_STORED = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly provider: AvatarProvider,
  ) {}

  /** The generated client lags new models until `prisma generate` runs. */
  private get avatar() {
    return (this.prisma as unknown as {
      avatar: {
        create(a: unknown): Promise<AvatarRow>;
        findFirst(a: unknown): Promise<AvatarRow | null>;
        findMany(a: unknown): Promise<AvatarRow[]>;
        updateMany(a: unknown): Promise<{ count: number }>;
        deleteMany(a: unknown): Promise<{ count: number }>;
        count(a: unknown): Promise<number>;
      };
    }).avatar;
  }

  options() {
    return { ...catalogue(), generatedBy: this.providerKind(), provider: this.provider.name };
  }

  private providerKind(): 'ai' | 'deterministic' {
    return this.provider.name === 'deterministic-svg' ? 'deterministic' : 'ai';
  }

  private inputsOf(row: AvatarRow): AvatarInputs {
    try {
      return normaliseInputs(JSON.parse(row.inputs) as unknown);
    } catch {
      return normaliseInputs({});
    }
  }

  private shape(row: AvatarRow) {
    const inputs = this.inputsOf(row);
    return {
      id: row.id,
      status: row.status,
      inputs,
      isSelected: row.isSelected,
      error: row.error,
      /** Never inferred by a client — the row records what actually drew it. */
      generatedBy: row.providerJobId?.startsWith('ai:') ? 'ai' : 'deterministic',
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── reading ────────────────────────────────────────────

  async list(userId: string) {
    const rows = await this.avatar.findMany({
      where: { userId },
      orderBy: [{ isSelected: 'desc' }, { createdAt: 'desc' }],
      take: AvatarsService.MAX_STORED,
    });
    return rows.map((r) => this.shape(r));
  }

  private async own(userId: string, id: string): Promise<AvatarRow> {
    const row = await this.avatar.findFirst({ where: { id, userId } });
    // Someone else's avatar and a nonexistent one answer the same way. There is
    // nothing to learn from the difference.
    if (!row) throw new NotFoundException('Avatar not found');
    return row;
  }

  async get(userId: string, id: string) {
    return this.shape(await this.own(userId, id));
  }

  /**
   * Something an `<img src>` can use, whichever way the picture exists.
   *
   * A stored asset becomes a short-lived signed link. A deterministic avatar
   * with nothing stored — because object storage isn't configured, or the write
   * failed — is redrawn from its own inputs and returned as a data URL, because
   * a renderer that always produces the same thing means the bytes are never
   * actually lost. One field either way, so the client has no branch to get
   * wrong.
   */
  async asset(userId: string, id: string): Promise<{ url: string; expiresInSec: number | null; generatedBy: string }> {
    const row = await this.own(userId, id);
    if (row.status !== 'ready') throw new BadRequestException('That avatar is not ready yet.');
    const kind = this.shape(row).generatedBy;

    if (row.assetKey) {
      const url = await this.storage.presignHealthDownload(row.assetKey);
      if (url) return { url, expiresInSec: 300, generatedBy: kind };
    }
    if (kind === 'ai') {
      // A model's output cannot be redrawn, so there is no honest fallback here.
      throw new NotFoundException('That avatar image is no longer available.');
    }
    const svg = renderAvatarSvg(this.inputsOf(row));
    return {
      url: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
      expiresInSec: null,
      generatedBy: kind,
    };
  }

  // ── making one ─────────────────────────────────────────

  async create(userId: string, dto: CreateAvatarDto) {
    const inputs = normaliseInputs(dto);

    const stored = await this.avatar.count({ where: { userId } });
    if (stored >= AvatarsService.MAX_STORED) {
      throw new BadRequestException(
        `You have ${stored} avatars, which is the limit. Delete one to make another.`,
      );
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = await this.avatar.count({ where: { userId, createdAt: { gt: since } } });
    if (today >= AvatarsService.DAILY_LIMIT) {
      throw new BadRequestException('You have made a lot of avatars today. Try again tomorrow.');
    }

    // Same choices as an existing one? Hand back what is already there rather
    // than storing a duplicate — free here, and not free once a model is behind it.
    const key = inputsKey(inputs);
    const existing = (await this.avatar.findMany({ where: { userId, status: 'ready' }, take: AvatarsService.MAX_STORED }))
      .find((r) => inputsKey(this.inputsOf(r)) === key);
    if (existing) return this.shape(existing);

    const row = await this.avatar.create({
      data: { userId, inputs: JSON.stringify(inputs), status: 'queued' },
    });

    try {
      const result = await this.provider.generate(inputs);
      const assetKey = await this.storage.putPrivateObject(
        'avatars', userId, result.body, result.contentType, result.ext,
      );
      await this.avatar.updateMany({
        where: { id: row.id, userId },
        data: {
          status: 'ready',
          assetKey,
          // The record of what drew it, written once, never inferred later.
          providerJobId: `${result.generatedBy}:${this.provider.name}`,
          error: null,
        },
      });
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`avatar generation failed for ${row.id}: ${message}`);
      await this.avatar.updateMany({
        where: { id: row.id, userId },
        data: { status: 'failed', error: 'That avatar could not be made. Try different choices.' },
      });
    }

    return this.shape(await this.own(userId, row.id));
  }

  // ── choosing and removing ──────────────────────────────

  /** Exactly one selected, enforced by clearing the rest in the same breath. */
  async select(userId: string, id: string) {
    const row = await this.own(userId, id);
    if (row.status !== 'ready') throw new BadRequestException('That avatar is not ready yet.');
    await this.prisma.$transaction(async () => {
      await this.avatar.updateMany({ where: { userId, isSelected: true }, data: { isSelected: false } });
      await this.avatar.updateMany({ where: { id, userId }, data: { isSelected: true } });
    });
    return this.shape(await this.own(userId, id));
  }

  async deselect(userId: string) {
    await this.avatar.updateMany({ where: { userId, isSelected: true }, data: { isSelected: false } });
    return { ok: true as const };
  }

  /**
   * Delete it, and the file with it.
   *
   * The object goes first. A row without its file is a broken thumbnail; a file
   * without its row is a picture of somebody nobody can find to delete.
   */
  async remove(userId: string, id: string) {
    const row = await this.own(userId, id);
    if (row.assetKey) await this.storage.deleteHealthObject(row.assetKey).catch(() => undefined);
    await this.avatar.deleteMany({ where: { id, userId } });
    return { ok: true as const };
  }
}
