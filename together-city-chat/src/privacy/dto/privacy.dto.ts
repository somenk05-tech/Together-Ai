import { z } from 'zod';

/** A single privacy key/value write: key like "tos", "ack:medical", "pref:location". */
export const PrivacySetSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9_:.-]+$/i),
  value: z.string().max(256),
});
export type PrivacySetDto = z.infer<typeof PrivacySetSchema>;
