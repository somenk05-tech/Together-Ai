import { useState, type FormEvent } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import {
  useAddComment, useComments, useCreatePost, useFeed, useToggleLike, type Post,
} from '../api';

const FEELINGS = ['grateful', 'excited', 'peaceful', 'inspired', 'nostalgic'];

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="tc-avatar"
      style={{
        width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 14, flexShrink: 0,
      }}
    >
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

/** Composer — "Share a moment" card at the top of the feed. */
function Composer() {
  const [text, setText] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  const create = useCreatePost();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    create.mutate(
      { text: text.trim(), feeling: feeling ?? undefined },
      { onSuccess: () => { setText(''); setFeeling(null); } },
    );
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 18 }}>
      <div className="eyebrow">Share a moment</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening in your city?"
        rows={3}
        style={{
          width: '100%', border: '1.5px solid var(--line)', borderRadius: 12, padding: '12px 14px',
          fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {FEELINGS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFeeling(feeling === f ? null : f)}
            className="pill"
            style={{
              cursor: 'pointer', border: '1px solid var(--line)', fontSize: 12, padding: '5px 12px', borderRadius: 999,
              background: feeling === f ? 'var(--accent)' : 'transparent',
              color: feeling === f ? '#fff' : 'var(--ink-soft)',
            }}
          >
            {f}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <Button type="submit" variant="accent" size="sm" disabled={create.isPending || !text.trim()}>
            {create.isPending ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentsPanel({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate({ postId, text: text.trim() }, { onSuccess: () => setText('') });
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      {comments.isLoading && <Spinner />}
      {(comments.data ?? []).map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <Avatar name={c.author.name} />
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.author.name}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{timeAgo(c.createdAt)}</span>
            <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
          </div>
        </div>
      ))}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
      </form>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const like = useToggleLike();
  const [showComments, setShowComments] = useState(false);

  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar name={post.author.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {post.author.name}
            <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> @{post.author.handle}</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {timeAgo(post.createdAt)} ago{post.feeling ? ` · feeling ${post.feeling}` : ''}
          </div>
        </div>
      </div>

      {post.text && <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '12px 0 0' }}>{post.text}</p>}

      {post.media.length > 0 && (
        <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden' }}>
          {post.media.map((m) => (
            <img key={m.id} src={m.url} alt="" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', display: 'block' }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => like.mutate(post.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit',
            color: post.likedByMe ? 'var(--accent)' : 'var(--muted)', fontWeight: post.likedByMe ? 700 : 400,
          }}
        >
          {post.likedByMe ? '♥' : '♡'} {post.likes}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--muted)' }}
        >
          💬 {post.comments}
        </button>
      </div>

      {showComments && <CommentsPanel postId={post.id} />}
    </article>
  );
}

/** Social Life — the live city feed. */
export function SocialFeed() {
  const { user } = useAuth();
  const feed = useFeed();

  if (feed.isLoading) return <Spinner label="Loading the city feed…" />;
  if (feed.isError) return <EmptyState title="Couldn't load the feed" hint="Start the backend and reload." />;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Social Life · Feed</div>
      <h1 style={{ fontSize: 26, marginBottom: 18 }}>
        {user ? `What's happening, ${user.name.split(' ')[0]}` : 'The city feed'}
      </h1>
      <Composer />
      {(feed.data?.items ?? []).length === 0 ? (
        <EmptyState icon="🌆" title="No moments yet" hint="Be the first to share one." />
      ) : (
        feed.data?.items.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </div>
  );
}
