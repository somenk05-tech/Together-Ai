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
