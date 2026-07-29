import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';

/** One 10 GB vault per account, shared across mail + health documents + drive. */
const QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024 * 1024; // 1 GB per file (matches the mail attachment ceiling)
const MAX_NAME = 180;

interface FolderRow { id: string; ownerId: string; name: string; parentId: string | null; createdAt: Date; updatedAt: Date }
interface FileRow {
  id: string; ownerId: string; folderId: string | null; name: string; mimeType: string | null;
  sizeBytes: number; storageKey: string; attachedType: string | null; attachedId: string | null;
  createdAt: Date; updatedAt: Date;
}

/**
 * The citizen's private online drive.
 *
 * Every query is scoped by `ownerId` — a file or folder id belonging to someone
 * else resolves to "not found", so IDs can't be guessed into other people's
 * data. Objects live in the private vault bucket under `drive/<ownerId>/…`, and
 * downloads are handed out as short-lived signed URLs by this authenticated
 * backend; the bucket is never public.
 */
@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  private get folders() {
    return (this.prisma as unknown as {
      driveFolder: {
        findFirst(a: unknown): Promise<FolderRow | null>;
        findMany(a: unknown): Promise<FolderRow[]>;
        create(a: unknown): Promise<FolderRow>;
        update(a: unknown): Promise<FolderRow>;
        delete(a: unknown): Promise<FolderRow>;
      };
    }).driveFolder;
  }

  private get files() {
    return (this.prisma as unknown as {
      driveFile: {
        findFirst(a: unknown): Promise<FileRow | null>;
        findMany(a: unknown): Promise<FileRow[]>;
        create(a: unknown): Promise<FileRow>;
        update(a: unknown): Promise<FileRow>;
        delete(a: unknown): Promise<FileRow>;
        aggregate(a: unknown): Promise<{ _sum: { sizeBytes: number | null } }>;
      };
    }).driveFile;
  }

  private clean(name: string): string {
    const s = (name ?? '').replace(/[\r\n\t]/g, ' ').replace(/[/\\]/g, '-').trim();
    if (!s) throw new BadRequestException('Give it a name.');
    return s.slice(0, MAX_NAME);
  }

  private shapeFile(f: FileRow) {
    return {
      id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
      folderId: f.folderId, attachedType: f.attachedType, attachedId: f.attachedId,
      createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
    };
  }

  private shapeFolder(d: FolderRow) {
    return { id: d.id, name: d.name, parentId: d.parentId, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
  }

  /** Assert a folder exists AND belongs to this user. Null id = drive root. */
  private async ownFolder(userId: string, folderId: string | null | undefined): Promise<string | null> {
    if (!folderId) return null;
    const row = await this.folders.findFirst({ where: { id: folderId, ownerId: userId } });
    if (!row) throw new NotFoundException('Folder not found.');
    return row.id;
  }

  // ── storage usage (unified vault: mail + health + drive) ──
  async usage(userId: string) {
    const [mail, health, drive] = await Promise.all([
      this.prisma.mailMessage.findMany({ where: { ownerId: userId }, select: { sizeBytes: true } }).catch(() => [] as Array<{ sizeBytes: number | null }>),
      (this.prisma.medicalRecord.findMany({ where: { userId }, select: { sizeBytes: true } as never }) as Promise<Array<{ sizeBytes: number | null }>>).catch(() => []),
      this.files.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } }).catch(() => ({ _sum: { sizeBytes: 0 } })),
    ]);
    const mailBytes = mail.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
    const healthBytes = health.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
    const driveBytes = drive._sum.sizeBytes ?? 0;
    const usedBytes = mailBytes + healthBytes + driveBytes;
    return {
      quotaBytes: QUOTA_BYTES,
      usedBytes,
      mailBytes,
      healthBytes,
      driveBytes,
      remainingBytes: Math.max(0, QUOTA_BYTES - usedBytes),
      usedPct: Math.min(100, +((usedBytes / QUOTA_BYTES) * 100).toFixed(2)),
    };
  }

  // ── browse ──
  async list(userId: string, folderId?: string) {
    const parentId = await this.ownFolder(userId, folderId ?? null);
    const [folders, files] = await Promise.all([
      this.folders.findMany({ where: { ownerId: userId, parentId }, orderBy: { name: 'asc' } }),
      this.files.findMany({ where: { ownerId: userId, folderId: parentId }, orderBy: { createdAt: 'desc' } }),
    ]);
    // Breadcrumb from the current folder up to the root.
    const breadcrumb: Array<{ id: string; name: string }> = [];
    let cursor = parentId;
    for (let i = 0; i < 24 && cursor; i++) {
      const row: FolderRow | null = await this.folders.findFirst({ where: { id: cursor, ownerId: userId } });
      if (!row) break;
      breadcrumb.unshift({ id: row.id, name: row.name });
      cursor = row.parentId;
    }
    return {
      folderId: parentId,
      breadcrumb,
      folders: folders.map((f) => this.shapeFolder(f)),
      files: files.map((f) => this.shapeFile(f)),
    };
  }

  // ── folders ──
  async createFolder(userId: string, name: string, parentId?: string) {
    const parent = await this.ownFolder(userId, parentId ?? null);
    const row = await this.folders.create({ data: { ownerId: userId, name: this.clean(name), parentId: parent } });
    return this.shapeFolder(row);
  }

  async renameFolder(userId: string, id: string, patch: { name?: string; parentId?: string | null }) {
    const row = await this.folders.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('Folder not found.');
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = this.clean(patch.name);
    if (patch.parentId !== undefined) {
      if (patch.parentId === id) throw new BadRequestException("A folder can't contain itself.");
      const target = await this.ownFolder(userId, patch.parentId);
      // Refuse to move a folder inside its own subtree (that would orphan it).
      let cursor = target;
      for (let i = 0; i < 24 && cursor; i++) {
        if (cursor === id) throw new BadRequestException("You can't move a folder into itself.");
        const up: FolderRow | null = await this.folders.findFirst({ where: { id: cursor, ownerId: userId } });
        cursor = up?.parentId ?? null;
      }
      data.parentId = target;
    }
    const updated = await this.folders.update({ where: { id }, data });
    return this.shapeFolder(updated);
  }

  /** Delete a folder and everything under it (rows cascade; objects removed). */
  async deleteFolder(userId: string, id: string) {
    const row = await this.folders.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('Folder not found.');
    // Collect the subtree so the stored objects can be removed too.
    const ids: string[] = [id];
    for (let i = 0; i < ids.length && i < 5000; i++) {
      const kids = await this.folders.findMany({ where: { ownerId: userId, parentId: ids[i] }, select: { id: true } as never });
      for (const k of kids) ids.push(k.id);
    }
    const doomed = await this.files.findMany({ where: { ownerId: userId, folderId: { in: ids } } as never });
    for (const f of doomed) await this.storage.deleteHealthObject(f.storageKey).catch(() => undefined);
    await this.folders.delete({ where: { id } }); // children + files cascade
    return { ok: true, deletedFiles: doomed.length };
  }

  // ── files ──
  /** Step 1: hand out a presigned PUT so the browser uploads straight to storage. */
  async presign(userId: string, input: { mimeType?: string; ext?: string; sizeBytes: number }) {
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new BadRequestException('Missing file size.');
    if (input.sizeBytes > MAX_FILE_BYTES) {
      throw new BadRequestException(`That file is larger than the ${Math.round(MAX_FILE_BYTES / 1024 / 1024 / 1024)} GB per-file limit.`);
    }
    const { remainingBytes } = await this.usage(userId);
    if (input.sizeBytes > remainingBytes) {
      throw new ForbiddenException('Your 10 GB vault is full — delete something to free up space.');
    }
    return this.storage.presignDriveUpload(userId, input.mimeType || 'application/octet-stream', input.ext || 'bin');
  }

  /** Step 2: confirm the upload landed and record it. */
  async confirm(userId: string, input: {
    storageKey: string; name: string; sizeBytes: number; mimeType?: string; folderId?: string; checksum?: string;
  }) {
    // The key encodes the owner, so a client can't register a file into someone
    // else's namespace (or claim an existing object it doesn't own).
    if (!StorageProvider.isOwnDriveKey(userId, input.storageKey)) {
      throw new ForbiddenException('That upload does not belong to you.');
    }
    const folderId = await this.ownFolder(userId, input.folderId ?? null);
    if (input.sizeBytes > MAX_FILE_BYTES) throw new BadRequestException('That file is too large.');
    const { remainingBytes } = await this.usage(userId);
    if (input.sizeBytes > remainingBytes) throw new ForbiddenException('Your 10 GB vault is full.');
    if (!(await this.storage.healthObjectExists(input.storageKey))) {
      throw new BadRequestException("That upload didn't finish — check your connection and try again.");
    }
    const row = await this.files.create({
      data: {
        ownerId: userId, folderId, name: this.clean(input.name),
        mimeType: input.mimeType ?? null, sizeBytes: Math.max(0, Math.floor(input.sizeBytes)),
        storageKey: input.storageKey, checksum: input.checksum ?? null,
      },
    });
    return this.shapeFile(row);
  }

  /** Short-lived signed URL to download/view one of YOUR files. */
  async downloadUrl(userId: string, id: string) {
    const row = await this.files.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('File not found.');
    const url = await this.storage.presignHealthDownload(row.storageKey);
    if (!url) throw new NotFoundException('File storage is not available right now.');
    return { url, name: row.name, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
  }

  async updateFile(userId: string, id: string, patch: { name?: string; folderId?: string | null }) {
    const row = await this.files.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('File not found.');
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = this.clean(patch.name);
    if (patch.folderId !== undefined) data.folderId = await this.ownFolder(userId, patch.folderId);
    const updated = await this.files.update({ where: { id }, data });
    return this.shapeFile(updated);
  }

  async deleteFile(userId: string, id: string) {
    const row = await this.files.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('File not found.');
    await this.storage.deleteHealthObject(row.storageKey).catch(() => undefined);
    await this.files.delete({ where: { id } });
    return { ok: true };
  }

  /** Link a file to another entity (message, listing, prescription, …). */
  async attach(userId: string, id: string, attachedType: string, attachedId: string) {
    const row = await this.files.findFirst({ where: { id, ownerId: userId } });
    if (!row) throw new NotFoundException('File not found.');
    const updated = await this.files.update({
      where: { id },
      data: { attachedType: this.clean(attachedType).slice(0, 40), attachedId: this.clean(attachedId).slice(0, 80) },
    });
    return this.shapeFile(updated);
  }

  /** Everything the user has attached to a given entity. */
  async attachments(userId: string, attachedType: string, attachedId: string) {
    const rows = await this.files.findMany({
      where: { ownerId: userId, attachedType, attachedId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((f) => this.shapeFile(f)) };
  }
}
