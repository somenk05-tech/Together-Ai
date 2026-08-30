import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { swallowed } from '../shared/swallow';
import { AiService } from '../ai/ai.service';
import { BEAUTY_PRODUCTS } from './beauty-engine';
import {
  matchProducts, normaliseAttributes, stepsFor, NEUTRAL_ATTRIBUTES,
  type LookAttributes, type ShelfProduct,
} from './look-decode';
import { topicalExclusions } from '../shared/topical-sensitivities';
import { allergyNotice, type AllergyNotice } from '../shared/allergen-voice';

const PRODUCTS = { one: 'product', many: 'products' };

interface LookRow {
  id: string; userId: string; fileKey: string | null; mimeType: string | null;
  status: string; readBy: string; attributes: string | null; steps: string | null;
  productMatches: string | null; confidence: number; error: string | null; createdAt: Date;
}

/**
 * Makeup reference photos — brief item 23.
 *
 * A citizen uploads a look they want and gets back the steps to recreate it,
 * matched to products they can actually buy. The vision read and the makeup
 * advice are separate on purpose (see look-decode.ts): the steps are testable
 * without a model, and swapping the reader cannot change the advice.
 *
 * Honest about what read the photo. `readBy: 'ai'` with a real confidence when a
 * model was available; `'fallback'` with confidence 0 when it was not, and the
 * response says the photo was not actually read rather than presenting a generic
 * routine as if it came from the image.
 */
@Injectable()
export class LookAnalysisService {
  private readonly logger = new Logger(LookAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    /* Optional so the specs that construct this service directly keep working;
       `remove` says loudly in the log when a photograph was left behind. */
    @Optional() private readonly storage?: StorageProvider,
  ) {}

  /** The generated client may lag the schema; one narrow accessor. */
  private get table() {
    return (this.prisma as unknown as {
      lookAnalysis: {
        create(a: unknown): Promise<LookRow>;
        update(a: unknown): Promise<LookRow>;
        findFirst(a: unknown): Promise<LookRow | null>;
        findMany(a: unknown): Promise<LookRow[]>;
        updateMany(a: unknown): Promise<{ count: number }>;
      };
    }).lookAnalysis;
  }

  private shelf(): ShelfProduct[] {
    return BEAUTY_PRODUCTS.map((p) => ({
      id: p.id, name: p.name, category: p.category,
      suitableSkin: p.suitableSkin, actives: p.actives,
    }));
  }

  /**
   * Read a reference photo and store what it implies.
   *
   * The image itself is passed to the model and NOT retained beyond the object
   * key the citizen already uploaded — the derived steps are what this feature
   * is for, and keeping a face around longer than needed is a liability.
   */
  async analyze(
    userId: string,
    input: { fileKey?: string; mimeType?: string; base64?: string },
    prefs: { allergies?: string[]; skinType?: string } = {},
  ) {
    const row = await this.table.create({
      data: { userId, fileKey: input.fileKey ?? null, mimeType: input.mimeType ?? null, status: 'processing' },
    });

    let attributes: LookAttributes = NEUTRAL_ATTRIBUTES;
    let readBy = 'fallback';
    let confidence = 0;
    let error: string | null = null;

    if (this.ai.enabled && input.base64) {
      try {
        const seen = await this.ai.reviewSkinPhotos([
          { base64: input.base64, mediaType: input.mimeType || 'image/jpeg' },
        ]);
        const { attributes: a, confident } = normaliseAttributes(seen.face);
        attributes = a;
        if (confident) { readBy = 'ai'; confidence = 0.8; }
      } catch (e) {
        // A reader that fails is a state the citizen can act on, not a 500.
        error = (e as Error).message.slice(0, 200);
        this.logger.warn(`look analysis ${row.id} could not be read`);
      }
    }

    const steps = stepsFor(attributes);
    const shelf = this.shelf();
    const matches = matchProducts(steps, shelf, prefs);
    // K5.66 — matchProducts() has excluded on declared sensitivities since the
    // substring test was replaced, and has never said so. A step with no product
    // against it reads as "we don't stock one", not "we do, and it has almond
    // oil in it".
    const cut = topicalExclusions(
      shelf.map((p) => ({ name: p.name, ingredients: p.actives })),
      prefs.allergies ?? [],
    );

    const saved = await this.table.update({
      where: { id: row.id },
      data: {
        status: 'ready',
        readBy,
        confidence,
        error,
        attributes: JSON.stringify(attributes),
        steps: JSON.stringify(steps),
        productMatches: JSON.stringify(matches),
      },
    });
    return { ...this.shape(saved), allergyNotice: allergyNotice(cut.matched, cut.removed, PRODUCTS) };
  }

  async list(userId: string) {
    const rows = await this.table.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.shape(r));
  }

  async get(userId: string, id: string) {
    const row = await this.table.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('No such look.');
    return this.shape(row);
  }

  /**
   * Delete the look — and the photograph, which is the half this did not do.
   *
   * ── NULLING A KEY IS NOT DELETING A FILE (30 Aug) ─────────────────────────
   *
   * This set `fileKey: null` and stopped. The row said the photo was detached;
   * the photograph was still in the private vault, and would be forever —
   * because nulling the column DESTROYED THE ONLY RECORD OF WHERE IT WAS. The
   * purge rule in purge-plan.ts names `fileKey` and could never fire on these
   * rows again, so "delete this look" was the one action that put a face
   * permanently beyond the reach of the machinery built to remove it.
   *
   * A reference photograph of somebody's face, kept on the promise it was for
   * an analysis they have just asked to be rid of, is not a small thing to
   * leave behind. The object goes first, then the key.
   */
  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const row = await this.table.findFirst({ where: { id, userId } }) as { fileKey?: string | null } | null;
    if (!row) throw new NotFoundException('No such look.');
    if (row.fileKey) {
      if (this.storage) {
        await this.storage.deleteHealthObject(row.fileKey)
          .catch(swallowed('beauty.remove: delete look photo', undefined, { userId, id }));
      } else {
        this.logger.error(
          `look ${id}: no storage provider wired — the reference photograph (${row.fileKey}) was NOT removed `
          + 'from the vault, and the key is about to be nulled, so it is now orphaned.',
        );
      }
    }
    const res = await this.table.updateMany({
      where: { id, userId },
      data: { status: 'deleted', fileKey: null, attributes: null, steps: null, productMatches: null },
    });
    if (res.count === 0) throw new NotFoundException('No such look.');
    return { ok: true };
  }

  private shape(r: LookRow) {
    const parse = <T>(raw: string | null, fallback: T): T => {
      if (!raw) return fallback;
      try { return JSON.parse(raw) as T; } catch { return fallback; }
    };
    return {
      id: r.id,
      status: r.status,
      readBy: r.readBy,
      confidence: r.confidence,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      attributes: parse<LookAttributes>(r.attributes, NEUTRAL_ATTRIBUTES),
      steps: parse(r.steps, []),
      productMatches: parse(r.productMatches, []),
      // Only the analyse call knows whose shelf this was; a look re-read later
      // carries no claim rather than a stale one.
      allergyNotice: null as AllergyNotice | null,
      /** Said plainly, because a generic routine presented as a reading is a lie. */
      note: r.readBy === 'ai'
        ? 'Read from your photo.'
        : 'Your photo could not be read automatically, so these are general steps for this kind of look rather than a reading of your image.',
    };
  }
}
