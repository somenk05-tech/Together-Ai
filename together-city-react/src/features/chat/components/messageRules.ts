import type { Message } from '@/types';

/**
 * ── THE RULES A MESSAGE OBEYS, AWAY FROM THE COMPONENT ──────────────────────
 *
 * Two lists and one clock, in their own module because MessageThread.tsx
 * exports components — and a file that exports both is a file Fast Refresh
 * gives up on, which the repo's lint says out loud. `packShape.ts` and
 * `verdictTone.ts` in the Pet District exist for exactly this reason; this is
 * the same split for the same rule.
 *
 * It also removes a warning that predates this change: `withinWindow` has been
 * exported from beside a component since it was written.
 */

/**
 * THE QUICK RAIL, AND THE TRAY BEHIND THE PLUS.
 *
 * A closed set, and the same closed set the API enforces in
 * messages/dto/messages.dto.ts — the two packages share no code, so this is a
 * copy and `a-message-can-be-answered-without-words.test.ts` pins this end of
 * it.
 *
 * IT WAS SIX, AND THE REASON IT WAS SIX HAS GONE. The old note read "six is
 * what fits on one row of a phone BESIDE THE OTHER ACTIONS, which is the
 * reason there is no picker to open: the picker IS the row." The other actions
 * no longer share that row — they are a menu under the pressed message now —
 * so the rail is free to be the seven that were asked for, 😡 included, with a
 * `+` that opens the rest.
 *
 * WHAT THE PLUS DOES NOT OPEN IS A TEXT FIELD. The API's own note is worth
 * repeating: an open emoji field is an open text field wearing a smaller name,
 * and this one is persisted and then broadcast to a whole room. So `+` opens a
 * TRAY — longer, still written down, still the same list on both ends of the
 * wire. Every emoji a citizen can send is a value the server has agreed to.
 */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '😡'] as const;

/** The rest of the tray. Enumerated for the reason above; ordered roughly by
 *  how often a chat actually reaches for them. */
export const MORE_REACTIONS = [
  '🎉', '🔥', '👏', '💯', '🙌', '😍', '🥰', '😅',
  '🤔', '😴', '👀', '🤝', '💪', '☕', '🍰', '🐾',
  '✅', '❌', '⭐', '💔', '😭', '🤯', '🙃', '🫶',
] as const;

/**
 * 15-minute edit / delete-for-everyone window (matches the server policy).
 *
 * SHARED because the bulk bar has to ask the same question of a whole
 * selection: "for everyone" is offered only when every message in it is yours
 * and still inside the window. A second copy of the rule in the page would go
 * on looking correct for exactly as long as the two numbers happened to agree,
 * which is the kind of duplication this repo does factor out — the test is
 * whether it can fail SILENTLY, not whether there are two callers.
 */
const WINDOW_MS = 15 * 60 * 1000;
export const withinWindow = (m: Message) => Date.now() - new Date(m.createdAt).getTime() < WINDOW_MS;

/** How long a finger stays put before the room dims. 450ms is what the old bar
 *  used and what the platform pickers feel like; shorter fires on a tap. */
export const HOLD_MS = 450;

/** How far it may travel first. Below this is the wobble of holding still;
 *  above it, the citizen is scrolling and has stopped looking at this message. */
export const SLOP = 10;
