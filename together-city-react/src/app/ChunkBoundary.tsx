import { Component, Suspense, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';

/** True when an error is a failed dynamic import / stale code-split chunk —
 *  the classic "page won't load after a new deploy" symptom: the browser is
 *  holding an old index.html whose chunk hashes no longer exist on the server. */
function isChunkLoadError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch dynamically') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes("expected a javascript") ||          // HTML served for a missing .js
    msg.includes('mime type')
  );
}

const RELOAD_FLAG = 'tc:chunk-reloaded';

interface State { failed: boolean }

/**
 * Wraps lazy routes. On a stale-chunk error it force-reloads ONCE (fetching the
 * fresh index.html + current chunks) — guarded by sessionStorage so it can never
 * loop. Any other render error shows a friendly retry card instead of a blank page.
 */
export class ChunkBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    if (isChunkLoadError(error)) {
      // A new version shipped mid-session — reload once to pick it up.
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
      }
    }
  }

  override render() {
    if (this.state.failed) {
      return (
        <div style={{ maxWidth: 460, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔄</div>
          <h2 style={{ margin: '10px 0 6px' }}>Let’s reload that</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            This page didn’t load fully — usually because a new version just went live. A quick reload fixes it.
          </p>
          <button
            type="button"
            onClick={() => { sessionStorage.removeItem(RELOAD_FLAG); window.location.reload(); }}
            style={{ marginTop: 14, cursor: 'pointer', border: 'none', borderRadius: 12, padding: '11px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return <Suspense fallback={<Spinner />}>{this.props.children}</Suspense>;
  }
}

/** Clear the one-shot reload guard once the app has mounted successfully, so a
 *  genuine future deploy can reload again. */
export function clearChunkReloadFlag(): void {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
}
