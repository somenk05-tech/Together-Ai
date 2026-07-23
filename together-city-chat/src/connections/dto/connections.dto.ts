import { z } from 'zod';
import { HUB_SLUGS, UNIVERSAL_SLUGS, PERMISSIONED_SLUGS } from '../hubs.registry';

/**
 * Public connections API. Hub permissions are the SINGLE source of truth stored
 * on each connection (Connection.modulesJson) — a JSON permission set. The set
 * of valid hub keys is derived from the master hubs registry, so removing a hub
 * there (grocery / pantry / calendar) removes it from every API automatically.
 */
export const CONNECTION_MODULES = HUB_SLUGS as readonly string[];

/** Universal modules — every connection gets these automatically; they are
 *  never toggles and can never be revoked while the connection exists. */
export const UNIVERSAL_MODULES = UNIVERSAL_SLUGS as readonly string[];

const relationship = z.enum(['family', 'friend', 'partner', 'colleague', 'other']);
/** Only permissioned (non-universal) hubs may be passed in a grant set. */
const hubKey = z.string().refine((s) => HUB_SLUGS.includes(s), 'unknown hub');

export const RequestConnectionSchema = z.object({
  handle: z.string().min(1).max(40),
  relationship: relationship.optional(),
  modules: z.array(hubKey).max(HUB_SLUGS.length).optional(),
});

export const UpdateModulesSchema = z.object({
  modules: z.array(hubKey).max(HUB_SLUGS.length),
  relationship: relationship.optional(),
});
export type UpdateModulesDto = z.infer<typeof UpdateModulesSchema>;
export type RequestConnectionDto = z.infer<typeof RequestConnectionSchema>;

/** PATCH /connections/:id/permissions — a hub→boolean map (single source of
 *  truth). Universal hubs in the map are ignored (always on). */
export const UpdatePermissionsSchema = z.object({
  hubPermissions: z.record(z.boolean()),
  relationship: relationship.optional(),
});
export type UpdatePermissionsDto = z.infer<typeof UpdatePermissionsSchema>;

/** PATCH /hub/:hub/members — add or remove a connection from ONE hub. */
export const HubMemberPatchSchema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
});
export type HubMemberPatchDto = z.infer<typeof HubMemberPatchSchema>;

export const RespondConnectionSchema = z.object({
  connectionId: z.string().min(1),
  status: z.enum(['accepted', 'blocked']),
});
export type RespondConnectionDto = z.infer<typeof RespondConnectionSchema>;

/** Exposed for tests / callers that want the permissioned list. */
export const OPTIONAL_MODULES = PERMISSIONED_SLUGS as readonly string[];
