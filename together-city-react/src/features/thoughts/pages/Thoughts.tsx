import { useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useCreateThought, useDeleteThought, useThoughts, type Thought } from '../api';

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

function Entry({ t, onDelete, busy }: { t: Thought; onDelete: (id: string) => void; busy: boolean }) {
  return (
    <article className="card" style={{ padding: '16px 18px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {t.title && <h2 style={{ fontSize: 16, margin: 0 }}>{t.title}</h2>}
        {t.mood && <span className="tag" style={{ fontSize: 11 }}>{t.mood}</span>}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{timeAgo(t.createdAt)}</span>
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{t.body}</p>
      {t.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {t.tags.map((tag) => (
            <span key={tag} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5 }}>{tag}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Button
          size="sm" variant="line" disabled={busy}
          style={{ color: '#c62828', borderColor: '#f0b0b0' }}
          onClick={() => { if (window.confirm('Delete this thought?')) onDelete(t.id); }}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}

/** A private journal. Nothing here is a post — it has no audience at all. */
export function Thoughts() {
  const [q, setQ] = useState('');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState('');

  const thoughts = useThoughts(q.trim() || undefined);
  const create = useCreateThought();
  const remove = useDeleteThought();

  const submit = () => {
    if (!body.trim()) return;
    create.mutate(
      { body: body.trim(), title: title.trim() || undefined, mood: mood.trim() || undefined },
      { onSuccess: () => { setBody(''); setTitle(''); setMood(''); } },
    );
  };

  const items = thoughts.data?.items ?? [];

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ fontSize: 26 }}>Thoughts</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        A private journal. Only you can read these — they never reach the social feed, and no one is notified.
      </p>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 20 }}>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
          placeholder="Title (optional)"
          style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--line)', padding: '6px 0', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
        />
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={20000}
          placeholder="What's on your mind?"
          style={{ width: '100%', border: 'none', padding: '10px 0', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', background: 'transparent', outline: 'none', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={mood} onChange={(e) => setMood(e.target.value)} maxLength={24}
            placeholder="Mood (optional)"
            style={{ flex: '0 1 160px', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
          />
          <Button
            variant="accent" size="sm" style={{ marginLeft: 'auto' }}
            disabled={create.isPending || !body.trim()}
            onClick={submit}
          >
            {create.isPending ? 'Saving…' : 'Save thought'}
          </Button>
        </div>
      </div>

      {(items.length > 0 || q) && (
        <input
          value={q} onChange={(e) => setQ(e.target.value)} maxLength={120}
          placeholder="Search your thoughts"
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', outline: 'none', marginBottom: 14 }}
        />
      )}

      {thoughts.isLoading ? (
        <Spinner label="Opening your journal…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="📓"
          title={q ? 'Nothing matches that' : 'Your journal is empty'}
          hint={q ? 'Try a different word.' : 'Write the first thing above — it stays private to you.'}
        />
      ) : (
        items.map((t) => (
          <Entry key={t.id} t={t} busy={remove.isPending} onDelete={(id) => remove.mutate(id)} />
        ))
      )}
    </div>
  );
}
