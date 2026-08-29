import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Link } from 'react-router-dom';

import type { Post } from '../api';

/** Social Life · Saved — bookmarked posts kept on this device.
 *  Reads the same localStorage the feed's 🔖 Save button writes to
 *  (`tc-saved-posts` = ids, `tc-saved-posts-data` = full post snapshots).
 *  Previously this page always rendered an empty state, so saved posts never
 *  appeared anywhere. */
const SAVED_KEY = 'tc-saved-posts';

/**
 * "NOTHING SAVED YET" IS A CLAIM, AND IT NEEDS THE READ TO HAVE WORKED.
 *
 * This returned `[]` on an unreadable store and silently dropped every id whose
 * snapshot was missing — which is exactly what a full store leaves behind. Both
 * cases rendered as "Nothing saved yet", so the one state the citizen most
 * needed to know about was the one the page denied. It now reports what it
 * found and what it could not.
 */
function readSaved(): { posts: Post[]; unreadable: boolean; missing: number } {
  try {
    const ids = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[];
    const snaps = JSON.parse(localStorage.getItem(SAVED_KEY + '-data') ?? '{}') as Record<string, Post>;
    // Newest saves first (ids are appended in save order).
    const posts = ids.map((id) => snaps[id]).filter(Boolean).reverse();
    return { posts, unreadable: false, missing: ids.length - posts.length };
  } catch {
    return { posts: [], unreadable: true, missing: 0 };
  }
}

function removeSaved(id: string) {
  try {
    const ids = (JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[]).filter((x) => x !== id);
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
    const snaps = JSON.parse(localStorage.getItem(SAVED_KEY + '-data') ?? '{}') as Record<string, unknown>;
    delete snaps[id];
    localStorage.setItem(SAVED_KEY + '-data', JSON.stringify(snaps));
  } catch { /* ignore */ }
}

function SavedCard({ post, onRemove }: { post: Post; onRemove: () => void }) {
  const firstImage = post.media?.find((m) => m.kind === 'image');
  return (
    <article className="card" style={{ display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'flex-start' }}>
      {firstImage && (
        <img src={firstImage.url} alt={`Photo shared by ${post.author.name}`} width={72} height={72}
          style={{ borderRadius: 'var(--r-1)', objectFit: 'cover', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
          {post.author.name}
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> @{post.author.handle}</span>
        </div>
        {post.placeName && (
          <div className="sl-post-meta"><Icon name="place" size={13} />{post.placeName}</div>
        )}
        {post.text && (
          <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.text}</p>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
          <Link to="/social/feed" className="btn btn-line btn-sm">Open feed</Link>
          <button type="button" onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--muted)', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="save" size={14} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

export function SocialSaved() {
  const [store, setStore] = useState(() => readSaved());
  const { posts, unreadable, missing } = store;

  const remove = (id: string) => {
    removeSaved(id);
    setStore((cur) => ({ ...cur, posts: cur.posts.filter((p) => p.id !== id) }));
  };

  return (
    <div>
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Social Life · Saved</div>
          <h1>Kept for later</h1>
          <p>Posts you bookmarked from the feed, kept on this device.</p>
        </div>
      </div>

      {/* A store that would not read is not an empty store, and the citizen
          can act on the difference: one is "save something", the other is
          "this device is out of room". */}
      {missing > 0 && (
        <div className="card sl-note">
          <div className="sl-note-t">
            {missing} saved {missing === 1 ? 'post' : 'posts'} couldn’t be kept on this device
          </div>
          <p className="sl-note-p">
            The bookmark was recorded but the post itself did not fit in this browser’s storage. Removing a few saves here makes room.
          </p>
        </div>
      )}

      {unreadable ? (
        <div className="card sl-fail">
          <span className="sl-ic lg sl-fail-ic"><Icon name="save" size={30} /></span>
          <div className="sl-saved-t">Couldn’t read your saved posts</div>
          <p className="sl-note-p">
            This browser’s storage is unavailable or unreadable — your bookmarks are not lost, this page just cannot open them here.
          </p>
        </div>
      ) : posts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <span className="sl-ic lg" style={{ margin: '0 auto 16px' }}><Icon name="save" size={30} /></span>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.025em' }}>Nothing saved yet</div>
          <p className="muted" style={{ fontSize: 14, margin: '7px 0 0' }}>
            Tap Save on any post in the feed and it will collect here.
          </p>
          <Link to="/social/feed" className="btn btn-accent" style={{ marginTop: 20 }}>
            Go to the feed<Icon name="next" size={16} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {posts.map((p) => <SavedCard key={p.id} post={p} onRemove={() => remove(p.id)} />)}
        </div>
      )}
    </div>
  );
}
