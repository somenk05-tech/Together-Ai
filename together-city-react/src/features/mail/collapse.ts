/**
 * WHICH MESSAGES IN A TRAIL OPEN THEMSELVES, AND WHICH WAIT TO BE ASKED.
 *
 * A five-message trail rendered every message in full, oldest first, so the
 * reply that arrived this morning sat at the bottom of four screens of
 * yesterday — and the signature block under each one made it worse. Every mail
 * client answers this the same way: the new thing is open, the old thing is a
 * line you can tap.
 *
 * "Old" here means READ AND NOT THE NEWEST, which is a statement about the
 * citizen's attention rather than about the clock:
 *
 *   1. The NEWEST message is always open. It is why the trail was opened.
 *   2. The message they CLICKED is always open. They tapped a specific line in
 *      a folder; opening its thread with that message folded away would hide
 *      the one thing they asked for.
 *   3. Any UNREAD message is open. Unread is the app's own record that these
 *      words have not been used yet, and collapsing them would let a thread
 *      swallow something never seen.
 *   4. Everything else collapses.
 *
 * PURE, AND ITS OWN FILE, for the same reason quoted.ts is: the rule is worth
 * testing, and a rule tangled in a component cannot be.
 */

export interface TrailEntry {
  id: string;
  /** The app's own record of whether these words have been seen. */
  read: boolean;
  /** ISO timestamp. Ties fall back to position in the array. */
  createdAt: string;
}

/** The id of the newest entry — by time, falling back to last position. */
export function newestId<T extends TrailEntry>(trail: T[]): string | null {
  if (trail.length === 0) return null;
  let best = trail[trail.length - 1];
  let bestAt = Date.parse(best.createdAt);
  for (const x of trail) {
    const at = Date.parse(x.createdAt);
    // `>` not `>=`: an equal timestamp keeps the later-positioned entry, which
    // is the order the server sent and therefore the order the citizen reads.
    if (Number.isFinite(at) && (!Number.isFinite(bestAt) || at > bestAt)) { best = x; bestAt = at; }
  }
  return best.id;
}

/**
 * The ids that render expanded when the trail first appears. Everything else
 * renders as a one-line row the citizen can open.
 */
export function expandedByDefault<T extends TrailEntry>(trail: T[], openedId?: string): Set<string> {
  const out = new Set<string>();
  if (trail.length === 0) return out;
  // A single message is not a trail — there is nothing to fold it against.
  if (trail.length === 1) { out.add(trail[0].id); return out; }

  const newest = newestId(trail);
  if (newest) out.add(newest);
  if (openedId && trail.some((x) => x.id === openedId)) out.add(openedId);
  for (const x of trail) if (!x.read) out.add(x.id);
  return out;
}

/**
 * The one line a folded message shows.
 *
 * Derived from the SAME text the open message renders — quoted history and the
 * city footer already removed — so the preview and the body can never tell the
 * citizen two different things about what a message says. The server's own
 * `snippet` is the whole body's first characters, which on a reply is often the
 * signature of the message being answered.
 */
export function previewOf(unquotedBody: string, max = 110): string {
  const line = (unquotedBody ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
