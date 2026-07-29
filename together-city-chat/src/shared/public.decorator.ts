import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'tc:isPublic';

/**
 * Opt a route out of the global JwtAuthGuard.
 *
 * Authentication is the default for every route in this API. A handler is
 * reachable without a token only when it is explicitly marked with this
 * decorator, which means a newly added controller is protected by omission
 * rather than exposed by omission. Anything marked here is a deliberate,
 * reviewable decision: sign-up, sign-in, token refresh, account recovery, and
 * the two unauthenticated status endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
