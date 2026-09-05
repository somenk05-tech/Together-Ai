import { useQueryClient } from '@tanstack/react-query';
import { onStaleMedia } from '@/lib/remint';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { LEGACY_SAVED_ROOT } from '../PostCard';
import { socialApi, useBookmarks, useToggleBookmark, type Post } from '../api';

/**
 * Social Life · Saved — bookmarks on the ACCOUNT (4 Sep audit).
 *
 * This page rendered a localStorage snapshot of each post: the copy carried a
 * signed media URL that expires in an hour, so every saved photograph was
 * broken by the time anybody came back for it; a deleted or removed post
 * rendered forever; and the list lived on the one device it was made on. Its
 * "Open feed" button went to the feed rather than to the post — while the
 * permalink existed.
 *
 * Now: the server keeps a row per save, re-reads each post through the feed's
 * own gates when this page asks, and signs the media fresh. The card opens
 * the post it names.
 */

/**
 * ── ONE READ OF THE OLD STORE, THEN IT IS GONE ─────────────────────────────
 *
 * A citizen who saved thirty posts on this phone should not lose them to an
 * upgrade. The ids the old page kept are sent to the account once, the server
 * keeps whichever still resolve, and the keys are cleared so it never runs
 * twice. Failure leaves the keys in place for the next visit; the page does
 * not wait on it.
 */
function useCarryDeviceSavesOver(userId: string | undefined, onDone: () => void) {
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || ran.current === userId) return;
    ran.current = userId;
    let ids: string[] = [];
    const keys = [`${LEGACY_SAVED_ROOT}:${userId}`, LEGACY_SAVED_ROOT];
    try {
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (raw) ids = ids.concat(JSON.parse(raw) as string[]);
      }
    } catch { return; }
    if (!ids.length) return;
    void socialApi.syncBookmarks([...new Set(ids)].slice(0, 200)).then(() => {
      try {
        for (const k of keys) { localStorage.removeItem(k); localStorage.removeItem(`${k}-data`); }
      } catch { /* the next visit tries again */ }
      onDone();
    }).catch(() => { /* kept on the device for next time */ });
  }, [userId, onDone]);
}

function SavedCard({ post }: { post: Post }) {
  const bookmark = useToggleBookmark();
  const [err, setErr] = useState<string | null>(null);
  const firstImage = post.media?.find((m) => m.kind === 'image');
  const video = post.media?.find((m) => m.kind === 'video');
  const thumb = firstImage?.url ?? video?.thumbUrl ?? null;
  const qc = useQueryClient();
  return (
    <article className="card" style={{ display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'flex-start' }}>
      {thumb && (
        <img src={thumb} alt={`Photo shared by ${post.author.name}`} width={72} height={72} loading="lazy" decoding="async"
          onError={() => onStaleMedia(qc, ['social'])}
          style={{ borderRadius: 'var(--r-1)', objectFit: 'cover', flexShrink: 0 }} />
      )}
      <div className="flex-min">
        <div style={{ fontSize: 13.5 }}>
          {post.author.name}
          <span className="muted" style={{ fontSize: 12 }}> @{post.author.handle}</span>
        </div>
        {post.placeName && (
          <div className="sl-post-meta"><Icon name="place" size={13} />{post.placeName}</div>
        )}
        {post.text && (
          <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.text}</p>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* The post, not the feed — the permalink runs the same gates. */}
          <Link to={`/social/p/${post.id}`} className="btn btn-line btn-sm">Open post</Link>
          <button type="button" disabled={bookmark.isPending}
            onClick={() => { setErr(null); bookmark.mutate(post.id, { onError: () => setErr('Still saved — that didn’t go through. Try again.') }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--muted)', padding: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="save" size={14} /> {bookmark.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
        {err && <p role="alert" className="sl-fail-alert">{err}</p>}
      </div>
    </article>
  );
}

export function SocialSaved() {
  const { user } = useAuth();
  const list = useBookmarks();
  const [carried, setCarried] = useState(false);
  const markCarried = useCallback(() => setCarried(true), []);
  useCarryDeviceSavesOver(user?.id, markCarried);
  useEffect(() => { if (carried) void list.refetch(); }, [carried]); // eslint-disable-line react-hooks/exhaustive-deps
  const posts = list.data?.pages.flatMap((pg) => pg.items) ?? [];

  return (
    <div>
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Together City TV · Saved</div>
          <h1>Kept for later</h1>
          <p>Posts you bookmarked from the feed — on your account, on every device.</p>
        </div>
      </div>

      {list.isLoading && <Spinner label="Loading your saved posts…" />}
      {list.isError && (
        <EmptyState title="Couldn’t load your saved posts"
          hint="They are still there — this is a connection problem."
          action={<button type="button" className="btn btn-line btn-sm" onClick={() => void list.refetch()}>Try again</button>} />
      )}
      {!list.isLoading && !list.isError && posts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <span className="sl-ic lg" style={{ margin: '0 auto 16px' }}><Icon name="save" size={30} /></span>
          <div className="sl-saved-t">Nothing saved yet</div>
          <p className="muted" style={{ fontSize: 14, margin: '7px 0 0' }}>
            Tap Save on any post in the feed and it will collect here.
          </p>
          <Link to="/social/feed" className="btn btn-accent" style={{ marginTop: 20 }}>
            Go to the feed<Icon name="next" size={16} />
          </Link>
        </div>
      )}
      {posts.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {posts.map((p) => <SavedCard key={p.id} post={p} />)}
          {list.hasNextPage && (
            <button type="button" className="btn btn-line btn-sm sl-more" disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}>
              {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
