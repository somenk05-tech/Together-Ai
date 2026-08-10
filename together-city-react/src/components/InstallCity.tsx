import { useEffect, useRef, useState } from 'react';

/**
 * TAKE THE CITY WITH YOU — the install block under "Enter your city".
 *
 * One block, three answers, because the honest instruction differs by device
 * and a menu of all three is a quiz nobody asked to sit:
 *
 *   ANDROID   the APK, from our own server. Not Play — the app is not listed
 *             there, and a button that says "Download" and opens a store page
 *             is a lie the moment it loads. It streams so the citizen sees
 *             bytes arriving, and the two things Android will ask them
 *             afterwards are said BEFORE they meet them.
 *   iOS       Add to Home Screen. There is no APK on iOS and no Play button;
 *             Apple's installer is the Share sheet, so the sheet is what we
 *             show — the three taps, in order, drawn rather than described.
 *   DESKTOP   a QR. A "download" button on a laptop hands a phone app to a
 *             machine that cannot run it; the code puts it on the device that
 *             can. The image is a static file, not a generated one: the URL
 *             never changes, so neither does the picture.
 *
 * A citizen who has already installed sees none of it — `display-mode:
 * standalone` means they are reading this INSIDE the app.
 */

type Device = 'android' | 'ios' | 'desktop' | 'installed';

function detect(): Device {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  /* ALREADY INSIDE THE CITY — three different ways, because there are three
     different apps and each says so differently.
       · an installed PWA reports display-mode: standalone;
       · iOS's older Safari reports navigator.standalone;
       · the Android APK reports NEITHER. It is a WebView pointed at this
         site, which is an ordinary browser as far as CSS is concerned — so
         without this check the app would offer to download itself. The
         wrapper appends TogetherCityApp/<version> to its user agent for
         exactly this kind of question. */
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    || /TogetherCityApp\//.test(ua);
  if (standalone) return 'installed';
  if (/Android/i.test(ua)) return 'android';
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

const APK_URL = '/downloads/TogetherCity.apk';

export function InstallCity() {
  const [device, setDevice] = useState<Device>('desktop');
  const [sheet, setSheet] = useState(false);
  const [pct, setPct] = useState<number | null>(null);   // null = idle
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Chrome's own install prompt, when the browser offers one. */
  const prompt = useRef<{ prompt: () => void } | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => { setDevice(detect()); }, []);

  /* AND THE HARDEST CASE: the app is installed, but they are reading this in
     Chrome. Only the browser can answer that — getInstalledRelatedApps() does,
     for a site whose manifest names the package and whose server vouches for
     it in /.well-known/assetlinks.json. Where the browser cannot answer (every
     other browser, and Chrome before the asset link is live) it returns
     nothing and the block simply stays: a missing answer is not a yes. */
  useEffect(() => {
    const nav = navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (!nav.getInstalledRelatedApps) return;
    let live = true;
    nav.getInstalledRelatedApps()
      .then((apps) => { if (live && apps.length > 0) setDevice('installed'); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  /* A citizen who took the APK on this device gets a quieter block next time
     rather than the same key again. This REMEMBERS A DOWNLOAD, which is not
     the same as an install and is never described as one. */
  const [tookIt, setTookIt] = useState(false);
  useEffect(() => {
    try { setTookIt(localStorage.getItem('tc:apk-taken') === '1'); } catch { /* storage off */ }
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      prompt.current = e as unknown as { prompt: () => void };
      setCanPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (device === 'installed') return null;

  /** Stream the APK so the citizen watches it arrive, then hand it to the
   *  browser's downloader. A server that omits content-length gives no total,
   *  and the bar says "working" rather than inventing a percentage. */
  const download = async () => {
    setFailed(false); setDone(false); setPct(0);
    try {
      const res = await fetch(APK_URL);
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const total = Number(res.headers.get('content-length') || 0);
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let got = 0;
      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        if (value) { chunks.push(value); got += value.length; if (total) setPct(Math.round((got / total) * 100)); }
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: 'application/vnd.android.package-archive' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'TogetherCity.apk';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPct(100); setDone(true);
      try { localStorage.setItem('tc:apk-taken', '1'); } catch { /* storage off */ }
    } catch {
      // The browser can still fetch it the ordinary way; say so rather than
      // leaving a dead button.
      setFailed(true); setPct(null);
    }
  };

  return (
    <section className="instl" aria-label="Take Together City with you">
      <p className="instl-eyebrow">Take the city with you</p>

      {device === 'android' && (
        <>
          <button type="button" className={`instl-cta${tookIt && pct === null ? ' is-quiet' : ''}`}
            onClick={() => { void download(); }} disabled={pct !== null && !done && !failed}>
            {pct === null || failed ? (tookIt ? 'Download again' : 'Download App for Android')
              : done ? 'Downloaded — open it to install'
              : `Downloading Together City… ${pct}%`}
          </button>
          {pct !== null && !done && !failed && (
            <div className="instl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
          {done && (
            <p className="instl-note">
              Open <b>TogetherCity.apk</b> from your notifications or Downloads. Android will ask
              once whether to allow installs from your browser — say yes, then tap <b>Install</b>.
            </p>
          )}
          {failed && (
            <p className="instl-note">
              The download didn’t start. <a href={APK_URL} download>Tap here to get the file directly</a>.
            </p>
          )}
          {!done && !failed && pct === null && (
            <p className="instl-note">
              {tookIt
                ? 'You downloaded this before — take it again only if you need the latest version.'
                : 'Installs straight from us — no store account, no waiting.'}
            </p>
          )}
        </>
      )}

      {device === 'ios' && (
        <>
          <button type="button" className="instl-cta"
            onClick={() => (canPrompt && prompt.current ? prompt.current.prompt() : setSheet(true))}>
            Add to Home Screen
          </button>
          <p className="instl-note">Together City becomes an app on your phone — full screen, its own icon.</p>
          {sheet && (
            <div className="instl-sheet" role="dialog" aria-modal="true" aria-label="Add to Home Screen">
              <button type="button" className="instl-scrim" aria-label="Close" onClick={() => setSheet(false)} />
              <div className="instl-card">
                <span className="instl-grab" aria-hidden />
                <h3>Add Together City to your Home Screen</h3>
                <ol>
                  <li>
                    <span className="instl-step" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
                      </svg>
                    </span>
                    <span>Tap <b>Share</b> at the bottom of Safari</span>
                  </li>
                  <li>
                    <span className="instl-step" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" />
                      </svg>
                    </span>
                    <span>Choose <b>Add to Home Screen</b></span>
                  </li>
                  <li>
                    <span className="instl-step" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                    <span>Tap <b>Add</b> — that’s it</span>
                  </li>
                </ol>
                <button type="button" className="instl-done" onClick={() => setSheet(false)}>Got it</button>
              </div>
            </div>
          )}
        </>
      )}

      {device === 'desktop' && (
        <div className="instl-qr">
          <img src="/assets/img/install-qr.svg" alt="QR code linking to togethercity.app/install" width={132} height={132} />
          <div>
            <p className="instl-qrtitle">Point your phone at this</p>
            <p className="instl-note">
              The city is built for a phone. Scan to install it there — Android gets the app,
              iPhone adds it to the Home Screen.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
