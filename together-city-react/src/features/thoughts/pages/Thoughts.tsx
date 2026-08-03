import { useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import {
  TAG_LEN, TAG_MAX,
  useCreateThought, useDeleteThought, useThoughts, useUpdateThought, type Thought,
} from '../api';

/**
 * A private journal.
 *
 * Three things were missing, all of the same kind — the backend could do it and
 * the page could not ask for it.
 *
 *  · A thought could not be EDITED. PATCH /thoughts/:id, thoughtsApi.update and
 *    useUpdateThought all existed; nothing rendered a control. The only way to
 *    fix a typo in your own journal was to delete the entry and write it again,
 *    which loses the day you wrote it.
 *  · The list STOPPED AT TWENTY. list() returns a nextCursor and useThoughts
 *    dropped it. Nothing said so — the journal simply ended.
 *  · TAGS could never be set. The store keeps up to eight, this card renders
 *    them as pills, and no form ever offered a way to type one.
 *
 * `updatedAt` came down with every thought and was never shown, so now that
 * editing exists the card says when an entry was changed. A journal where an
 * entry can quietly differ from what you remember writing is worse than one you
 * cannot edit at all.
 */

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

/** Edited only counts once it is past the write itself — createdAt and updatedAt
 *  differ by milliseconds on a fresh row, and "edited just now" on something you
 *  have never touched is a small lie the page does not need to tell. */
const wasEdited = (t: Thought): boolean =>
  new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() > 2000;

const fieldBase: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px',
  fontSize: 13.5, fontFamily: 'inherit', background: 'transparent', outline: 'none',
};

/** Tag entry, shared by the compose box and the edit form. Enter or comma adds. */
function TagField({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().slice(0, TAG_LEN);
    if (!t || tags.includes(t) || tags.length >= TAG_MAX) { setDraft(''); return; }
    onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map((tag) => (
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 11.5 }}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== tag))}
              aria-label={`Remove tag ${tag}`}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, lineHeight: 1, padding: '2px 4px', color: 'var(--muted)' }}>
              ×
            </button>
          </span>
        ))}
        {tags.length < TAG_MAX && (
          <input
            value={draft} maxLength={TAG_LEN}
            onChange={(e) => setDraft(e.target.value.replace(/,/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
            onBlur={add}
            placeholder={tags.length ? 'another tag' : 'Tags (optional)'}
            aria-label="Add a tag"
            style={{ flex: '0 1 150px', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
          />
        )}
      </div>
      {tags.length >= TAG_MAX && (
        <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
          That’s all {TAG_MAX} tags. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/** The edit form — the same fields the compose box has, filled in. */
function EditForm({ t, onCancel }: { t: Thought; onCancel: () => void }) {
  const update = useUpdateThought();
  const [title, setTitle] = useState(t.title ?? '');
  const [body, setBody] = useState(t.body);
  const [mood, setMood] = useState(t.mood ?? '');
  const [tags, setTags] = useState<string[]>(t.tags);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!body.trim()) return;
    setError(null);
    update.mutate(
      // title and mood send null, not undefined, when cleared. See ThoughtUpdate.
      { id: t.id, input: { title: title.trim() || null, body: body.trim(), mood: mood.trim() || null, tags } },
      { onSuccess: onCancel, onError: (e) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'That didn’t save. Try again.') },
    );
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
        placeholder="Title (optional)" aria-label="Title"
        style={{ ...fieldBase, fontWeight: 600, fontSize: 15 }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={20000}
        aria-label="What you wrote"
        style={{ ...fieldBase, lineHeight: 1.6, resize: 'vertical' }} />
      <input value={mood} onChange={(e) => setMood(e.target.value)} maxLength={24}
        placeholder="Mood (optional)" aria-label="Mood"
        style={{ ...fieldBase, borderRadius: 999, maxWidth: 200, fontSize: 12.5 }} />
      <TagField tags={tags} onChange={setTags} />
      {error && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant="accent" disabled={update.isPending || !body.trim()} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button size="sm" variant="line" disabled={update.isPending} onClick={onCancel}>Cancel</Button>
        <span className="muted" style={{ fontSize: 11 }}>The date you first wrote this is kept.</span>
      </div>
    </div>
  );
}

function Entry({ t, onDelete, busy }: { t: Thought; onDelete: (id: string) => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="card" style={{ padding: '16px 18px', marginBottom: 10 }}>
      {editing ? (
        <EditForm t={t} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            {t.title && <h2 style={{ fontSize: 16, margin: 0 }}>{t.title}</h2>}
            {t.mood && <span className="tag" style={{ fontSize: 11 }}>{t.mood}</span>}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
              {timeAgo(t.createdAt)}{wasEdited(t) ? ` · edited ${timeAgo(t.updatedAt)}` : ''}
            </span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{t.body}</p>
          {t.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {t.tags.map((tag) => (
                <span key={tag} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5 }}>{tag}</span>
              ))}
            </div>
          )}

          {confirming ? (
            // An inline confirm, like the one on People. window.confirm was a
            // blocking browser dialog in an app that confirms everything else
            // in place, and it could not say the one thing worth saying here.
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(192,57,43,.06)', border: '1px solid rgba(192,57,43,.25)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Delete this thought?</p>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
                It leaves your journal straight away, and there’s no screen here to bring it back.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="line" onClick={() => setConfirming(false)}>Keep it</Button>
                <Button size="sm" variant="line" disabled={busy}
                  style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
                  onClick={() => onDelete(t.id)}>
                  {busy ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button size="sm" variant="line" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" variant="line" disabled={busy}
                style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
                onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** A private journal. Nothing here is a post — it has no audience at all. */
export function Thoughts() {
  const [q, setQ] = useState('');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const thoughts = useThoughts(q.trim() || undefined);
  const create = useCreateThought();
  const remove = useDeleteThought();

  const submit = () => {
    if (!body.trim()) return;
    create.mutate(
      { body: body.trim(), title: title.trim() || undefined, mood: mood.trim() || undefined, tags: tags.length ? tags : undefined },
      { onSuccess: () => { setBody(''); setTitle(''); setMood(''); setTags([]); } },
    );
  };

  const items = (thoughts.data?.pages ?? []).flatMap((p) => p.items);

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ fontSize: 26 }}>Thoughts</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        A private journal. Only you can read these — they never reach the social feed, and no one is notified.
      </p>

      {/* Every field is a carved well now rather than a hairline underline. On a
          page this quiet the underline read as decoration, not as somewhere to
          type — and the Save key looked disabled at rest because a filled
          accent at 50% opacity is indistinguishable from a broken one. It is a
          pressed key with the reason beside it instead. */}
      <div className="g-slab" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <input
            className="g-field"
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
            placeholder="Title (optional)" aria-label="Title"
          />
          <textarea
            className="g-field"
            value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={20000}
            placeholder="What's on your mind?" aria-label="What's on your mind"
          />
          <TagField tags={tags} onChange={setTags} />
          <input
            className="g-field"
            value={mood} onChange={(e) => setMood(e.target.value)} maxLength={24}
            placeholder="Mood (optional)" aria-label="Mood"
          />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
          <span className="g-key sm" style={{ cursor: 'default' }}>
            <Icon name="journal" size={14} />Private to you
          </span>
          {!body.trim() && !create.isPending && (
            <span className="muted" style={{ fontSize: 12.5 }}>Write something to save it.</span>
          )}
          <button
            type="button" className="g-key g-edge" style={{ marginLeft: 'auto' }}
            disabled={create.isPending || !body.trim()}
            onClick={submit}
          >
            {create.isPending ? 'Saving…' : 'Save thought'}
          </button>
        </div>
      </div>

      {(items.length > 0 || q) && (
        <input
          className="g-field"
          value={q} onChange={(e) => setQ(e.target.value)} maxLength={120}
          placeholder="Search your thoughts" aria-label="Search your thoughts"
          style={{ marginBottom: 14 }}
        />
      )}

      {thoughts.isLoading ? (
        <Spinner label="Opening your journal…" />
      ) : thoughts.isError ? (
        // "Your journal is empty" is not a neutral sentence to read about your
        // own journal. Like "No records yet" in the medical vault, the first
        // thought it produces is not "the request failed" — it is that the
        // writing is gone. So this says the opposite thing explicitly, because
        // that is the question actually in somebody's head.
        <EmptyState
          title="We couldn’t open your journal"
          hint="Nothing has been lost — every entry is still there, we just couldn’t read them just now. Try again in a moment."
        />
      ) : items.length === 0 ? (
        <div className="g-slab g-empty">
          <span className="g-well big" style={{ margin: '0 auto 16px' }}><Icon name="journal" size={30} /></span>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.025em' }}>
            {q ? 'Nothing matches that' : 'Your journal is empty'}
          </div>
          <p className="muted" style={{ fontSize: 14, margin: '7px 0 0' }}>
            {q ? 'Try a different word.' : 'Write the first thing above — it stays private to you.'}
          </p>
        </div>
      ) : (
        <>
          {items.map((t) => (
            <Entry key={t.id} t={t} busy={remove.isPending} onDelete={(id) => remove.mutate(id)} />
          ))}
          {thoughts.hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <Button variant="line" size="sm" disabled={thoughts.isFetchingNextPage}
                onClick={() => void thoughts.fetchNextPage()}>
                {thoughts.isFetchingNextPage ? 'Loading…' : 'Show older thoughts'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
