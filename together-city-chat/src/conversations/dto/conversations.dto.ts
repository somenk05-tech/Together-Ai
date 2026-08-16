import { z } from 'zod';

export const StartDirectSchema = z.object({ handle: z.string().min(1).max(40) });
export type StartDirectDto = z.infer<typeof StartDirectSchema>;

export const AddMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(64),
});
export type AddMembersDto = z.infer<typeof AddMembersSchema>;

/** ADMIN or MEMBER, never OWNER. Ownership moves exactly once, when an owner
 *  leaves — see conversations.service.leaveConversation. */
export const SetRoleSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) });
export type SetRoleDto = z.infer<typeof SetRoleSchema>;

export const RenameGroupSchema = z.object({ title: z.string().min(1).max(80) });
export type RenameGroupDto = z.infer<typeof RenameGroupSchema>;

export const CreateGroupSchema = z.object({
  title: z.string().min(1).max(80),
  memberIds: z.array(z.string().uuid()).min(1).max(256),
});
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;

/**
 * The picture a reader puts on one of their own conversation rows.
 *
 * A resized `data:` image or null, and the same shape the account photo takes
 * (users.service.setAvatar) — a small square JPEG made on the device. The cap
 * is the same 400 000 characters, because the reason for it is the same: this
 * string is read back on every list and a photograph straight off a phone is
 * megabytes.
 *
 * NULL IS A REAL VALUE HERE and is how the picture is taken off again — it is
 * `.nullable()`, not `.optional()`, so "put it back to their own photo" is
 * something a client can say rather than something it has to imply.
 */
export const SetChatPhotoSchema = z.object({
  photo: z.string().max(400_000).regex(/^data:image\/(png|jpe?g|webp);base64,/, 'Use a photo from your device.').nullable(),
});
export type SetChatPhotoDto = z.infer<typeof SetChatPhotoSchema>;
