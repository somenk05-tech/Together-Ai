import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { PostCard } from '../PostCard';
import { usePost } from '../api';

/**
 * ── SOCIAL LIFE · ONE POST (/social/p/:id) ──────────────────────────────────
 *
 * Every card shared into a chat carried `deepLink: '/social/feed'` under a
 * button that read "View Post →". Tapping it opened the recipient's own feed —
 * not that post, quite possibly not containing that post, and in the
 * friends-only case unable to contain it. The link was false on every share
 * ever sent, and the CTA said so out loud.
 *
 * This is where it goes now. The server applies the same gates the feed does,
 * so the three honest outcomes are: the post; "not available" (removed,
 * deleted, or an audience you are not in); or a read that failed, which says
 * so rather than pretending the post is gone.
 */
export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const q = usePost(id);

  /* No width of its own, and no auto margin: the page shell decides where a
     page starts (one-layout-system.test.ts). `page-note` is the house's narrow
     centred column, which is the right measure for a single post. */
  return (
    <div className="page-note">
      <div className="sl-post-bar">
        <button type="button" onClick={() => nav(-1)} className="btn btn-line btn-sm">Back</button>
        <Link to="/social/feed" className="btn btn-ghost btn-sm">Go to feed</Link>
      </div>

      {q.isLoading && <Spinner label="Loading post…" />}

      {/* 404 AND 403 ARE THE SAME SENTENCE, ON PURPOSE. Telling a citizen the
          difference between "this post was removed" and "this post is for
          friends only" tells them the post exists and who can see it — which
          is precisely what an audience setting is for keeping to itself. */}
      {q.isError && (
        <EmptyState
          title="This post isn’t available"
          hint="It may have been deleted, removed, or shared with a smaller group than the one you’re in."
        />
      )}

      {q.data && <PostCard post={q.data} onOpenAuthor={(handle) => nav(`/social/u/${encodeURIComponent(handle)}`)} />}
    </div>
  );
}
