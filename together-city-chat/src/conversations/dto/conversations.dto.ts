import { z } from 'zod';

export const StartDirectSchema = z.object({ targetUserId: z.string().uuid() });
export type StartDirectDto = z.infer<typeof StartDirectSchema>;

export const CreateGroupSchema = z.object({
  title: z.string().min(1).max(80),
  memberIds: z.array(z.string().uuid()).min(1).max(256),
});
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;
