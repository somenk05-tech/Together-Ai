import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { DriveService } from './drive.service';
import { Mira } from '../mira/mira.decorator';

const NameSchema = z.object({ name: z.string().min(1).max(180) });
const CreateFolderSchema = NameSchema.extend({ parentId: z.string().uuid().optional() });
const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  parentId: z.string().uuid().nullable().optional(),
});
const PresignSchema = z.object({
  mimeType: z.string().max(150).optional(),
  ext: z.string().max(10).optional(),
  sizeBytes: z.number().int().positive(),
});
const ConfirmSchema = z.object({
  storageKey: z.string().min(1).max(400),
  name: z.string().min(1).max(180),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().max(150).optional(),
  folderId: z.string().uuid().optional(),
  checksum: z.string().max(128).optional(),
});
const UpdateFileSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  folderId: z.string().uuid().nullable().optional(),
});
const AttachSchema = z.object({ attachedType: z.string().min(1).max(40), attachedId: z.string().min(1).max(80) });

/**
 * The citizen's private drive. Every route is JWT-guarded and scoped to the
 * signed-in owner — another user's folder/file id resolves to 404, never data.
 */
@Controller('drive')
@UseGuards(JwtAuthGuard)
export class DriveController {
  constructor(private readonly drive: DriveService) {}

  /** Vault usage across mail + health documents + drive (one 10 GB allowance). */
  @Mira({
    intent: 'Tell the citizen how much storage they have left',
    utterances: ['how much storage', 'my drive space', 'am I out of space', 'storage left'],
    risk: 'R0',
  })
  @Get('usage')
  usage(@CurrentUser() user: JwtUser) {
    return this.drive.usage(user.sub);
  }

  /** Browse a folder (omit folderId for the drive root). */
  @Mira({
    intent: 'Find one of the citizen’s own documents',
    utterances: ["where's my insurance document", 'find my policy', 'my documents'],
    risk: 'R0',
  })
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('folderId') folderId?: string) {
    return this.drive.list(user.sub, folderId);
  }

  @Post('folders')
  createFolder(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const dto = parseOrThrow(CreateFolderSchema, body);
    return this.drive.createFolder(user.sub, dto.name, dto.parentId);
  }

  @Patch('folders/:id')
  updateFolder(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    return this.drive.renameFolder(user.sub, id, parseOrThrow(UpdateFolderSchema, body));
  }

  @Delete('folders/:id')
  deleteFolder(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.drive.deleteFolder(user.sub, id);
  }

  /** Step 1 of an upload: presigned PUT straight to private storage. */
  @Post('files/presign')
  presign(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    return this.drive.presign(user.sub, parseOrThrow(PresignSchema, body));
  }

  /** Step 2: confirm the object landed and file it in the drive. */
  @Post('files')
  confirm(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    return this.drive.confirm(user.sub, parseOrThrow(ConfirmSchema, body));
  }

  /** Short-lived signed download URL (owner only). */
  @Get('files/:id/url')
  download(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.drive.downloadUrl(user.sub, id);
  }

  @Patch('files/:id')
  updateFile(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    return this.drive.updateFile(user.sub, id, parseOrThrow(UpdateFileSchema, body));
  }

  @Delete('files/:id')
  deleteFile(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.drive.deleteFile(user.sub, id);
  }

  /** Attach a drive file to another entity (message, listing, prescription…). */
  @Post('files/:id/attach')
  attach(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const dto = parseOrThrow(AttachSchema, body);
    return this.drive.attach(user.sub, id, dto.attachedType, dto.attachedId);
  }

  /** List this user's files attached to a given entity. */
  @Get('attachments')
  attachments(
    @CurrentUser() user: JwtUser,
    @Query('type') type: string,
    @Query('id') id: string,
  ) {
    return this.drive.attachments(user.sub, type ?? '', id ?? '');
  }
}
