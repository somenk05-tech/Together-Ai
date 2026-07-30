/**
 * Diffing a profile patch into an audit trail (§3 BE-3.1).
 *
 * Pure, so the part that is easy to get wrong — what counts as a change — is
 * testable without a database. The rules are less obvious than they look:
 *
 *   - A field set to the value it already holds is not a change. Nine services
 *     call syncShared on every save, most of them re-sending everything they
 *     know, so recording equality would bury the real edits in noise.
 *   - Clearing a field IS a change, and one worth keeping. "My weight went
 *     blank" is exactly the kind of thing somebody needs to be able to ask
 *     about later.
 *   - Values are compared after rendering, not before, so a Date and its ISO
 *     string do not read as a change every time a different hub writes.
 */

export interface ProfileChangeRow {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/** One canonical string per value, so comparison and storage agree. */
export function renderValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * What actually changed, as rows.
 *
 * `before` may be null — the profile did not exist yet — in which case every
 * supplied value is a change from nothing. That is right: the first time a
 * citizen tells us their weight is an event, not a non-event.
 */
export function diffProfile(
  before: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): ProfileChangeRow[] {
  const rows: ProfileChangeRow[] = [];
  for (const [field, raw] of Object.entries(patch)) {
    // undefined means "not mentioned in this patch", which is different from
    // null ("clear this"). Only the second is an edit.
    if (raw === undefined) continue;
    const newValue = renderValue(raw);
    const oldValue = renderValue(before?.[field]);
    if (oldValue === newValue) continue;
    rows.push({ field, oldValue, newValue });
  }
  return rows;
}

/**
 * Are these two versions compatible?
 *
 * Optimistic concurrency, and deliberately permissive about the client not
 * participating: a caller that sends no expected version is not attempting to
 * be safe, and refusing it would break the eight hub services that legitimately
 * write shared fields without ever having read the profile. Only a caller that
 * states a version can be told it is stale.
 */
export function versionConflict(current: number, expected?: number | null): boolean {
  return typeof expected === 'number' && expected !== current;
}
