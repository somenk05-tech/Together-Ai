/**
 * ── A SPACE FOR THE FILM (owner, 18 Sep) ────────────────────────────────────
 *
 * "Each workout should have space for workout videos which tells them how to
 * work out."
 *
 * The space is on every card of the library, and this file is what fills it.
 * A film is CODE, not a database row, for the same reason the three films the
 * session runner plays are (exercise-library.ts `video`): the developer copy
 * and the live site have separate databases, and a link typed into one would
 * never reach the other — while a line here goes live with the Go live
 * button like everything else.
 *
 * Every movement is being filmed twice (The-Workout-Films-9-Sep.md): once by
 * the woman trainer for the women's library and once by the man for the
 * men's. A film shot for one library goes in that slot; a film that is the
 * movement and nobody's library in particular goes in `any`, which either
 * library shows when it has none of its own.
 *
 * A path under /assets/workout/ must be a file that ships with the web app;
 * a full https:// URL is where the 2,648 clips will live once they are cut.
 * The spec checks the first kind exists. An empty slot prints as an empty
 * slot — "the city's film of this movement is on its way" — never as a
 * borrowed clip of a different movement, which the 9 Sep sissy squat taught
 * this hub is worse than nothing.
 */
import type { Track } from './exercise-grade';

export interface ExerciseFilms { women?: string; men?: string; any?: string }

/** Keyed by the catalogue id. Add a line, not a column. */
export const EXERCISE_FILMS: Record<string, ExerciseFilms> = {
  /* The calf stretch the owner filmed for the session runner (6 Sep) — the
     library's `calf-stretch` row points at catalogue 1377, so the same film
     is true here. */
  '1377': { any: '/assets/workout/calf-stretch.mp4' },
};

export function filmFor(id: string, track: Track): string | null {
  const f = EXERCISE_FILMS[id];
  if (!f) return null;
  return f[track] ?? f.any ?? null;
}
