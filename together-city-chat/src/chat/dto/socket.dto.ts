import { z } from 'zod';
import { SendMessageSchema } from '../../messages/dto/messages.dto';

export const JoinConversationSchema = z.object({ conversationId: z.string().uuid() });
export const LeaveConversationSchema = z.object({ conversationId: z.string().uuid() });
export const TypingSchema = z.object({ conversationId: z.string().uuid() });
export const AckSchema = z.object({
  conversationId: z.string().uuid(),
  messageIds: z.array(z.string().uuid()).min(1).max(500),
});
export const SocketSendSchema = SendMessageSchema;

export type JoinConversationDto = z.infer<typeof JoinConversationSchema>;
export type TypingDto = z.infer<typeof TypingSchema>;
export type SocketAckDto = z.infer<typeof AckSchema>;
