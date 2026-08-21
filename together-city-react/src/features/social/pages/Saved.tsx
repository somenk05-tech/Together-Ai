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

function readSaved(): Post[] {
  try {
    const ids = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[];
    const snaps = JSON.parse(localStorage.getItem(SAVED_KEY + '-data') ?? '{}') as Record<string, Post>;
    // Newest saves first (ids are appended in save order).
    return ids.map((id) => snaps[id]).filter(Boolean).reverse();
  } catch {
    return [];
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
  const [posts, setPosts] = useState<Post[]>(() => readSaved());

  const remove = (id: string) => {
    removeSaved(id);
    setPosts((cur) => cur.filter((p) => p.id !== id));
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

      {posts.length === 0 ? (
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
