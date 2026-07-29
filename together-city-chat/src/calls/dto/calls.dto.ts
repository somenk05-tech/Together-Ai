import { z } from 'zod';

/**
 * A call is audio, video, or an avatar standing in for the camera.
 * 'avatar' requires an avatarId the caller actually owns — see CallsService.
 */
export const CallTypeSchema = z.enum(['audio', 'video', 'avatar']);

export const StartCallSchema = z
  .object({
    conversationId: z.string().uuid(),
    type: CallTypeSchema.default('audio'),
    avatarId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => v.type !== 'avatar' || !!v.avatarId, {
    message: 'An avatar call needs an avatarId.',
    path: ['avatarId'],
  });

export const LeaveCallSchema = z
  .object({
    /** 'decline' is a leave that never joined; the state machine reads the rows. */
    reason: z.enum(['hangup', 'decline']).default('hangup'),
  })
  .strict();

export const ListCallsSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

/**
 * The handshake, relayed but never stored.
 *
 * An SDP offer for a video call runs to a few kilobytes; ICE candidates are
 * tiny and numerous. The cap is generous enough for the former and mean enough
 * that a socket cannot be used to push megabytes at another citizen.
 */
export const MAX_SIGNAL_BYTES = 16 * 1024;

export const CallSignalSchema = z
  .object({
    callId: z.string().uuid(),
    /** The participant this is meant for. Checked against the call's roster. */
    to: z.string().uuid(),
    kind: z.enum(['offer', 'answer', 'ice', 'renegotiate']),
    payload: z.unknown().refine(
      (v) => {
        try {
          return JSON.stringify(v ?? null).length <= MAX_SIGNAL_BYTES;
        } catch {
          return false;
        }
      },
      { message: 'Signalling payload is too large.' },
    ),
  })
  .strict();

export type StartCallDto = z.infer<typeof StartCallSchema>;
export type LeaveCallDto = z.infer<typeof LeaveCallSchema>;
export type ListCallsDto = z.infer<typeof ListCallsSchema>;
export type CallSignalDto = z.infer<typeof CallSignalSchema>;
