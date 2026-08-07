import { useEffect, useRef, useState } from 'react';

/**
 * THE MOVING SKY.
 *
 * The Astrology Zone's ground is a photograph. This is the same ground with a
 * slow rotation in it — a <video> rather than a background-image, because CSS
 * cannot play one. It sits in the fixed layer the still occupies, underneath
 * every pane and every piece of chrome, so nothing above it changes.
 *
 * ── IT RENDERS NOTHING FOR ANYBODY WHO ASKED FOR LESS MOTION ──
 *
 * Not paused, not hidden with CSS — NOT MOUNTED. A looping full-viewport
 * animation is the exact thing `prefers-reduced-motion` exists to prevent, and
 * a <video autoplay> that is merely display:none has still been fetched,
 * decoded and is still spending battery. The hub falls back to the still sky
 * the stylesheet already paints, which is why there is no poster here: the
 * fallback is a real screen, not a frame of this file.
 *
 * The check is live rather than read once, because somebody can turn the
 * setting on while the page is open and the honest response is to stop.
 *
 * ── AND IT STOPS WHEN NOBODY IS LOOKING ──
 *
 * A background video in a tab behind three other tabs is a laptop fan and a
 * phone battery for no viewer at all. Browsers throttle timers in hidden tabs;
 * they do not reliably stop video decode. So this does.
 */
export function SkyFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(true);

  useEffect(() => {
    const q = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!q) { setStill(false); return; }
    const read = () => setStill(q.matches);
    read();
    q.addEventListener?.('change', read);
    return () => q.removeEventListener?.('change', read);
  }, []);

  useEffect(() => {
    if (still) return;
    const onVisibility = () => {
      const el = video.current;
      if (!el) return;
      if (document.hidden) el.pause();
      // play() rejects when the tab is restored before the element is ready,
      // and an unhandled rejection here would surface as a console error on a
      // screen where nothing is wrong.
      else void el.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [still]);

  if (still) return null;

  return (
    <div className="sky-film" aria-hidden>
      <video ref={video} autoPlay muted loop playsInline preload="metadata">
        {/* WebM first: 369KB against the MP4's 827KB, and everything that can
            play it prefers it. The MP4 is here for Safari. */}
        <source src="/assets/video/astro-sky.webm" type="video/webm" />
        <source src="/assets/video/astro-sky.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
