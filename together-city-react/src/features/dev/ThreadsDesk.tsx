import { useState } from 'react';
import { Button, Card, Spinner } from '@/components/ui';
import { useDesk, type AccountState, type TopicInfo, type TopicKey } from './media.api';
import { threadsApi, usePostThread, LINK_ROOM, THREADS_LIMIT, type ThreadPosted } from './threads.api';

/**
 * ── THREADS — WORDS, NOT FILMS (owner, 18 Sep) ──────────────────────────────
 *
 * "Create a separate content posting page for threads … for content text
 * posting." One topic, one line, up to two follow-ups posted as replies to it.
 *
 * WHAT IT REFUSES TO PRETEND. A topic whose Threads profile is not connected
 * says so before anything is typed; the character counts are the platform's
 * own, and the first box stops short of 500 because the tracked hub link — off
 * by default, because a link costs reach on Threads — has to fit after it.
 * Styles are media-desk.css (prefix `md-`), like the video desk.
 */
const say = (e: unknown, fallback: string): string => {
  const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(raw) ? raw.join(', ') : raw ?? fallback;
};

function Result({ r }: { r: ThreadPosted }) {
  return (
    <Card className="md-card">
      <span className="md-tag md-ok">Posted</span>
      <span className="md-note">
        {r.posted} of {r.of} {r.of === 1 ? 'post' : 'posts'} live on @{r.handle}.
      </span>
      <a className="md-link" href={r.url} target="_blank" rel="noreferrer">Open the thread</a>
      {r.notice && <span className="md-small md-err">{r.notice}</span>}
      <span className="md-small">It is in Content analytics as a “text” post — the tab next door.</span>
    </Card>
  );
}

export function DevThreads({ password }: { password: string }) {
  const desk = useDesk(password);
  const send = usePostThread(password);
  const [topic, setTopic] = useState<TopicKey>('dating');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [ups, setUps] = useState<string[]>([]);
  const [hubLink, setHubLink] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<ThreadPosted | null>(null);

  const topics: TopicInfo[] = desk.data?.topics ?? [];
  const accounts: AccountState[] = desk.data?.accounts ?? [];
  const slot = accounts.find((a) => a.platform === 'threads' && a.topic === topic);
  const info = topics.find((t) => t.key === topic);
  const ready = Boolean(slot?.connected) && text.trim().length > 0;

  const draft = async () => {
    setDrafting(true); setMsg(null);
    try {
      const d = await threadsApi.suggest(password, { topic, note });
      setText(d.text);
      setUps(d.followUps);
    } catch (e) {
      setMsg(say(e, 'The words could not be drafted. Write them below.'));
    } finally { setDrafting(false); }
  };

  const post = () => {
    setMsg(null); setDone(null);
    send.mutate(
      { topic, text: text.trim(), followUps: ups.map((u) => u.trim()).filter(Boolean), hubLink, note: note.trim() || undefined },
      {
        onSuccess: (r) => { setDone(r); setNote(''); setText(''); setUps([]); },
        onError: (e) => setMsg(say(e, 'It did not post. Nothing was sent twice — read the reason and try again.')),
      },
    );
  };

  const setUp = (i: number, v: string) => setUps((list) => list.map((x, n) => (n === i ? v : x)));

  if (desk.isLoading) return <Spinner label="Reading the desk…" />;
  /* A DESK THAT DID NOT LOAD IS NOT AN EMPTY DESK. Without this the topic
     chips would simply be absent and the page would read as "no profiles",
     which is a claim about the accounts that nothing checked. */
  if (desk.isError) {
    return <p className="md-note md-err" role="status">{say(desk.error, 'The desk could not be read, so this page cannot say which profiles are connected. Reload the page.')}</p>;
  }

  return (
    <div className="md-wrap">
      <section className="md-section">
        <h3 className="md-h">Threads · text posts</h3>
        <p className="md-lead">
          One topic, one line, in that profile’s own voice. Threads pays off conversation, so end on a question and answer
          the replies. Films go on the Social tab; this page never uploads a video.
        </p>
      </section>

      <section className="md-section">
        <span className="md-label">Topic — decides the profile it posts as</span>
        <div className="md-chips">
          {topics.map((t) => {
            const s = accounts.find((a) => a.platform === 'threads' && a.topic === t.key);
            return (
              <button key={t.key} type="button" className="md-chip" aria-pressed={topic === t.key} onClick={() => setTopic(t.key)}>
                {t.label}
                <span className="md-chip-sub">{s?.connected ? `@${s.handle ?? s.expected}` : 'not connected'}</span>
              </button>
            );
          })}
        </div>
        {slot && !slot.connected && (
          <p className="md-note md-err">
            Threads is not connected for this topic ({slot.expected}). Connect it on the Social tab, then come back.
          </p>
        )}
      </section>

      <section className="md-section">
        <div className="md-form">
          <label className="md-field">
            <span className="md-label">One line about it — what the post is for</span>
            <input className="md-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Two Sides ep 3 — she said yes to the second date before he asked" />
          </label>
          <div className="md-line">
            <Button variant="line" disabled={drafting || !note.trim()} onClick={() => { void draft(); }}>
              {drafting ? 'Drafting…' : 'Draft the words'}
            </Button>
            <span className="md-small">Claude drafts a first post and up to two follow-ups. You edit before anything is sent.</span>
          </div>

          <label className="md-field">
            <span className="md-label">The post · {text.length}/{THREADS_LIMIT - LINK_ROOM}</span>
            <textarea className="md-input md-area" value={text} maxLength={THREADS_LIMIT - LINK_ROOM}
              onChange={(e) => setText(e.target.value)} placeholder="The thought, ending in a question somebody can answer." />
          </label>

          {ups.map((u, i) => (
            <label className="md-field" key={i}>
              <span className="md-label">Follow-up {i + 1} · posted as a reply · {u.length}/{THREADS_LIMIT}</span>
              <textarea className="md-input md-area" value={u} maxLength={THREADS_LIMIT} onChange={(e) => setUp(i, e.target.value)} />
            </label>
          ))}
          {ups.length < 2 && (
            <div className="md-line">
              <Button variant="line" size="sm" onClick={() => setUps((list) => [...list, ''])}>Add a follow-up</Button>
              <span className="md-small">Each one is a reply to the post above it, which is how a chain reads on Threads.</span>
            </div>
          )}
          {ups.length > 0 && (
            <div className="md-line">
              <Button variant="line" size="sm" onClick={() => setUps((list) => list.slice(0, -1))}>Remove the last follow-up</Button>
            </div>
          )}

          <label className="md-check">
            <input type="checkbox" checked={hubLink} onChange={(e) => setHubLink(e.target.checked)} />
            Add the {info?.hubPath ?? '/'} link, tagged for Content analytics — off by default, because a link costs reach on Threads
          </label>

          <div className="md-line">
            <Button disabled={!ready || send.isPending} onClick={post}>
              {send.isPending ? 'Posting…' : `Post to @${slot?.handle ?? slot?.expected ?? 'threads'}`}
            </Button>
            <span className="md-small">
              {ups.length ? `${ups.length + 1} posts, in order. ` : ''}Nothing is scheduled: it goes out now.
            </span>
          </div>
          {msg && <p className="md-note md-err" role="status">{msg}</p>}
        </div>
      </section>

      {done && (
        <section className="md-section">
          <h3 className="md-h">Just posted</h3>
          <Result r={done} />
        </section>
      )}
    </div>
  );
}
