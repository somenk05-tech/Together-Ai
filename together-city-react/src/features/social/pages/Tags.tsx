import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { PostCard } from '../PostCard';
import { usePopularTags, useTagFeed } from '../api';
import { normaliseTag, tagPath } from '../captionTags';

/**
 * ── A TAG IS A DOOR (owner, 16 Sep) ─────────────────────────────────────────
 *
 * "Add tags for Together City social life." Two rooms:
 *
 *   /social/tags        search the city's tags, and the ones used most this month
 *   /social/tags/:tag   every post carrying one tag, newest first
 *
 * A tag's page is the For You feed narrowed to that tag, so it shows exactly
 * what the citizen could already see — public posts from anyone, friends' and
 * family posts from their own circle — and nothing more. The popular list is
 * counted over public posts only, so a tag that lives only on private posts
 * never appears to a stranger.
 */
export function TagsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const popular = usePopularTags(q);
  const typed = normaliseTag(q);
  const items = popular.data ?? [];

  return (
    <div className="page-note sl-tags">
      <PageHeader eyebrow="Together TV" title="Tags"
        sub="Tap a #tag on any post to see everything that carries it. Search the city’s tags here." />
      <form className="sl-tags-search" role="search"
        onSubmit={(e) => { e.preventDefault(); if (typed) nav(tagPath(typed)); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tags — e.g. citylife"
          aria-label="Search tags" autoComplete="off" maxLength={51} />
        <button type="submit" className="btn btn-accent btn-sm" disabled={!typed}>Open</button>
      </form>

      <h2 className="sl-tags-h">{q.trim() ? 'Matching tags' : 'Most used this month'}</h2>
      {popular.isLoading && <Spinner label="Loading tags…" />}
      {popular.isError && <EmptyState title="Couldn’t load tags" hint="Try again in a moment." />}
      {!popular.isLoading && !popular.isError && items.length === 0 && (
        <EmptyState title={q.trim() ? 'No tag starts with that yet' : 'No tags this month yet'}
          hint={typed ? `Open #${typed} anyway, or add it to your next post.` : 'Add a #tag to your next post and it starts here.'} />
      )}
      {items.length > 0 && (
        <ul className="sl-tags-list">
          {items.map((t) => (
            <li key={t.tag}>
              <Link to={tagPath(t.tag)} className="sl-tags-row">
                <span className="sl-tag">#{t.tag}</span>
                <span className="muted">{t.posts} {t.posts === 1 ? 'post' : 'posts'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TagPage() {
  const nav = useNavigate();
  const { tag: raw } = useParams<{ tag: string }>();
  const tag = normaliseTag(raw ?? '');
  const feed = useTagFeed(tag);
  const openAuthor = useCallback((h: string) => nav(`/social/u/${encodeURIComponent(h)}`), [nav]);
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  if (!tag) {
    return (
      <div className="page-note">
        <EmptyState title="That isn’t a tag" hint="A tag is letters, numbers or _ after a #." />
        <Link to="/social/tags" className="btn btn-line btn-sm">All tags</Link>
      </div>
    );
  }

  return (
    <div className="page-note sl-tags">
      <div className="sl-post-bar">
        <button type="button" onClick={() => nav(-1)} className="btn btn-line btn-sm">Back</button>
        <Link to="/social/tags" className="btn btn-ghost btn-sm">All tags</Link>
      </div>
      <PageHeader eyebrow="Together TV · Tag" title={`#${tag}`}
        sub="Every post carrying this tag that you can see, newest first." />

      {feed.isLoading && <Spinner label="Loading posts…" />}
      {feed.isError && <EmptyState title="Couldn’t load this tag" hint="Try again in a moment." />}
      {!feed.isLoading && !feed.isError && posts.length === 0 && (
        <EmptyState title="No posts with this tag yet" hint={`Add #${tag} to a post and it will be the first.`} />
      )}
      <div className="sl-tags-posts">
        {posts.map((p) => (
          <PostCard key={p.key ?? p.id} post={p} onOpenAuthor={openAuthor} />
        ))}
      </div>
      {feed.hasNextPage && (
        <button type="button" className="btn btn-line btn-sm" disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}>
          {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
