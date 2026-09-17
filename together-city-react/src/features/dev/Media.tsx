import { useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { mediaApi as cityMedia } from '@/api/media.api';
import {
  mediaApi, useDesk, useMediaAction, useMediaPosts, SIGNIN_MESSAGE,
  type AccountState, type ChannelKey, type ChannelState, type DeskState, type MediaPost, type MediaTarget,
  type PlatformKey, type SignInMessage, type TopicKey,
} from './media.api';

/**
 * ── TOGETHER SOCIAL — THE MEDIA DESK (owner, 9 Sep; rebuilt 17 Sep) ─────────
 *
 * "Create a together social media page where I upload the video there and all
 * details are automatically uploaded on youtube and instagram channels from
 * there, connect dating with dating site, health with health."
 *
 * Three parts, top to bottom: the eighteen ACCOUNTS (a topic's YouTube
 * channel, Instagram account and Threads profile), a NEW VIDEO (topic, file,
 * one line → drafted words the owner edits → Publish), and THE DESK (every
 * upload, one row per destination, the platform's own link or its own error).
 *
 * WHAT THIS PAGE MUST NOT DO is look finished when it is not. A platform whose
 * app is not set up on the server says which variable is missing; a slot with
 * no sign-in says so on the upload before Publish is pressed; YouTube's
 * private-until-audited rule is shown on the row it applied to. Styles live in
 * styles/media-desk.css (prefix `md-`), not inline.
 */

const PLATFORMS: PlatformKey[] = ['youtube', 'instagram', 'threads'];
const DESTINATIONS: Array<{ key: ChannelKey; label: string }> = [
  { key: 'youtube', label: 'YouTube' }, { key: 'instagram', label: 'Instagram Reel' },
  { key: 'threads', label: 'Threads' }, { key: 'tv', label: 'Together TV' },
];

const say = (e: unknown, fallback: string): string => {
  const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(raw) ? raw.join(', ') : raw ?? fallback;
};

/* ─────────────────────────── the accounts ─────────────────────────── */

function SetupCard({ c }: { c: ChannelState }) {
  return (
    <div className="card md-card">
      <div className="md-line">
        <strong>{c.label}</strong>
        <span className={c.configured ? 'md-tag md-ok' : 'md-tag md-bad'}>{c.configured ? 'set up' : 'not set up'}</span>
      </div>
      <p className="md-small">{c.limit}</p>
      {c.missing.length > 0 && <p className="md-small">Missing on the server: <code>{c.missing.join(', ')}</code></p>}
      {c.obtain.length > 0 && (
        <Fold face="fold" panel="fold-open" title="How to set it up" meta={`${c.obtain.length} steps`}>
          <ol className="md-steps">{c.obtain.map((s) => <li key={s}>{s}</li>)}</ol>
        </Fold>
      )}
    </div>
  );
}

function Slot({ a, configured, password, onError }: { a: AccountState; configured: boolean; password: string; onError: (m: string) => void }) {
  const act = useMediaAction(password);
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await mediaApi.connect(password, a.platform, a.topic);
      // A pop-up, so the desk — and the password it holds — stays open behind it.
      const w = window.open(url, 'tc-social-signin', 'popup,width=520,height=720');
      if (!w) onError('The browser blocked the sign-in window. Allow pop-ups for this site and press Connect again.');
    } catch (e) {
      onError(say(e, 'Could not start the sign-in.'));
    } finally { setBusy(false); }
  };
  return (
    <td className="md-slot">
      {a.connected
        ? <span className="md-tag md-ok">{a.handle}</span>
        : <span className="md-small">{a.expected}</span>}
      {a.lastError && <span className="md-small md-err" title={a.lastError}>needs attention</span>}
      <span className="md-slot-acts">
        <Button variant="line" size="sm" disabled={!configured || busy} onClick={() => { void connect(); }}>
          {a.connected ? 'Reconnect' : 'Connect'}
        </Button>
        {a.connected && (
          <Button variant="ghost" size="sm" disabled={act.disconnect.isPending}
            onClick={() => act.disconnect.mutate({ platform: a.platform, topic: a.topic })}>Forget</Button>
        )}
      </span>
    </td>
  );
}

function Accounts({ desk, password }: { desk: DeskState; password: string }) {
  const act = useMediaAction(password);
  const [note, setNote] = useState<string | null>(null);
  /* The pop-up comes back through here: same origin, the right message type,
     and only then is the code sent on — with the password — to the API. */
  const finish = act.finish.mutate;
  useEffect(() => {
    const onMessage = (ev: MessageEvent<SignInMessage>) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== SIGNIN_MESSAGE) return;
      if (ev.data.error || !ev.data.code || !ev.data.state) {
        setNote(`Not connected: ${ev.data.error ?? 'the platform did not hand back a code.'}`);
        return;
      }
      setNote('Checking which account that was…');
      finish({ code: ev.data.code, state: ev.data.state }, {
        onSuccess: (a) => setNote(`Connected ${a.handle} for ${a.topic}.`),
        onError: (e) => setNote(say(e, 'That sign-in could not be finished.')),
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finish]);

  const ready = (p: PlatformKey) => desk.channels.find((c) => c.key === p)?.configured ?? false;
  return (
    <section className="md-section">
      <h3 className="md-h">Accounts</h3>
      <p className="md-lead">
        <strong>One sign-in per topic per platform.</strong> Press Connect and sign in as the
        account named in the box. A sign-in as anybody else is refused and nothing is saved.
        That matters most on YouTube, where all six channels share one Google login.
      </p>
      <div className="md-scroll">
        <table className="md-table">
          <thead>
            <tr><th scope="col">Topic</th>{PLATFORMS.map((p) => <th scope="col" key={p}>{desk.channels.find((c) => c.key === p)?.label}</th>)}</tr>
          </thead>
          <tbody>
            {desk.topics.map((t) => (
              <tr key={t.key}>
                <th scope="row">{t.label}<span className="md-small">togethercity.app{t.hubPath === '/' ? '' : t.hubPath}</span></th>
                {PLATFORMS.map((p) => {
                  const a = desk.accounts.find((x) => x.platform === p && x.topic === t.key);
                  return a ? <Slot key={p} a={a} configured={ready(p)} password={password} onError={setNote} /> : <td key={p} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="md-note" role="status">{note}</p>}
      <div className="md-grid">
        {desk.channels.filter((c) => c.key !== 'tv').map((c) => <SetupCard key={c.key} c={c} />)}
      </div>
    </section>
  );
}

/* ─────────────────────────── a new video ─────────────────────────── */

function NewVideo({ desk, password }: { desk: DeskState; password: string }) {
  const act = useMediaAction(password);
  const [topic, setTopic] = useState<TopicKey>('dating');
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [series, setSeries] = useState('');
  const [episode, setEpisode] = useState('');
  const [campaign, setCampaign] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [caption, setCaption] = useState('');
  const [threads, setThreads] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  /* On by default (owner, 17 Sep: every film is made with AI). YouTube and
     Meta require the label on realistic AI video, and a missing label, not the
     label, is what puts a channel's monetisation at risk. */
  const [ai, setAi] = useState(true);
  const [chosen, setChosen] = useState<ChannelKey[]>(['youtube', 'instagram', 'threads', 'tv']);
  const [drafting, setDrafting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const uploadFor = useRef<File | null>(null);

  /* The upload starts the moment a file is chosen, so a two-gigabyte film is
     on its way while the words are being written. */
  const pick = async (f: File | null) => {
    setFile(f); setKey(null); setMsg(null);
    uploadFor.current = f;
    if (!f) { setProgress(null); return; }
    setProgress(0);
    try {
      const k = await cityMedia.uploadPost(f, (x) => { if (uploadFor.current === f) setProgress(x); });
      if (uploadFor.current === f) { setKey(k); setProgress(1); }
    } catch (e) {
      if (uploadFor.current === f) { setProgress(null); setMsg(say(e, 'The upload did not finish. Choose the file again.')); }
    }
  };

  const draft = async () => {
    setDrafting(true); setMsg(null);
    try {
      const d = await mediaApi.suggest(password, { topic, note, fileName: file?.name ?? '' });
      setTitle(d.title); setDescription(d.description); setTags(d.tags.join(', '));
      setCaption(d.caption); setThreads(d.threadsText);
    } catch (e) {
      setMsg(say(e, 'The words could not be drafted. Write them below.'));
    } finally { setDrafting(false); }
  };

  const send = (publish: boolean) => {
    if (!key) return;
    setMsg(null);
    act.create.mutate({
      topic, storageKey: key, note: note.trim() || undefined, title: title.trim(), description,
      series: series.trim() || undefined, episode: episode.trim() || undefined, campaign: campaign.trim() || undefined,
      tags: tags.split(',').map((x) => x.trim()).filter(Boolean), caption, threadsText: threads,
      privacy, aiDisclosure: ai, channels: chosen, publish,
    }, {
      onSuccess: () => {
        setFile(null); setKey(null); setProgress(null); uploadFor.current = null;
        setNote(''); setEpisode(''); setTitle(''); setDescription(''); setTags(''); setCaption(''); setThreads(''); setAi(true);
        setMsg(publish ? 'On its way. Each destination has its own row below.' : 'Saved as a draft below. Nothing has left the building.');
      },
      onError: (e) => {
        /* A video the city's screen refused has been DELETED from the bucket,
           so the key is dead: forget it, and the file must be chosen again. */
        if ((e as { response?: { data?: { mediaDiscarded?: boolean } } })?.response?.data?.mediaDiscarded) {
          setKey(null); setProgress(null); setFile(null); uploadFor.current = null;
        }
        setMsg(say(e, 'That could not be saved.'));
      },
    });
  };

  const slot = (p: PlatformKey) => desk.accounts.find((a) => a.platform === p && a.topic === topic);
  const t = desk.topics.find((x) => x.key === topic);
  const uploading = progress !== null && progress < 1;

  return (
    <Card>
      <h3 className="md-h">New video</h3>
      <div className="md-form">
        <div>
          <span className="md-label">Topic — decides the channel, the accounts and the hub it links to</span>
          <div className="md-chips">
            {desk.topics.map((x) => (
              <button key={x.key} type="button" className="md-chip" aria-pressed={x.key === topic} onClick={() => setTopic(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          {t && (
            <p className="md-small">
              Links to togethercity.app{t.hubPath === '/' ? '' : t.hubPath} · adds {t.hashtags.join(' ')}
              {t.disclaimer ? ` · always says “${t.disclaimer}”` : ''}
            </p>
          )}
        </div>

        <label className="md-field">
          <span className="md-label">The video</span>
          <input type="file" accept="video/*" className="md-input" onChange={(e) => { void pick(e.target.files?.[0] ?? null); }} />
          {file && (
            <span className="md-small">
              {file.name} · {(file.size / 1_048_576).toFixed(1)} MB ·{' '}
              {key ? 'uploaded' : uploading ? `uploading ${Math.round((progress ?? 0) * 100)}%` : 'not uploaded'}
            </span>
          )}
        </label>

        <label className="md-field">
          <span className="md-label">One line about it</span>
          <input className="md-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Neel and Isha, episode 3 — she finally says what she wants" />
        </label>
        {/* The series, episode and campaign are what Content analytics groups
            and filters by; the series and campaign stay for the next upload. */}
        <div className="md-line">
          <label className="md-field md-grow">
            <span className="md-label">Series · optional</span>
            <input className="md-input" value={series} maxLength={120} onChange={(e) => setSeries(e.target.value)} placeholder="e.g. Two Sides" />
          </label>
          <label className="md-field md-grow">
            <span className="md-label">Episode · optional</span>
            <input className="md-input" value={episode} maxLength={120} onChange={(e) => setEpisode(e.target.value)} placeholder="e.g. Episode 3" />
          </label>
          <label className="md-field md-grow">
            <span className="md-label">Campaign · optional</span>
            <input className="md-input" value={campaign} maxLength={120} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. October launch" />
          </label>
        </div>
        <div className="md-line">
          <Button variant="line" disabled={drafting || (!note.trim() && !file)} onClick={() => { void draft(); }}>
            {drafting ? 'Drafting…' : 'Draft the words'}
          </Button>
          <span className="md-small">Claude drafts them to this channel's formula. You edit before anything is sent.</span>
        </div>

        <label className="md-field">
          <span className="md-label">Title · YouTube and Together TV · {title.length}/100</span>
          <input className="md-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="md-field">
          <span className="md-label">Description · YouTube · the hub link, disclaimer and hashtags are added after it</span>
          <textarea className="md-input md-area" value={description} maxLength={4500} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="md-field">
          <span className="md-label">Tags · YouTube · separated by commas</span>
          <input className="md-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="md-field">
          <span className="md-label">Caption · Instagram and Together TV · {caption.length}/2000</span>
          <textarea className="md-input md-area" value={caption} maxLength={2000} onChange={(e) => setCaption(e.target.value)} />
        </label>
        <label className="md-field">
          <span className="md-label">Threads · {threads.length}/400 · the hub link is added after it</span>
          <textarea className="md-input" value={threads} maxLength={400} onChange={(e) => setThreads(e.target.value)} />
        </label>

        <div className="md-line">
          <label className="md-field">
            <span className="md-label">YouTube visibility</span>
            <select className="md-input" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="md-check">
            <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
            <span>Made with realistic AI visuals — sets YouTube&rsquo;s altered-content flag and says so in every post</span>
          </label>
        </div>

        <div>
          <span className="md-label">Where it goes</span>
          <div className="md-chips">
            {DESTINATIONS.map((d) => {
              const on = chosen.includes(d.key);
              const s = d.key === 'tv' ? null : slot(d.key);
              return (
                <button key={d.key} type="button" className="md-chip" aria-pressed={on}
                  onClick={() => setChosen((cur) => (on ? cur.filter((k) => k !== d.key) : [...cur, d.key]))}>
                  {d.label}
                  {s && <span className="md-chip-sub">{s.connected ? s.handle : 'not connected'}</span>}
                </button>
              );
            })}
          </div>
          <p className="md-small">
            A destination that is not connected can still be ticked. Its row will say it was skipped,
            and Try again sends it once the account is connected. Without Together TV, the video
            is still kept as a private post that only you see, because the other three are made from it.
          </p>
        </div>

        <div className="md-line">
          <Button variant="accent" disabled={!key || !title.trim() || chosen.length === 0 || act.create.isPending}
            onClick={() => send(true)}>
            {act.create.isPending ? 'Sending…' : uploading ? 'Uploading…' : 'Publish now'}
          </Button>
          <Button variant="line" disabled={!key || !title.trim() || chosen.length === 0 || act.create.isPending}
            onClick={() => send(false)}>Save as draft</Button>
          {msg && <span className="md-note" role="status">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────── the desk ─────────────────────────── */

const TONE: Record<MediaTarget['state'], string> = {
  posted: 'md-tag md-ok', failed: 'md-tag md-bad', publishing: 'md-tag md-busy', skipped: 'md-tag', pending: 'md-tag',
};

/** A row still "publishing" two hours on was lost with a restarted worker. */
const STUCK_MS = 2 * 3600 * 1000;
const stuck = (at: string | null) => Boolean(at) && Date.now() - new Date(at as string).getTime() > STUCK_MS;

function TargetRow({ post, target, password }: { post: MediaPost; target: MediaTarget; password: string }) {
  const act = useMediaAction(password);
  const label = DESTINATIONS.find((d) => d.key === target.channel)?.label ?? target.channel;
  return (
    <div className="md-target">
      <span className="md-target-name">{label}</span>
      <span className={TONE[target.state]}>{target.state}</span>
      {target.externalUrl && (
        <a className="md-link" href={target.externalUrl} target={target.channel === 'tv' ? undefined : '_blank'} rel="noreferrer">see the post</a>
      )}
      {/* THE PLATFORM'S OWN WORDS, not a rephrasing. */}
      {(target.error || target.skipReason || target.notice) && (
        <span className={target.error ? 'md-small md-err md-why' : 'md-small md-why'}>
          {target.error ?? target.skipReason ?? target.notice}
        </span>
      )}
      {(target.state === 'failed' || target.state === 'skipped' || (target.state === 'publishing' && stuck(target.startedAt)))
        && target.channel !== 'tv' && (
        <Button variant="line" size="sm" disabled={act.retry.isPending}
          onClick={() => act.retry.mutate({ id: post.id, channel: target.channel })}>
          {act.retry.isPending ? 'Trying…' : 'Try again'}
        </Button>
      )}
      {target.attempts > 1 && <span className="md-small">{target.attempts} attempts</span>}
    </div>
  );
}

function PostRow({ post, password }: { post: MediaPost; password: string }) {
  const act = useMediaAction(password);
  const posted = post.targets.filter((x) => x.state === 'posted').length;
  const waiting = post.targets.some((x) => x.state === 'pending')
    && (post.state !== 'publishing' || stuck(post.updatedAt));
  return (
    <div className="card md-card">
      <div className="md-line">
        <span className="md-grow">
          <strong>{post.title ?? 'Untitled'}</strong>
          <span className="md-small">
            {' '}{post.topic} · {new Date(post.createdAt).toLocaleString()} · {posted} of {post.targets.length} out
          </span>
        </span>
        <span className={post.state === 'done' ? 'md-tag md-ok' : post.state === 'failed' ? 'md-tag md-bad' : post.state === 'publishing' ? 'md-tag md-busy' : 'md-tag'}>
          {post.state}
        </span>
      </div>
      {post.state === 'publishing' && (
        <p className="md-small">Together TV prepares the video first, then it goes to each platform. This page checks every 15 seconds.</p>
      )}
      {post.targets.map((x) => <TargetRow key={x.id} post={post} target={x} password={password} />)}
      <div className="md-line">
        {waiting && (
          <Button variant="accent" size="sm" disabled={act.publish.isPending} onClick={() => act.publish.mutate(post.id)}>
            {act.publish.isPending ? 'Sending…' : 'Publish now'}
          </Button>
        )}
        <Button variant="line" size="sm" disabled={act.remove.isPending} onClick={() => act.remove.mutate(post.id)}>
          Remove from the desk
        </Button>
        {/* SAID WHERE THE BUTTON IS. Nothing here can take a post down anywhere. */}
        <span className="md-small">Removes this record only. Anything published stays up, including the Together TV post.</span>
      </div>
    </div>
  );
}

export function DevMedia({ password }: { password: string }) {
  const desk = useDesk(password);
  const posts = useMediaPosts(password);

  if (desk.isLoading) return <Spinner label="Reading the desk…" />;
  /* NOT "no destinations". A failed read is not an empty list. */
  if (desk.isError || !desk.data) {
    return <EmptyState icon="⚠️" title="Couldn't read the desk"
      hint="The list did not come back. The desk needs the dev password and a console grant (notify.send). Those are the usual reasons." />;
  }
  return (
    <div className="md-wrap">
      <Accounts desk={desk.data} password={password} />
      <NewVideo desk={desk.data} password={password} />
      <section className="md-section">
        <h3 className="md-h">The desk</h3>
        {posts.isLoading ? <Spinner label="Reading the desk…" />
          : posts.isError ? <EmptyState icon="⚠️" title="Couldn't read the desk" hint="Nothing has been lost. The list did not come back." />
          : !posts.data?.length ? <EmptyState title="Nothing on the desk yet" hint="Upload a video above." />
          : <div className="md-list">{posts.data.map((p) => <PostRow key={p.id} post={p} password={password} />)}</div>}
      </section>
    </div>
  );
}
