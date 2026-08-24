import { useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
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
 *
 * THE GLASS CAME OFF, 15 Aug. Every control on this page was a `.g-field` — a
 * white well on a white slab — and the owner's screenshot showed the result: a
 * form with four inputs in it, none of which looked like somewhere to type, and
 * a Save key that read as disabled at rest. The fields are hairline boxes on the
 * city's own paper now, the mood is a row rather than a text box you have to
 * think of a word for, and the one black button on the screen is the one that
 * saves. See the SOCIAL LIFE — THE SHEET block in relief.css for the argument.
 */

/** BODY_MAX mirrors CreateThoughtSchema, so the counter under the box is the
 *  server's real ceiling rather than a number chosen to look tidy. */
const BODY_MAX = 20_000;
const TITLE_MAX = 140;
const MOOD_MAX = 24;

/**
 * SIX WORDS AND A DOOR. `mood` is free text on the server (24 characters), and
 * it stayed free text here — these are a shortcut to the six people actually
 * write, and "More" opens the box for the seventh. A chip that could only ever
 * set one of six values would be a narrowing of the column, not a shortcut to it.
 */
const MOODS: ReadonlyArray<{ label: string; icon: IconName }> = [
  { label: 'Happy', icon: 'mood' },
  { label: 'Calm', icon: 'personal' },
  { label: 'Thoughtful', icon: 'chat' },
  { label: 'Motivated', icon: 'sparkles' },
  { label: 'Tired', icon: 'clock' },
];

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
      <div className="sl-field sl-tagfield">
        <span className="sl-hash" aria-hidden><Icon name="hash" size={15} /></span>
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== tag))}
              aria-label={`Remove tag ${tag}`}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 0, padding: 0, color: 'var(--muted)', display: 'inline-flex' }}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {tags.length < TAG_MAX && (
          <input
            value={draft} maxLength={TAG_LEN}
            onChange={(e) => setDraft(e.target.value.replace(/,/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
            onBlur={add}
            placeholder={tags.length ? 'another tag…' : 'Add a tag…'}
            aria-label="Add a tag"
          />
        )}
      </div>
      <p className="sl-hint">
        {tags.length >= TAG_MAX
          ? `That’s all ${TAG_MAX} tags. Remove one to add another.`
          : 'Press Enter or a comma to add one.'}
      </p>
    </div>
  );
}

/** The six-chip row plus the box behind it. `other` is open when the mood in
 *  hand is not one of the six, so an existing entry never loses its word. */
function MoodRow({ mood, onChange }: { mood: string; onChange: (next: string) => void }) {
  const listed = MOODS.some((m) => m.label === mood);
  const [other, setOther] = useState(Boolean(mood) && !listed);
  return (
    <div>
      <div className="sl-moods">
        {MOODS.map((m) => (
          <button key={m.label} type="button" aria-pressed={mood === m.label}
            className={`sl-mood${mood === m.label ? ' on' : ''}`}
            onClick={() => { setOther(false); onChange(mood === m.label ? '' : m.label); }}>
            <Icon name={m.icon} size={19} />
            <span className="sl-mood-l">{m.label}</span>
          </button>
        ))}
        <button type="button" aria-pressed={other}
          className={`sl-mood${other ? ' on' : ''}`}
          onClick={() => { setOther((o) => !o); if (listed) onChange(''); }}>
          <Icon name="more" size={19} />
          <span className="sl-mood-l">More</span>
        </button>
      </div>
      {other && (
        <input className="sl-field" style={{ marginTop: 8 }}
          value={listed ? '' : mood} onChange={(e) => onChange(e.target.value)} maxLength={MOOD_MAX}
          placeholder="In a word — how does today feel?" aria-label="Mood" />
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
    <div style={{ display: 'grid', gap: 12 }}>
      <input className="sl-field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX}
        placeholder="Title (optional)" aria-label="Title" style={{ fontWeight: 600, fontSize: 15 }} />
      <textarea className="sl-field" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={BODY_MAX}
        aria-label="What you wrote" />
      <div>
        <span className="sl-lab">Mood <em>(optional)</em></span>
        <MoodRow mood={mood} onChange={setMood} />
      </div>
      <div>
        <span className="sl-lab">Tags <em>(optional)</em></span>
        <TagField tags={tags} onChange={setTags} />
      </div>
      {error && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}

          {confirming ? (
            // An inline confirm, like the one on People. window.confirm was a
            // blocking browser dialog in an app that confirms everything else
            // in place, and it could not say the one thing worth saying here.
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-1)', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)' }}>
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

  /* THE JOURNAL CARRIES ITS OWN PAGE GRID NOW. It used to render inside a
     hub layout, which supplied the 1180px column and the gutter; it moved
     out with Personal (15 Aug), where its rooms are city-level pages, so
     the wrapper it was borrowing comes with it. */
  return (
    <div className="page">
      <div className="sl-head">
        <div className="sl-head-t">
          <div className="eyebrow">Together City</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            Thoughts
            <span className="sl-ic sm flat amber" aria-hidden><Icon name="shield" size={17} /></span>
          </h1>
          <p>A private journal — only you can read it.</p>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <input
            className="sl-field"
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX}
            placeholder="Title (optional)" aria-label="Title"
          />
          <div className="sl-wrap">
            <textarea
              className="sl-field"
              value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={BODY_MAX}
              placeholder="What's on your mind?" aria-label="What's on your mind"
              style={{ paddingBottom: 32 }}
            />
            {/* The ceiling is the server's own, not a round number: a counter
                that stops you somewhere the API would not is a form telling a
                small lie about the thing behind it. */}
            <span className="sl-count">{body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}</span>
          </div>
          <div>
            <span className="sl-lab">Add tags <em>(optional)</em></span>
            <TagField tags={tags} onChange={setTags} />
          </div>
          <div>
            <span className="sl-lab">Mood <em>(optional)</em></span>
            <MoodRow mood={mood} onChange={setMood} />
          </div>
        </div>

        <div className="sl-priv" style={{ marginTop: 16 }}>
          <span className="sl-ic sm" aria-hidden><Icon name="shield" size={17} /></span>
          <span className="sl-priv-t">
            <b>Private to you</b>
            <span>This thought is only ever visible to you.</span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          {!body.trim() && !create.isPending && (
            <span className="muted" style={{ fontSize: 12.5 }}>Write something to save it.</span>
          )}
          <button
            type="button" className="btn btn-accent" style={{ marginLeft: 'auto' }}
            disabled={create.isPending || !body.trim()}
            onClick={submit}
          >
            <Icon name="journal" size={16} />
            {create.isPending ? 'Saving…' : 'Save thought'}
          </button>
        </div>
      </div>

      {(items.length > 0 || q) && (
        <div className="sl-field sl-tagfield" style={{ marginBottom: 14 }}>
          <span className="sl-hash" aria-hidden><Icon name="search" size={16} /></span>
          <input
            type="search"
            value={q} onChange={(e) => setQ(e.target.value)} maxLength={120}
            placeholder="Search your thoughts" aria-label="Search your thoughts"
          />
        </div>
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
          hint="Nothing has been lost — try again in a moment."
        />
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <span className="sl-ic lg" style={{ margin: '0 auto 16px' }}><Icon name="journal" size={30} /></span>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.025em' }}>
            {q ? 'Nothing matches that' : 'Your journal is empty'}
          </div>
          <p className="muted" style={{ fontSize: 14, margin: '7px 0 0' }}>
            {q ? 'Try a different word.' : 'Write the first thing above.'}
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
