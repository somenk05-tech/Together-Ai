import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Spinner } from '@/components/ui';
import { useMyPosts, useMyProfile, usePublicPosts } from '../myProfile.api';
import { useSetCover, useSetPostCategory } from '../api';
import { PostCard } from '../PostCard';
import { profilePostToPost } from '../reader';

/**
 * ── THE READER · A PAGE, NOT A SHEET (/social/read/:id) ─────────────────────
 *
 * Owner, 8 Sep: "fix the scroll feel that start on the edge, make it a
 * completely new page."
 *
 * WHAT WAS WRONG WITH THE SHEET. It expanded out of the tile and then scrolled
 * itself to the post you had tapped, which meant it opened part-way down a
 * card — the picture already cut off at the top before you had touched
 * anything. On top of that it was a dialog: no address to share or reload, no
 * browser Back, a scroll surface inside a locked page, and a Close button
 * pinned to a corner three screens above wherever you got to.
 *
 * THE FIX IS NOT A SCROLL, IT IS AN ORDER. The post you tapped is the FIRST
 * item on this page and the rest of the wall follows it. There is nothing to
 * scroll to on arrival — which is the only way a page reliably opens at its
 * top — and the page scrolls with the page, so one thumb gesture means one
 * thing again.
 *
 * WHAT SURVIVED THE MOVE. Videos still play one at a time and the end of a
 * clip still travels to the next post that HAS a video (not the next post),
 * because "play my videos" means the videos. The cover-frame and sorting tools
 * still ride under the citizen's own cards. Both were the reason the sheet
 * existed; neither needed a dialog to work.
 */
export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const nav = useNavigate();
  /* Whose wall this is. Absent means the citizen's own — and that is also what
     decides `manage`, because the cover and sorting tools are the author's. */
  const of = params.get('of');
  const mine = !of;

  const me = useMyProfile();
  const myPosts = useMyPosts();
  const theirPosts = usePublicPosts(of);
  const q = mine ? myPosts : theirPosts;

  const items = useMemo(() => q.data?.pages.flatMap((pg) => pg.items) ?? [], [q.data]);
  const at = items.findIndex((p) => p.id === id);

  /* A WALL IS PAGED, AND THE POST MAY BE ON PAGE FOUR. Somebody reloading this
     address, or opening it from a share, has none of the grid's pages loaded.
     Keep asking for the next page until the post turns up or the wall runs
     out — and only then say it is not there, because "not found" said while
     pages are still arriving is a lie with a spinner underneath it. */
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = q;
  useEffect(() => {
    if (at >= 0 || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [at, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* The column: the post you opened, then the wall after it. Everything above
     it stays on the grid you came from — this page is "read on from here",
     which is the promise the first screen makes by opening on that post. */
  const column = at >= 0 ? items.slice(at) : [];

  const scroller = useRef<HTMLDivElement>(null);
  const videoIds = column.filter((p) => p.media.some((m) => m.kind === 'video')).map((p) => p.id);
  const advance = useCallback((fromId: string) => {
    const i = videoIds.indexOf(fromId);
    if (i < 0 || i + 1 >= videoIds.length) return;
    const next = scroller.current?.querySelector<HTMLElement>(`[data-reader-post="${videoIds[i + 1]}"]`);
    next?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [videoIds]);

  const setCover = useSetCover();
  const setCategory = useSetPostCategory();
  /* TWO WRITES ON THIS PAGE SAID "SAVING…" AND THEN SAID NOTHING (30 Aug).
     Sorting a post and pinning a cover frame both showed a pending label and
     stopped. One message serves both — a citizen who just pressed one knows
     which one they pressed. */
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const chip = (postId: string, cur: string, key: '' | 'personal' | 'work', label: string) => (
    <button key={key || 'none'} type="button" disabled={setCategory.isPending}
      className={`sl-sort-chip${cur === key ? ' on' : ''}`}
      onClick={() => {
        setSaveErr(null);
        setCategory.mutate({ postId, category: key === '' ? null : key },
          { onError: () => setSaveErr('That didn’t save — the post is still sorted the way it was. Try again.') });
      }}>
      {label}
    </button>
  );

  /* Read on past the pages the grid had loaded. The observer sits at the foot
     of the column and asks for the next page a screen before it is needed. */
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || at < 0 || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [at, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const loading = q.isLoading || (at < 0 && (hasNextPage || isFetchingNextPage));

  return (
    <div className="page-note">
      <div className="sl-post-bar">
        {/* Back, not Close. This is a page in the citizen's history now, so the
            word and the gesture are the browser's own. */}
        <button type="button" onClick={() => nav(-1)} className="btn btn-line btn-sm">
          <Icon name="back" size={14} /> Back
        </button>
      </div>

      {loading && <Spinner label="Loading posts…" />}

      {q.isError && (
        <div className="blk rise d1 sl-fail">
          <p className="sl-fail-t">Couldn’t load these posts.</p>
          <p className="sl-fail-h">This is a connection problem, not an empty wall.</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => void q.refetch()}>Try again</button>
        </div>
      )}

      {!loading && !q.isError && at < 0 && (
        <EmptyState
          title="This post isn’t here any more"
          hint="It may have been deleted, or it belongs to a wall you can’t see."
        />
      )}

      <div ref={scroller}>
        {column.map((p) => (
          <div key={p.id} data-reader-post={p.id} className="sl-read-item">
            <PostCard
              post={profilePostToPost(p, me.data)}
              autoplayVideo
              onVideoEnded={() => advance(p.id)}
              manage={mine}
              onOpenAuthor={(handle) => nav(`/social/u/${encodeURIComponent(handle)}`)}
              onSetCover={mine ? (t) => {
                setSaveErr(null);
                setCover.mutate({ postId: p.id, time: t }, {
                  /* The server SCREENS this frame and answers with two different
                     sentences: "we couldn’t check it just now" is worth retrying
                     and "it didn’t pass" is not. Our own generic line threw that
                     distinction away and told a citizen to try forever. */
                  onError: (e) => setSaveErr(
                    (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                    || 'That cover wasn’t set — the post still shows the frame it had. Try again.',
                  ),
                });
              } : undefined}
              coverBusy={mine ? setCover.isPending : undefined} />
            {mine && (
              <div className="card sl-sort">
                <div className="sl-sort-h">
                  <Icon name="sort" size={14} /> Sort this post {setCategory.isPending && <span className="muted">· Saving…</span>}
                </div>
                <div className="sl-sort-row">
                  {chip(p.id, p.category ?? '', '', 'None')}
                  {chip(p.id, p.category ?? '', 'personal', 'Personal')}
                  {chip(p.id, p.category ?? '', 'work', 'Work')}
                </div>
                {saveErr && <p role="alert" className="sl-fail-alert">{saveErr}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      {at >= 0 && <div ref={sentinel} className="sl-sentinel" />}
      {isFetchingNextPage && at >= 0 && <div className="sl-more"><Spinner /></div>}
    </div>
  );
}
