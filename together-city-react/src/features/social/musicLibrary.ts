/**
 * Built-in royalty-free track library for video posts.
 *
 * Each entry points at an audio file served from the app's `public/music/`
 * folder (so `url` is a root-relative path like `/music/uplift.mp3`). To add a
 * track: drop a royalty-free MP3 into `together-city-react/public/music/` and
 * add a row here. Nothing else is required — the CreatePost music picker and
 * the Reels player read straight from this list.
 *
 * IMPORTANT: only add tracks you have the rights to use (e.g. CC0 / Pixabay
 * Music / your own licensed audio). The paths below are placeholders; the
 * picker hides any track whose file 404s, so unshipped rows simply won't show.
 */
export interface Track {
  id: string;
  title: string;
  artist?: string;
  /** Root-relative path under public/, e.g. /music/uplift.mp3 */
  url: string;
  /** Rough mood tag for grouping in the picker. */
  mood?: string;
}

export const MUSIC_LIBRARY: Track[] = [
  { id: 'uplift',   title: 'Uplift',            artist: 'Together City', url: '/music/uplift.mp3',   mood: 'Upbeat' },
  { id: 'sunrise',  title: 'Sunrise Drive',     artist: 'Together City', url: '/music/sunrise.mp3',  mood: 'Chill' },
  { id: 'citylife', title: 'City Life',         artist: 'Together City', url: '/music/citylife.mp3', mood: 'Lo-fi' },
  { id: 'dreamy',   title: 'Dreamy Nights',     artist: 'Together City', url: '/music/dreamy.mp3',   mood: 'Ambient' },
  { id: 'energy',   title: 'Energy Boost',      artist: 'Together City', url: '/music/energy.mp3',   mood: 'Workout' },
  { id: 'acoustic', title: 'Acoustic Morning',  artist: 'Together City', url: '/music/acoustic.mp3', mood: 'Acoustic' },
];

export function trackByUrl(url?: string | null): Track | undefined {
  if (!url) return undefined;
  return MUSIC_LIBRARY.find((t) => t.url === url);
}
