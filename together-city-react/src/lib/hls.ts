/**
 * ── ATTACHING A VIDEO, WHEN THERE MAY BE A LADDER BEHIND IT ─────────────────
 *
 * A post's video has two addresses now: `url`, one progressive H.264 MP4 that
 * every browser plays, and `hlsUrl`, an adaptive ladder at 240/360/480/720
 * (media/hls-ladder.ts on the server). The MP4 is the fallback and always
 * exists; the ladder is null on everything posted before 6 September and on
 * anything the encoder could not build one for.
 *
 * The ladder is why City TV works on a train. With one progressive file the
 * player cannot step down when the connection cannot hold the bitrate — the
 * owner allows a 2 GB, 60-minute upload, which averages 4.4 Mbit/s against the
 * 1–3 a mid-range Android sustains on Indian 4G at peak — so it stalls, and
 * `TUNE_MS` then advances to the next video, which also stalls. The failure was
 * not slow playback; it was skipping through the whole catalogue showing
 * "Tuning in…".
 *
 * ── THREE PATHS, AND THE ORDER MATTERS ──────────────────────────────────────
 *
 * 1 · NATIVE. Safari and every iOS browser play HLS from a plain `src`, and
 *     they do it better than a library can: hardware decoding, the OS's own
 *     buffering, AirPlay and Picture-in-Picture intact. Asked first, always.
 * 2 · hls.js, LOADED ONLY HERE AND ONLY THEN. It is ~110 KB gzipped, which has
 *     no business in the entry chunk of a city whose landing page has no video
 *     on it — so it is a dynamic import, reached the first time somebody
 *     actually watches something, and cached by the browser after that.
 * 3 · THE MP4. No ladder, no native HLS, no MSE — or hls.js hitting a fatal
 *     error mid-stream — and the element gets `url`, which is what it had
 *     before any of this existed. Every failure path in this file ends here,
 *     because "the video did not play" is the one outcome the ladder was
 *     supposed to remove.
 *
 * ── WHY IMPERATIVE ──────────────────────────────────────────────────────────
 *
 * `<video src={…}>` cannot express "hand this element to a library", and the
 * library owns a MediaSource that has to be torn down when the element goes or
 * the source changes — a leaked Hls instance keeps fetching segments for a
 * video nobody is watching. So this returns a detach function and the caller
 * runs it from an effect's cleanup, which is exactly the lifetime it needs.
 */

export interface VideoSource {
  /** The progressive MP4. Always present; the fallback for every failure here. */
  url: string;
  /** The HLS master playlist, when the encoder built a ladder. */
  hlsUrl?: string | null;
}

/** Does this browser play HLS from a plain `src`? Safari and every iOS browser do. */
export function playsHlsNatively(el: HTMLVideoElement): boolean {
  return el.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Point a `<video>` at the best source it can play. Returns the teardown.
 *
 * Safe to call again for a new source as long as the previous teardown has run
 * — which is what a `useEffect` keyed on the video's id already guarantees.
 */
export function attachVideo(el: HTMLVideoElement, src: VideoSource): () => void {
  if (!src.hlsUrl) {
    el.src = src.url;
    return () => { el.removeAttribute('src'); el.load(); };
  }

  if (playsHlsNatively(el)) {
    el.src = src.hlsUrl;
    return () => { el.removeAttribute('src'); el.load(); };
  }

  /* CANCELLED, NOT ORPHANED. The import is a network round trip on a slow
     connection, and the citizen may well have changed channel before it lands.
     `live` is read after the await; without it a torn-down element gets an Hls
     instance attached to it that nothing will ever destroy. */
  let live = true;
  let hls: { destroy: () => void } | null = null;

  void (async () => {
    try {
      const { default: Hls } = await import('hls.js');
      if (!live) return;
      if (!Hls.isSupported()) { el.src = src.url; return; }
      const instance = new Hls({
        // The ladder is VOD and short-lived in the player's memory: a phone
        // holding sixty seconds of 720p is holding several megabytes it may
        // never watch, and the whole point of this file is the phone.
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        // The first rung is chosen by measurement rather than by starting at
        // the top and stepping down, which is what makes the first ten seconds
        // watchable on a bad connection instead of a stall.
        startLevel: -1,
      });
      hls = instance;
      instance.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => {
        if (!data?.fatal) return;
        /* A FATAL ERROR ENDS THE LADDER, NOT THE VIDEO. hls.js can sometimes
           recover a fatal media error, and the recovery is worth one attempt
           for a citizen who is mid-watch — but a second one is a loop, so the
           second lands on the MP4 the element could always have played. */
        instance.destroy();
        hls = null;
        if (live) el.src = src.url;
      });
      instance.loadSource(src.hlsUrl as string);
      instance.attachMedia(el);
    } catch {
      // The chunk did not load — an offline moment, a cache miss on a dead
      // connection. The MP4 needs no chunk.
      if (live) el.src = src.url;
    }
  })();

  return () => {
    live = false;
    hls?.destroy();
    hls = null;
    el.removeAttribute('src');
    el.load();
  };
}
