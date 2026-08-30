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
 * Music / your own licensed audio). The picker hides any track whose file
 * 404s, so a row added before its MP3 lands simply won't show.
 *
 * (The line that used to sit here said "the paths below are placeholders". It
 * had been untrue since the five tracks shipped — 4 to 10 MB of real audio
 * each — and a stale comment about what is real is the kind that gets acted
 * on.)
 */
export interface Track {
  id: string;
  title: string;
  artist?: string;
  /** Root-relative path under public/, e.g. /music/uplift.mp3 */
  url: string;
  /** Rough mood tag for grouping in the picker. */
  mood?: string;
  /** What the row claims about its own rights, shown under the title. Whoever
   *  adds a track sets this; nothing in the app can check it. The one thing
   *  the app DOES enforce is that no other audio can be attached at all —
   *  users cannot upload their own, and the API only accepts /music/ paths. */
  license?: string;
}

const CLEARED = 'Royalty-free';
export const MUSIC_LIBRARY: Track[] = [
  { id: 'concrete-horizon',   title: 'Concrete Horizon',   url: '/music/concrete-horizon.mp3',   mood: 'Cinematic', license: CLEARED },
  { id: 'crosswalk-pulse',    title: 'Crosswalk Pulse',    url: '/music/crosswalk-pulse.mp3',    mood: 'Upbeat',    license: CLEARED },
  { id: 'moonlit-adagio',     title: 'Moonlit Adagio',     url: '/music/moonlit-adagio.mp3',     mood: 'Chill',     license: CLEARED },
  { id: 'rush-hour-canopy',   title: 'Rush Hour Canopy',   url: '/music/rush-hour-canopy.mp3',   mood: 'Energetic', license: CLEARED },
  { id: 'sunlit-string-waltz', title: 'Sunlit String Waltz', url: '/music/sunlit-string-waltz.mp3', mood: 'Acoustic', license: CLEARED },
];

