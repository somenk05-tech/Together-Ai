import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
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

interface State { failed: boolean; chunk: boolean; detail: string | null }

/**
 * Wraps lazy routes. On a stale-chunk error it force-reloads ONCE (fetching the
 * fresh index.html + current chunks) — guarded by sessionStorage so it can never
 * loop. Any other render error shows a friendly retry card instead of a blank page.
 */
export class ChunkBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false, chunk: false, detail: null };

  static getDerivedStateFromError(error: unknown): State {
    // WHICH kind of failure, decided here rather than assumed in the copy.
    //
    // This returned `{ failed: true }` and the card then said, for ANY error,
    // "This page didn't load fully — usually because a new version just went
    // live. A quick reload fixes it." For a genuine render error that sentence
    // is false in both halves: no new version went live, and reloading fixes
    // nothing. Dating Chats threw `useCallCenter must be used inside
    // <CallCenter>` on every render, and this card sent people to press reload
    // at it, forever, while the real message sat in a console nobody was
    // looking at.
    return {
      failed: true,
      chunk: isChunkLoadError(error),
      detail: error instanceof Error ? error.message : null,
    };
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
    if (this.state.failed) return <FailureCard chunk={this.state.chunk} detail={this.state.detail} />;
    return <Suspense fallback={<Spinner />}>{this.props.children}</Suspense>;
  }
}

/** The one card every failure wears — the boundary below and the router's
 *  own error element both draw it, so a throw in a lazy page and a throw in
 *  the chrome above it look like the same application. */
function FailureCard({ chunk, detail }: { chunk: boolean; detail: string | null }) {
  return (
    <div style={{ maxWidth: 460, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 34 }}>{chunk ? '🔄' : '⚠️'}</div>
      <h2 style={{ margin: '10px 0 6px' }}>
        {chunk ? 'Let’s reload that' : 'This page hit an error'}
      </h2>
      {chunk ? (
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
          This page didn’t load fully — usually because a new version just went live. A quick reload fixes it.
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Something on this page failed while it was drawing. Reloading will almost
            certainly do the same thing — this is ours to fix, not yours to retry.
          </p>
          {/* The message, on the screen, not only in a console.
              Dating Chats threw the same error on every render for a day
              while this card said a new version had just gone live. */}
          {detail && (
            <p style={{ fontSize: 12, lineHeight: 1.5, margin: '10px 0 0', fontFamily: 'ui-monospace, monospace', color: 'var(--muted)', wordBreak: 'break-word' }}>
              {detail}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => { sessionStorage.removeItem(RELOAD_FLAG); window.location.reload(); }}
        style={{ marginTop: 14, cursor: 'pointer', border: 'none', borderRadius: 12, padding: '11px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Reload
      </button>
    </div>
  );
}

/**
 * THE ROOT HAS A CARD TOO (launch gate, third reading, 4 Sep, blocker 3).
 * `ChunkBoundary` wraps the lazy leaves only. A throw in RootChrome, the
 * header, Mira's dock or an eager landing fell through to react-router's own
 * "Unexpected Application Error!" — a stack trace on a white page, no header,
 * no way home. This is the `errorElement` on the root route and on every
 * route block: the block's card keeps the chrome above it standing, the
 * root's card is the last floor. A stale chunk that reaches here reloads
 * once, on the same flag the boundary uses, so the two can never loop each
 * other.
 */
export function RouteError() {
  const err = useRouteError();
  const chunk = isChunkLoadError(err);
  useEffect(() => {
    if (chunk && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }, [chunk]);
  const detail = isRouteErrorResponse(err)
    ? `${err.status} ${err.statusText}`.trim()
    : err instanceof Error ? err.message : null;
  return <FailureCard chunk={chunk} detail={detail} />;
}

/** Clear the one-shot reload guard once the app has mounted successfully, so a
 *  genuine future deploy can reload again. */
export function clearChunkReloadFlag(): void {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
}
