import { SetMetadata } from '@nestjs/common';

export const DEPRECATED_KEY = 'route:deprecated';

export interface DeprecationNotice {
  /** ISO date the route stopped being the supported way to do this. */
  since: string;
  /** ISO date it will be deleted. One release away, not one day away. */
  sunset: string;
  /** What a caller should use instead, or why there is no replacement. */
  replacement: string;
}

/**
 * Marks a route as on its way out.
 *
 * The review removed nine destinations. Deleting their endpoints in the same
 * release as their screens would hard-fail every client still running the old
 * build — a phone that has not updated, a tab left open since yesterday. So the
 * endpoints stay for one release and say so in the response, in the standard
 * form (RFC 8594) rather than in a comment nobody reads:
 *
 *     Deprecation: @1785456000
 *     Sunset: Sun, 30 Aug 2026 00:00:00 GMT
 *     Link: </nutrition/weekly>; rel="successor-version"
 *
 * Every call is also logged, so the decision to actually delete the route is
 * made against a number rather than against a guess about who is still calling.
 */
export const Deprecated = (notice: DeprecationNotice) => SetMetadata(DEPRECATED_KEY, notice);
