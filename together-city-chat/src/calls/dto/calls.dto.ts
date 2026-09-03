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
    /* THREE KINDS, AND 'renegotiate' IS NOT ONE OF THEM.
       It was accepted here and handled nowhere: the client treats anything
       that is not 'ice' as a session description, so a frame naming it arrived
       at setRemoteDescription as whatever its payload happened to be. Screen
       sharing — the one feature that might have wanted it — deliberately uses
       replaceTrack precisely so that nothing is renegotiated. An accepted kind
       with no handler is a hole with a name; it is refused at the door until
       something actually sends it. */
    kind: z.enum(['offer', 'answer', 'ice']),
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
